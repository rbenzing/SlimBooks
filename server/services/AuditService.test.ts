/**
 * The audit trail, against a real SQLite database.
 *
 * Two properties carry the weight here and neither is obvious from the code:
 * a record must survive deletion of the account it describes, and a failure to
 * write a record must never fail the operation being recorded. Both are
 * asserted rather than assumed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeDatabase, db, closeDatabase } from '../database/index.js';
import { auditService } from './AuditService.js';
import { databaseService } from '../core/DatabaseService.js';

let dataDir: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'slimbooks-audit-'));
  const dbFile = join(dataDir, 'test.db');

  await initializeDatabase({
    paths: { dataDir, dbFile },
    database: { driver: 'sqlite', file: dbFile, timeoutMs: 5000 }
  });
});

afterEach(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('AuditService', () => {
  it('writes a record that can be read back with its actor, target and address', async () => {
    await auditService.record({
      action: 'user.role_change',
      outcome: 'success',
      actorUserId: 1,
      actorEmail: 'admin@example.com',
      targetType: 'user',
      targetId: 42,
      ipAddress: '203.0.113.7',
      details: { newRole: 'admin' }
    });

    const [record] = await auditService.list();

    expect(record).toMatchObject({
      action: 'user.role_change',
      outcome: 'success',
      actor_user_id: 1,
      actor_email: 'admin@example.com',
      target_type: 'user',
      target_id: '42',
      ip_address: '203.0.113.7'
    });
    expect(JSON.parse(record!.details!)).toEqual({ newRole: 'admin' });
  });

  it('stores occurred_at as epoch milliseconds, not a formatted string', async () => {
    // ADR-0009. A text timestamp here would sort lexicographically and break
    // every range query the trail exists to answer.
    const before = Date.now();
    await auditService.record({ action: 'auth.login', outcome: 'success' });

    const [record] = await auditService.list();

    expect(typeof record!.occurred_at).toBe('number');
    expect(record!.occurred_at).toBeGreaterThanOrEqual(before - 1000);
  });

  it('records a failed login for an address with no account at all', async () => {
    // The actor is unknown by id, which is precisely the case a foreign key
    // would have made impossible to store.
    await auditService.record({
      action: 'auth.login',
      outcome: 'failure',
      actorEmail: 'nobody@example.com',
      ipAddress: '198.51.100.4',
      details: { reason: 'no_such_account' }
    });

    const [record] = await auditService.list();

    expect(record!.actor_user_id).toBeNull();
    expect(record!.actor_email).toBe('nobody@example.com');
    expect(record!.outcome).toBe('failure');
  });

  it('survives deletion of the user it describes', async () => {
    await databaseService.executeQuery(
      `INSERT INTO users (id, name, username, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [99, 'Doomed Admin', 'doomed', 'doomed@example.com', 'x', 'admin', Date.now(), Date.now()]
    );

    await auditService.record({
      action: 'user.delete',
      outcome: 'success',
      actorUserId: 99,
      actorEmail: 'doomed@example.com',
      targetType: 'user',
      targetId: 99
    });

    await databaseService.executeQuery('DELETE FROM users WHERE id = ?', [99]);

    const [record] = await auditService.list();

    // "Who deleted the administrator" is asked after the administrator is gone.
    expect(record!.actor_user_id).toBe(99);
    expect(record!.actor_email).toBe('doomed@example.com');
  });

  it('never throws when the write fails, so a broken trail cannot break a login', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(databaseService, 'executeQuery').mockRejectedValue(new Error('disk full'));

    await expect(
      auditService.record({ action: 'auth.login', outcome: 'success', actorUserId: 1 })
    ).resolves.toBeUndefined();

    // Swallowed, but loudly — a silent failure would be worse than no trail.
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('AUDIT WRITE FAILED'),
      'disk full'
    );
  });

  it('returns newest first', async () => {
    await auditService.record({ action: 'auth.login', outcome: 'success', actorUserId: 1 });
    await auditService.record({ action: 'auth.logout', outcome: 'success', actorUserId: 1 });

    const records = await auditService.list();

    expect(records.map(r => r.action)).toEqual(['auth.logout', 'auth.login']);
  });

  it('filters by action and by actor', async () => {
    await auditService.record({ action: 'auth.login', outcome: 'success', actorUserId: 1 });
    await auditService.record({ action: 'auth.login', outcome: 'failure', actorUserId: 2 });
    await auditService.record({ action: 'user.delete', outcome: 'success', actorUserId: 1 });

    expect(await auditService.list({ action: 'auth.login' })).toHaveLength(2);
    expect(await auditService.list({ actorUserId: 1 })).toHaveLength(2);
    expect(await auditService.list({ action: 'auth.login', actorUserId: 2 })).toHaveLength(1);
  });

  it('clamps the page size rather than letting a caller pull the whole table', async () => {
    for (let i = 0; i < 5; i += 1) {
      await auditService.record({ action: 'auth.login', outcome: 'success', actorUserId: i });
    }

    expect(await auditService.list({ limit: 2 })).toHaveLength(2);
    // Above the cap and below the floor both resolve to something sane.
    expect((await auditService.list({ limit: 10_000 })).length).toBeLessThanOrEqual(200);
    expect((await auditService.list({ limit: -5 })).length).toBeGreaterThan(0);
  });

  it('prunes records past the retention window and keeps the rest', async () => {
    await auditService.record({ action: 'auth.login', outcome: 'success', actorUserId: 1 });

    // Backdate one record by 100 days.
    await databaseService.executeQuery(
      'UPDATE audit_log SET occurred_at = ? WHERE id = 1',
      [Date.now() - 100 * 24 * 60 * 60 * 1000]
    );
    await auditService.record({ action: 'auth.logout', outcome: 'success', actorUserId: 1 });

    const pruned = await auditService.prune(90);

    expect(pruned).toBe(1);
    const remaining = await auditService.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.action).toBe('auth.logout');
  });

  it('treats a non-positive retention as "keep everything" rather than deleting the trail', async () => {
    await auditService.record({ action: 'auth.login', outcome: 'success', actorUserId: 1 });

    expect(await auditService.prune(0)).toBe(0);
    expect(await auditService.prune(-1)).toBe(0);
    expect(await auditService.list()).toHaveLength(1);
  });
});

// Keeps the unused import honest — `db` is the module the harness initialises.
void db;
