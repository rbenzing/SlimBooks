// MySQL and MariaDB spellings for the statements the two backends disagree
// about. One implementation covers both: where they differ from each other
// (row aliases, CREATE INDEX IF NOT EXISTS), the form MariaDB 10.2 accepts is
// chosen, because MySQL accepts it too.

import type { IDatabase } from '../../types/database.types.js';
import type { DateUnit, SqlDialect } from '../dialect.types.js';
import { assertWholeCount } from './interval.util.js';

const quote = (identifier: string): string => `\`${identifier}\``;

const placeholders = (count: number): string =>
  Array.from({ length: count }, () => '?').join(', ');

const DATE_MASK = "'%Y-%m-%d'";

/**
 * Epoch milliseconds, as MySQL spells it.
 *
 * `UNIX_TIMESTAMP(x)` reads `x` in the session timezone, which would normally
 * make it unusable here — every stored value is UTC and the session zone is a
 * property of the host. It is safe in *this* expression only because
 * `CURRENT_TIMESTAMP(3)` returns the current time in that same zone, so the two
 * conversions cancel. Verified identical under SYSTEM, +05:30 and -08:00.
 *
 * `epochFromStored` below cannot use that trick, and does not.
 */
const EPOCH_MILLIS_NOW = 'CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS SIGNED)';

/** The same, shifted into the past. `DATE_SUB` stays inside the cancellation. */
const epochMillisAgo = (interval: string): string =>
  `CAST(UNIX_TIMESTAMP(DATE_SUB(CURRENT_TIMESTAMP(3), ${interval})) * 1000 AS SIGNED)`;

/**
 * MySQL's INTERVAL unit is a bare keyword, singular and uppercase — and it
 * cannot be a placeholder, which is why the count is checked before it is
 * interpolated.
 */
const interval = (count: number, unit: DateUnit): string => {
  assertWholeCount(count);
  return `INTERVAL ${count} ${unit.toUpperCase()}`;
};

export const mysqlDialect: SqlDialect = {
  name: 'mysql',

  now: () => EPOCH_MILLIS_NOW,
  today: () => `DATE_FORMAT(UTC_TIMESTAMP(),${DATE_MASK})`,

  nowMinus: (count, unit) => epochMillisAgo(interval(count, unit)),

  // Still text, and still formatted: a calendar day is not an instant, so this
  // column stays `YYYY-MM-DD` and the cutoff has to be the same shape.
  todayMinus: (count, unit) =>
    `DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), ${interval(count, unit)}),${DATE_MASK})`,

  // TIMESTAMPDIFF, never UNIX_TIMESTAMP. `UNIX_TIMESTAMP(str)` reads its
  // argument in the session timezone, and every stored value here is UTC — the
  // same input returned 1786557253000 under SYSTEM and 1786523053000 under
  // +05:30, so it would shift an entire database by the host's offset,
  // silently, on hosts nobody controls. TIMESTAMPDIFF is datetime arithmetic
  // and returned the identical value under both. Used by migration 015.
  epochFromStored: column =>
    `CASE WHEN ${column} REGEXP '^-?[0-9]+$' THEN CAST(${column} AS SIGNED) ` +
    `ELSE TIMESTAMPDIFF(SECOND, '1970-01-01 00:00:00', ${column}) * 1000 END`,

  formatMonth: column => `DATE_FORMAT(${column}, '%Y-%m')`,
  formatYear: column => `DATE_FORMAT(${column}, '%Y')`,

  insertIgnore: (table, columns) =>
    `INSERT IGNORE INTO ${table} (${columns.map(quote).join(', ')}) ` +
    `VALUES (${placeholders(columns.length)})`,

  insertOrReplace: (table, columns) =>
    `REPLACE INTO ${table} (${columns.map(quote).join(', ')}) ` +
    `VALUES (${placeholders(columns.length)})`,


  columnsOf: async (db: IDatabase, table: string): Promise<string[]> => {
    const rows = await db.getMany<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [table]
    );

    return rows.map(row => row.COLUMN_NAME);
  },

  // Session-scoped, so this affects only the importing connection.
  deferForeignKeys: 'SET FOREIGN_KEY_CHECKS = 0',
  restoreForeignKeys: 'SET FOREIGN_KEY_CHECKS = 1',

  supportsPartialIndex: false,
  supportsSelfUpdatingTrigger: false
};
