// Migration 015: instants become integers
//
// Every column holding an instant moves from text to epoch milliseconds —
// INTEGER on SQLite, BIGINT on MySQL. Calendar-day columns (`due_date`,
// `issue_date`, `paid_date`, `next_due_date`, `recurring_period_date`, `date`,
// `next_invoice_date`, `date_range_*`) are deliberately absent: a due date is a
// day, and encoding it as an instant picks a midnight in some timezone and
// shows the wrong day to half the world.
//
// 2.1.1 fixed a real defect here — two text formats in one TEXT column,
// compared lexicographically, returning the wrong rows — but it fixed it by
// convention, enforced by two tests. A type enforces it instead: there is no
// second way to write a number.
//
// The conversion expression comes from the dialect (`epochFromStored`) because
// the engines disagree about it in a way that silently corrupts data:
// MySQL's `UNIX_TIMESTAMP(str)` reads its argument in the session timezone,
// which for UTC-stored values shifts the whole database by the host's offset.
// See mysql.dialect.ts.
//
// The rebuild/retype mechanics are in retype.util.ts, which is deliberately not
// timestamp-specific — the currency-precision change needs the same machinery.
//
// SQLite tables come out STRICT, which rides along here rather than in a
// migration of its own because it is the enforcement half of the same idea and
// because a second migration would rebuild all nineteen tables a second time to
// change one keyword. An INTEGER column in an ordinary table still accepts text;
// STRICT is what makes "there is no second way to write a number" true rather
// than merely intended. Two tables opt out — see DUAL_DIALECT_DDL.

import type { IDatabase } from '../../types/database.types.js';
import { retypeColumns, type ColumnRetype } from '../retype.util.js';

/** Instant columns, by table. Days are absent on purpose; see above. */
const TIMESTAMP_COLUMNS: ReadonlyArray<{ table: string; columns: string[] }> = [
  {
    table: 'users',
    columns: [
      'last_login', 'account_locked_until', 'password_updated_at',
      'email_verified_at', 'created_at', 'updated_at', 'deleted_at'
    ]
  },
  { table: 'clients', columns: ['created_at', 'updated_at', 'deleted_at'] },
  {
    table: 'invoices',
    columns: ['email_sent_at', 'last_email_attempt', 'created_at', 'updated_at', 'deleted_at']
  },
  { table: 'invoice_items', columns: ['created_at', 'updated_at', 'deleted_at'] },
  { table: 'payments', columns: ['created_at', 'updated_at', 'deleted_at'] },
  { table: 'expenses', columns: ['created_at', 'updated_at', 'deleted_at'] },
  { table: 'invoice_design_templates', columns: ['created_at', 'updated_at', 'deleted_at'] },
  { table: 'recurring_invoice_templates', columns: ['created_at', 'updated_at', 'deleted_at'] },
  { table: 'settings', columns: ['created_at', 'updated_at'] },
  { table: 'project_settings', columns: ['created_at', 'updated_at'] },
  { table: 'reports', columns: ['created_at', 'deleted_at'] },
  { table: 'counters', columns: ['created_at', 'updated_at', 'deleted_at'] },
  { table: 'scheduler_leases', columns: ['acquired_at', 'expires_at'] },
  { table: 'stripe_events', columns: ['processed_at'] },
  { table: 'stored_objects', columns: ['created_at'] },
  { table: 'password_reset_tokens', columns: ['expires_at', 'used_at', 'created_at'] },
  { table: 'email_verification_tokens', columns: ['expires_at', 'used_at', 'created_at'] },
  { table: 'boot_locks', columns: ['expires_at'] },
  { table: 'migrations', columns: ['applied_at'] }
];

/**
 * Columns declared NOT NULL, which must stay so through the retype.
 *
 * MySQL's `MODIFY` replaces the whole definition, so an omitted NOT NULL is
 * silently dropped rather than rejected — the constraint would disappear and
 * nothing would fail until something wrote a null.
 */
const NOT_NULL = new Set([
  'created_at', 'updated_at', 'acquired_at', 'expires_at', 'processed_at', 'applied_at'
]);

