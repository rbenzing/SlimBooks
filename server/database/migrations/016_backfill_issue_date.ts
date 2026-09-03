// Migration 016: Backfill invoices.issue_date for rows that have none
//
// `issue_date` is nullable TEXT with no default. This branch moved every
// report and list screen from windowing on `created_at` (NOT NULL, so a row
// always appeared) to windowing on `issue_date` — and NULL, like an empty
// string, compares false against every range, so the invoice silently
// disappears from the profit & loss report, the invoice report, the client
// report, the list and the dashboard, with nothing on screen to say so.
// Migration 006 backfilled the rows that existed when it ran; nothing has
// guarded new ones since, and InvoiceService.createInvoice happily wrote
// `issue_date: invoiceData.issue_date || null` until this branch's sibling fix.
//
// The honest fallback for a row that was never given an issue date is the day
// it was created — exactly where these rows were windowed before this branch
// moved every query onto issue_date, so nothing moves that was previously
// correct.
//
// Done in TypeScript rather than SQL so it is dialect-neutral without a
// dialect-specific date expression at the call site — the same reason
// migration 014 normalises timestamps in JavaScript instead of SQL (see its
// header). `created_at` is epoch milliseconds; `epochToCalendarDay` reads it
// as a UTC day for the same reason every other calendar-day column here is
// derived in UTC: a due date is the 12th everywhere, not just wherever the
// migration happened to run. Row counts are small — this only ever touches
// rows a previous defect created — so the extra round trip per row costs
// nothing that matters.
//
// Idempotent: the WHERE clause only ever matches a row still missing its
// issue_date, so a second run — or a run against an install where
// InvoiceService now always supplies one — finds nothing and touches nothing.
//
// MySQL note: this migration IS flagged `repairsData` (see migrations/index.ts)
// and DOES run against MySQL/MariaDB, unlike 001-015. MySQL installs are built
// once from tables.schema.ts by baseline.ts, with schema-archaeology migration
// history recorded as applied without running (see CLAUDE.md and baseline.ts)
// — but this migration repairs rows, not schema, so applyDataRepairsAndMark-
// MigrationsApplied awaits its up() before recording it. On a freshly-built
// database that is a harmless no-op; on an existing MySQL install that predates
// this migration being registered, it is the only place the repair ever runs.
// Proved directly against a real MySQL/MariaDB server in
// 016_backfill_issue_date.test.ts (the conversion logic) and
// baselineDataRepair.test.ts (the boot path that actually invokes it there).

import type { IDatabase } from '../../types/database.types.js';
import { epochToCalendarDay } from '../../utils/utcTime.util.js';

interface OffendingInvoice {
  id: number;
  created_at: number | string | null;
}

export const up = async (db: IDatabase): Promise<void> => {
  console.log('Running migration 016: Backfill invoices.issue_date from created_at');

  if (!(await db.tableExists('invoices'))) {
    console.log('Skipping - invoices table does not exist');
    return;
  }

  const offenders = await db.getMany<OffendingInvoice>(`
    SELECT id, created_at FROM invoices
     WHERE issue_date IS NULL OR issue_date = ''
  `);

  let updated = 0;

  for (const row of offenders) {
    // created_at is NOT NULL with a default, so this is always a real number
    // in practice; the fallback to "now" exists only so one row with
    // unreadable data cannot abort the whole migration for every other row.
    const createdAt = typeof row.created_at === 'number' ? row.created_at : Number(row.created_at);
    const day = Number.isFinite(createdAt) ? epochToCalendarDay(createdAt) : epochToCalendarDay(Date.now());

    await db.executeQuery('UPDATE invoices SET issue_date = ? WHERE id = ?', [day, row.id]);
    updated++;
  }

  console.log(`Migration 016 completed successfully (${updated} invoice(s) backfilled)`);
};

/**
 * No down migration.
 *
 * Reversing would mean turning a real calendar day back into NULL, and
 * nothing records which rows this migration touched versus which already had
 * an issue_date of their own. The forward direction is lossless in the way
 * that matters: every row keeps a real, defensible date either way.
 */
export const down = async (): Promise<void> => {
  throw new Error('Migration 016 cannot be reversed: which rows were backfilled is not recorded');
};
