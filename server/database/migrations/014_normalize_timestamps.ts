// Migration 014: One timestamp format, in UTC, in every column that holds one
//
// Two shapes were being written into the same TEXT columns:
//
//   2026-08-12T13:54:13.241Z   insertRecord/updateRecord, via toISOString()
//   2026-08-12 13:54:13        the column defaults and the dialect
//
// Both are UTC, so this was never a timezone bug — it was a *comparison* bug.
// These columns are TEXT and compare lexicographically, and a space sorts below
// `T`, so `2026-08-12 23:00:00` sorts before `2026-08-12T01:00:00.241Z`. Any
// window query spanning the two formats returned the wrong rows.
//
// Everything is rewritten to `YYYY-MM-DDTHH:MM:SSZ`, which JavaScript parses to
// a defined instant — the space form does not, and V8 reads it as local time.
// Calendar-day columns are narrowed back to `YYYY-MM-DD` for the same reason:
// a due date written as an instant renders as one day or the next depending on
// where the reader is sitting.
//
// Dialect-neutral by being done in JavaScript rather than SQL. The obvious SQL
// (`REPLACE(SUBSTR(c,1,19),' ','T') || 'Z'`) needs `||` on SQLite and `CONCAT`
// on MySQL, and a migration that branches on the engine is the thing this
// codebase is trying not to have.
//
// Idempotent per row: a value already in the canonical shape normalises to null
// and is not written, so a second run touches nothing and a run interrupted
// half way resumes correctly.

import type { IDatabase } from '../../types/database.types.js';
import { normalizeCalendarDay, normalizeUtcTimestamp } from '../../utils/utcTime.util.js';

interface TablePlan {
  table: string;
  /** The column identifying a row, for the UPDATE. */
  key: string;
  /** Columns holding an instant. */
  timestamps: string[];
  /** Columns holding a calendar day. */
  days?: string[];
}

/**
 * Every column in the schema that holds a time.
 *
 * Deliberately written out rather than inferred from column names. `date` on a
 * payment is a calendar day and `updated_at` is an instant, and the two need
 * opposite treatment — a heuristic on the suffix would get `date_range_start`,
 * `next_invoice_date` and `last_email_attempt` wrong in three different ways.
 *
 * Not listed, and why:
 *   boot_locks, scheduler_leases  expiring rows, minutes old at most; both are
 *                                 rewritten by the next boot anyway
 *   migrations.applied_at         bookkeeping, never compared against anything
 *   invoices.recurring_period_date
 *                                 already a calendar day by construction (it is
 *                                 copied from next_invoice_date), and the only
 *                                 column here under a UNIQUE index — narrowing
 *                                 it is the one rewrite that could collide and
 *                                 fail a customer's boot for no gain
 */
const PLANS: readonly TablePlan[] = [
  {
    table: 'users',
    key: 'id',
    timestamps: [
      'last_login',
      'account_locked_until',
      'password_updated_at',
      'email_verified_at',
      'created_at',
      'updated_at',
      'deleted_at'
    ]
  },
  { table: 'clients', key: 'id', timestamps: ['created_at', 'updated_at', 'deleted_at'] },
  {
    table: 'invoices',
    key: 'id',
    timestamps: [
      'email_sent_at',
      'last_email_attempt',
      'created_at',
      'updated_at',
      'deleted_at'
    ],
    days: ['due_date', 'issue_date', 'paid_date', 'next_due_date']
  },
  { table: 'invoice_items', key: 'id', timestamps: ['created_at', 'updated_at', 'deleted_at'] },
  {
    table: 'payments',
    key: 'id',
    timestamps: ['created_at', 'updated_at', 'deleted_at'],
    days: ['date']
  },
  {
    table: 'expenses',
    key: 'id',
    timestamps: ['created_at', 'updated_at', 'deleted_at'],
    days: ['date']
  },
  {
    table: 'invoice_design_templates',
    key: 'id',
    timestamps: ['created_at', 'updated_at', 'deleted_at']
  },
  {
    table: 'recurring_invoice_templates',
    key: 'id',
    timestamps: ['created_at', 'updated_at', 'deleted_at'],
    days: ['next_invoice_date']
  },
  { table: 'settings', key: 'id', timestamps: ['created_at', 'updated_at'] },
  { table: 'project_settings', key: 'id', timestamps: ['created_at', 'updated_at'] },
  {
    table: 'reports',
    key: 'id',
    timestamps: ['created_at', 'deleted_at'],
    days: ['date_range_start', 'date_range_end']
  },
  { table: 'counters', key: 'id', timestamps: ['created_at', 'updated_at', 'deleted_at'] },
  { table: 'stripe_events', key: 'event_id', timestamps: ['processed_at'] },
  { table: 'stored_objects', key: 'key', timestamps: ['created_at'] },
  {
    table: 'password_reset_tokens',
    key: 'id',
    timestamps: ['expires_at', 'used_at', 'created_at']
  },
  {
    table: 'email_verification_tokens',
    key: 'id',
    timestamps: ['expires_at', 'used_at', 'created_at']
  }
];

/** Every identifier is quoted: `key` and `date` are reserved words in MySQL. */
const quote = (identifier: string): string => `\`${identifier}\``;

/** Rewrite one table, returning how many rows were changed. */
const normalizeTable = async (db: IDatabase, plan: TablePlan): Promise<number> => {
  if (!(await db.tableExists(plan.table))) return 0;

  const present = new Set(await db.dialect.columnsOf(db, plan.table));
  if (!present.has(plan.key)) return 0;

  const timestamps = plan.timestamps.filter(column => present.has(column));
  const days = (plan.days ?? []).filter(column => present.has(column));
  const columns = [...timestamps, ...days];

  if (columns.length === 0) return 0;

  const selected = [plan.key, ...columns].map(quote).join(', ');
  const rows = await db.getMany<Record<string, unknown>>(
    `SELECT ${selected} FROM ${quote(plan.table)}`
  );

  let changed = 0;

  for (const row of rows) {
    const assignments: string[] = [];
    const params: unknown[] = [];

    for (const column of timestamps) {
      const next = normalizeUtcTimestamp(row[column]);
      if (next === null) continue;

      assignments.push(`${quote(column)} = ?`);
      params.push(next);
    }

    for (const column of days) {
      const next = normalizeCalendarDay(row[column]);
      if (next === null) continue;

      assignments.push(`${quote(column)} = ?`);
      params.push(next);
    }

    if (assignments.length === 0) continue;

    params.push(row[plan.key]);
    await db.executeQuery(
      `UPDATE ${quote(plan.table)} SET ${assignments.join(', ')} WHERE ${quote(plan.key)} = ?`,
      params
    );
    changed++;
  }

  return changed;
};

export const up = async (db: IDatabase): Promise<void> => {
  console.log('Running migration 014: Normalize stored timestamps to UTC ISO-8601');

  let total = 0;
  for (const plan of PLANS) {
    total += await normalizeTable(db, plan);
  }

  console.log(`Migration 014 completed successfully (${total} row(s) rewritten)`);
};

/**
 * No down migration.
 *
 * Reversing this would mean re-splitting one correct format back into the two
 * incorrect ones, and there is no record of which row had which. The forward
 * direction is lossless in every way that matters — same instants, same days —
 * so nothing is recoverable by going back.
 */
export const down = async (): Promise<void> => {
  throw new Error('Migration 014 cannot be reversed: the two prior formats are not recoverable');
};