/**
 * Whether the column carries the "stamped on insert" default.
 *
 * `MODIFY` drops a default that is not restated, so these have to be listed. A
 * lost default is not an error either — rows would simply start arriving with a
 * null created_at.
 */
const DEFAULTED = new Set(['created_at', 'updated_at', 'processed_at', 'applied_at']);

/**
 * Tables whose DDL is one statement serving both engines, and which therefore
 * cannot be STRICT.
 *
 * `migrations` and `boot_locks` are declared in `VARCHAR`/`BIGINT` — the
 * spellings MySQL needs for an indexed key column, which SQLite accepts as
 * affinities but STRICT rejects as type names. Making them strict would mean
 * two dialect-specific statements apiece. They hold a lock row and a migration
 * ledger; no customer data passes through either, so the trade is not worth
 * taking. Every table that holds data is strict.
 */
const DUAL_DIALECT_DDL = new Set(['migrations', 'boot_locks']);

/**
 * `scheduler_leases.expires_at` and `boot_locks.expires_at` are NOT NULL but
 * carry no default; `password_reset_tokens.expires_at` likewise. Keyed by table
 * so the two meanings of `expires_at` do not collide.
 */
const definitionFor = (
  db: IDatabase,
  table: string,
  column: string,
  notNull: boolean
): string => {
  const type = db.dialect.name === 'sqlite' ? 'INTEGER' : 'BIGINT';
  const nullability = notNull ? ' NOT NULL' : '';
  const isDefaulted = DEFAULTED.has(column) && table !== 'scheduler_leases';
  const fallback = isDefaulted ? ` DEFAULT (${db.dialect.now()})` : '';

  return `${type}${nullability}${fallback}`;
};

/**
 * Whether the column can be declared NOT NULL without failing.
 *
 * The schema says these columns are NOT NULL, and on a database this
 * application built they are. But older rows predate some of those
 * constraints — the `migrations` table gained its default late — and a
 * migration that aborts on one stray null takes the customer's whole boot down
 * with it. So the intent is checked against the data before it is imposed:
 * where a null exists, the column is retyped and left nullable, and the
 * anomaly is reported rather than swallowed.
 */
const canBeNotNull = async (db: IDatabase, table: string, column: string): Promise<boolean> => {
  if (!NOT_NULL.has(column)) return false;

  const nulls = await db.getOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM \`${table}\` WHERE \`${column}\` IS NULL`
  );

  if (Number(nulls?.count ?? 0) === 0) return true;

  console.warn(
    `  ! ${table}.${column} holds ${nulls?.count} null(s); leaving it nullable rather than failing the boot`
  );
  return false;
};

export const up = async (db: IDatabase): Promise<void> => {
  console.log('Running migration 015: Convert instants to epoch milliseconds');

  let changed = 0;

  for (const { table, columns } of TIMESTAMP_COLUMNS) {
    if (!(await db.tableExists(table))) continue;

    // Only columns the table actually has. A database upgrading from far enough
    // back is missing some of these, and the null-check below would otherwise
    // query a column that does not exist and fail the boot.
    const present = new Set(await db.dialect.columnsOf(db, table));
    const retypes: ColumnRetype[] = [];

    for (const column of columns.filter(name => present.has(name))) {
      retypes.push({
        column,
        definition: definitionFor(db, table, column, await canBeNotNull(db, table, column)),
        conversion: db.dialect.epochFromStored(
          db.dialect.name === 'sqlite' ? column : `\`${column}\``
        )
      });
    }

    if (await retypeColumns(db, table, retypes, { strict: !DUAL_DIALECT_DDL.has(table) })) {
      changed++;
      console.log(`  ✓ ${table}`);
    }
  }

  console.log(`Migration 015 completed successfully (${changed} table(s) converted)`);
};

/**
 * No down migration.
 *
 * Reversing would mean choosing a text format to render back into, and the
 * database held two of them before 014 — there is no record of which row had
 * which. The forward direction loses nothing: same instants, to the
 * millisecond.
 */
export const down = async (): Promise<void> => {
  throw new Error('Migration 015 cannot be reversed: the prior text format is not recoverable');
};
