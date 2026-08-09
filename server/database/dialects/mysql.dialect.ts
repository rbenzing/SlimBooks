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

const TIMESTAMP_MASK = "'%Y-%m-%d %H:%i:%s'";
const DATE_MASK = "'%Y-%m-%d'";

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

  // DATE_FORMAT rather than NOW(): the columns are TEXT on both backends, and
  // NOW() renders with a session-timezone offset and possible fractional
  // seconds. This produces output byte-identical to SQLite's datetime('now'),
  // so stored values sort and compare the same way on either backend and data
  // exported from one reads correctly in the other.
  now: () => `DATE_FORMAT(UTC_TIMESTAMP(),${TIMESTAMP_MASK})`,
  today: () => `DATE_FORMAT(UTC_TIMESTAMP(),${DATE_MASK})`,

  // Formatted, not raw: the columns these are compared against are TEXT on both
  // backends, so the cutoff has to be the same string shape the stored values
  // have or the comparison is lexicographic against a different format.
  nowMinus: (count, unit) =>
    `DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), ${interval(count, unit)}),${TIMESTAMP_MASK})`,
  todayMinus: (count, unit) =>
    `DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), ${interval(count, unit)}),${DATE_MASK})`,

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

  supportsPartialIndex: false,
  supportsSelfUpdatingTrigger: false
};
