// Audit trail for security-relevant events (SOC 2 CC7.2 / CC7.3).
//
// The question this exists to answer is "who did what, when, and from where",
// asked after something has already gone wrong. Two properties follow from that:
//
//  - A record must outlive the account it describes, so the actor is stored by
//    id *and* by the email as it read at the time, with no foreign key. See the
//    schema comment in tables.schema.ts.
//  - Writing a record must never be able to fail the operation it describes.
//    An audit table that can 500 a login is an availability bug wearing a
//    compliance costume, so `record()` swallows its own errors and reports them
//    to stderr instead. The trade is deliberate: a lost record is visible in the
//    process log, whereas a locked-out user is an outage.

import type { Request } from 'express';
import { databaseService } from '../core/DatabaseService.js';
import { utcNow } from '../utils/utcTime.util.js';

/**
 * The events worth reconstructing after an incident.
 *
 * A closed set rather than free text: an audit log whose action names are typed
 * at each call site cannot be queried reliably six months later, which is when
 * anyone actually reads it.
 */
export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.register'
  | 'auth.password_change'
  | 'auth.password_reset'
  | 'auth.token_refresh'
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.role_change'
  | 'user.unlock'
  | 'settings.update'
  | 'database.export'
  | 'database.import'
  | 'setup.complete';

export type AuditOutcome = 'success' | 'failure';

export interface AuditEntry {
  action: AuditAction;
  outcome: AuditOutcome;
  /** Null when the actor never authenticated — a failed login still leaves a trace. */
  actorUserId?: number | null;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | number | null;
  ipAddress?: string | null;
  /** Action-specific payload. Never put a credential in here. */
  details?: Record<string, unknown> | null;
}

export interface AuditQuery {
  action?: AuditAction;
  actorUserId?: number;
  limit?: number;
  offset?: number;
}

export interface AuditRecord {
  id: number;
  occurred_at: number;
  action: string;
  outcome: string;
  actor_user_id: number | null;
  actor_email: string | null;
  target_type: string | null;
  target_id: string | null;
  ip_address: string | null;
  details: string | null;
}

/**
 * The caller's address, as the app is actually deployed.
 *
 * `req.ip` already honours the `trust proxy` setting the listener configures
 * from TLS_MODE/TRUST_PROXY_HOPS, so this does not re-read X-Forwarded-For —
 * doing that by hand is how a spoofable header ends up in the record.
 */
export const actorIp = (req: Pick<Request, 'ip'>): string | null => req.ip ?? null;

/** A page of audit records, newest first. */
const MAX_PAGE = 200;

export class AuditService {
  /**
   * Write one record. Never throws.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await databaseService.executeQuery(
        `INSERT INTO audit_log
           (occurred_at, action, outcome, actor_user_id, actor_email,
            target_type, target_id, ip_address, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          utcNow(),
          entry.action,
          entry.outcome,
          entry.actorUserId ?? null,
          entry.actorEmail ?? null,
          entry.targetType ?? null,
          entry.targetId === undefined || entry.targetId === null
            ? null
            : String(entry.targetId),
          entry.ipAddress ?? null,
          entry.details ? JSON.stringify(entry.details) : null
        ]
      );
    } catch (error) {
      // Deliberately swallowed — see the header. Loud on stderr so a broken
      // audit trail is noticed without taking the request down with it.
      console.error(
        `AUDIT WRITE FAILED (${entry.action}/${entry.outcome}):`,
        (error as Error).message
      );
    }
  }

  /** Read records, newest first. */
  async list(query: AuditQuery = {}): Promise<AuditRecord[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), MAX_PAGE);
    const offset = Math.max(query.offset ?? 0, 0);

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (query.action) {
      conditions.push('action = ?');
      params.push(query.action);
    }

    if (typeof query.actorUserId === 'number') {
      conditions.push('actor_user_id = ?');
      params.push(query.actorUserId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // limit/offset are clamped integers above, never interpolated user text.
    return databaseService.getMany<AuditRecord>(
      `SELECT id, occurred_at, action, outcome, actor_user_id, actor_email,
              target_type, target_id, ip_address, details
         FROM audit_log
         ${where}
        ORDER BY occurred_at DESC, id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params
    );
  }

  /**
   * Delete records older than `retentionDays`.
   *
   * Retention is a requirement in both directions: an assessor wants records
   * kept long enough to investigate, and GDPR wants the IP addresses in them
   * not kept forever.
   */
  async prune(retentionDays: number): Promise<number> {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;

    const cutoff = utcNow() - Math.floor(retentionDays * 24 * 60 * 60 * 1000);
    const result = await databaseService.executeQuery(
      'DELETE FROM audit_log WHERE occurred_at < ?',
      [cutoff]
    );

    return result?.changes ?? 0;
  }
}

export const auditService = new AuditService();
