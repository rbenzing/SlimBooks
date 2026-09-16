/**
 * Scheduled backups, against a real SQLite database and a real directory.
 *
 * The properties worth pinning are the ones that make a backup trustworthy
 * rather than merely present: the file is restorable, it is not world-readable,
 * retention never eats the last good copy, and "due" means something an
 * interval-driven scheduler can actually honour.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, statSync, writeFileSync, utimesSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeDatabase, closeDatabase, activeDatabase } from '../database/index.js';
import { databaseService } from '../core/DatabaseService.js';
import { backupService, parseDailySchedule, type BackupSettings } from './BackupService.js';

let dataDir: string;
let backupDir: string;

const settings = (over: Partial<BackupSettings> = {}): BackupSettings => ({
  directory: backupDir,
  retentionDays: 30,
  hour: 2,
  minute: 0,
  ...over
});

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'slimbooks-backup-'));
  backupDir = join(dataDir, 'backups');
  const dbFile = join(dataDir, 'test.db');

  await initializeDatabase({
    paths: { dataDir, dbFile },
    database: { driver: 'sqlite', file: dbFile, timeoutMs: 5000 }
  });
});

afterEach(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('parseDailySchedule', () => {
  it('reads the documented daily form', () => {
    expect(parseDailySchedule('0 2 * * *')).toEqual({ hour: 2, minute: 0, exact: true });
    expect(parseDailySchedule('30 23 * * *')).toEqual({ hour: 23, minute: 30, exact: true });
  });

  it('reports that a non-daily expression was not honoured rather than pretending', () => {
    // There is no cron engine here. Silently treating "every 15 minutes" as
    // daily-at-2am would be a backup running on a schedule nobody asked for.
    for (const cron of ['*/15 * * * *', '0 2 * * 1', '0 2 1 * *', 'nonsense']) {
      expect(parseDailySchedule(cron).exact).toBe(false);
    }
  });

  it('falls back to 02:00, matching the documented default', () => {
    expect(parseDailySchedule('nonsense')).toEqual({ hour: 2, minute: 0, exact: false });
  });
});

describe('BackupService.run', () => {
  it('writes a restorable dump containing the data', async () => {
    await databaseService.executeQuery(
      `INSERT INTO clients (name, email, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      ['Backed Up Client', 'client@example.com', Date.now(), Date.now()]
    );

    const result = await backupService.run(activeDatabase(), settings());

    expect(result.rows).toBeGreaterThan(0);
    const dump = JSON.parse(readFileSync(result.path, 'utf8'));
    const clients = dump.tables.find((t: { name: string }) => t.name === 'clients');
    expect(clients.rows[0].name).toBe('Backed Up Client');
    // The dump has to carry a version, or db:import cannot refuse an old one.
    expect(dump.version).toBeDefined();
  });

  it('writes the file 0600, because the dump carries every hash and credential', async () => {
    const result = await backupService.run(activeDatabase(), settings());

    // Windows does not model POSIX permission bits, so only assert where it means something.
    if (process.platform !== 'win32') {
      expect(statSync(result.path).mode & 0o777).toBe(0o600);
    }
    expect(statSync(result.path).size).toBeGreaterThan(0);
  });

  it('creates the backup directory if it does not exist yet', async () => {
    await backupService.run(activeDatabase(), settings());

    expect((await readdir(backupDir)).length).toBe(1);
  });

  it('keeps each run as its own file rather than overwriting', async () => {
    await backupService.run(activeDatabase(), settings(), new Date('2026-09-15T02:00:00Z'));
    await backupService.run(activeDatabase(), settings(), new Date('2026-09-16T02:00:00Z'));

    expect((await readdir(backupDir)).length).toBe(2);
  });
});

describe('BackupService.prune', () => {
  /** An existing backup file with a chosen age. */
  const placeBackup = (name: string, ageDays: number): string => {
    const path = join(backupDir, name);
    writeFileSync(path, '{}', 'utf8');
    const when = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
    utimesSync(path, when, when);
    return path;
  };

  beforeEach(async () => {
    await backupService.run(activeDatabase(), settings());
  });

  it('deletes backups past the window and keeps the rest', async () => {
    placeBackup('slimbooks-backup-old.json', 100);
    placeBackup('slimbooks-backup-recent.json', 2);

    const removed = await backupService.prune(settings({ retentionDays: 30 }));

    expect(removed).toBe(1);
    const left = await readdir(backupDir);
    expect(left).toContain('slimbooks-backup-recent.json');
    expect(left).not.toContain('slimbooks-backup-old.json');
  });

  it('leaves files that are not backups alone', async () => {
    placeBackup('notes.txt', 100);
    writeFileSync(join(backupDir, 'notes.txt'), 'keep me', 'utf8');

    await backupService.prune(settings({ retentionDays: 1 }));

    expect(await readdir(backupDir)).toContain('notes.txt');
  });

  it('treats a non-positive retention as keep-everything', async () => {
    placeBackup('slimbooks-backup-ancient.json', 5000);

    expect(await backupService.prune(settings({ retentionDays: 0 }))).toBe(0);
    expect(await readdir(backupDir)).toContain('slimbooks-backup-ancient.json');
  });

  it('prunes only after a successful write, so a failing run cannot delete the last good backup', async () => {
    placeBackup('slimbooks-backup-ancient.json', 5000);

    // A dump against a closed database throws; the old file must survive it.
    await closeDatabase();
    await expect(
      backupService.run(activeDatabase(), settings({ retentionDays: 1 }))
    ).rejects.toThrow();

    expect(await readdir(backupDir)).toContain('slimbooks-backup-ancient.json');

    // Reopen so afterEach can close cleanly.
    await initializeDatabase({
      paths: { dataDir, dbFile: join(dataDir, 'test.db') },
      database: { driver: 'sqlite', file: join(dataDir, 'test.db'), timeoutMs: 5000 }
    });
  });
});

describe('BackupService.isDue', () => {
  it('is due when the scheduled time has passed and nothing has been taken', async () => {
    const at = new Date();
    at.setHours(3, 0, 0, 0);

    expect(await backupService.isDue(settings({ hour: 2, minute: 0 }), at)).toBe(true);
  });

  it('is not due before the scheduled time', async () => {
    const at = new Date();
    at.setHours(1, 0, 0, 0);

    expect(await backupService.isDue(settings({ hour: 2, minute: 0 }), at)).toBe(false);
  });

  it('is not due again once today\'s backup exists', async () => {
    await backupService.run(activeDatabase(), settings());

    const at = new Date();
    at.setHours(23, 0, 0, 0);

    // The scheduler ticks hourly; without this it would back up every tick.
    expect(await backupService.isDue(settings({ hour: 2, minute: 0 }), at)).toBe(false);
  });
});
