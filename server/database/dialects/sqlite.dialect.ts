// SQLite spellings for the statements the two backends disagree about.

import type { IDatabase } from '../../types/database.types.js';
import type { DateUnit, SqlDialect } from '../dialect.types.js';
import { assertWholeCount } from './interval.util.js';

const quote = (identifier: string): string => `\`${identifier}\``;

const placeholders = (count: number): string =>
  Array.from({ length: count }, () => '?').join(', ');

/** SQLite's modifier vocabulary: 'day' → '-7 days'. */
const modifier = (count: number, unit: DateUnit): string => {
  assertWholeCount(count);
  return `'-${count} ${unit}s'`;
};

/**
 * Epoch milliseconds, as SQLite spells it.
 *
 * `unixepoch()` alone returns whole seconds; the `subsec` modifier makes it a
 * float carrying milliseconds, which the CAST turns back into the integer the
 * column holds. Matches `Date.now()` to a few milliseconds, and is accepted
 * inside a column DEFAULT and inside a STRICT table.
 */
const EPOCH_MILLIS = (...modifiers: string[]): string =>
  `CAST(unixepoch(${["'now'", "'subsec'", ...modifiers].join(', ')}) * 1000 AS INTEGER)`;

export const sqliteDialect: SqlDialect = {
  name: 'sqlite',

  now: () => EPOCH_MILLIS(),
  today: () => "date('now')",

  nowMinus: (count, unit) => EPOCH_MILLIS(modifier(count, unit)),
  todayMinus: (count, unit) => `date('now', ${modifier(count, unit)})`,

  // Reads any of the text shapes a pre-2.2 database holds — with a `T` or a
  // space, with or without fractional seconds or a `Z`, and a bare day — and
  // returns epoch milliseconds. Used by migration 015.
  //
  // Both passthrough arms are load-bearing, not defensive. `unixepoch()` of a
  // bare number is NULL — it reads it as a Julian day, and epoch values are far
  // out of range — so re-applying this to its own output would erase the
  // column. The *second* arm exists because the value can be already-converted
  // and still be text: a column mid-retype still has TEXT affinity, so the
  // integer written into it comes back as "1786542853000". A crash between the
  // two halves of the retype leaves exactly that, and the first arm alone does
  // not see it.
  //
  // `NOT GLOB '*[^0-9]*'` is "every character is a digit". `GLOB '[0-9]*'`
  // would have matched '2026-08-12' as well, since `*` swallows the rest.
  epochFromStored: column =>
    `CASE WHEN typeof(${column}) IN ('integer', 'real') THEN CAST(${column} AS INTEGER) ` +
    `WHEN length(${column}) > 0 AND ${column} NOT GLOB '*[^0-9]*' ` +
    `THEN CAST(${column} AS INTEGER) ` +
    `ELSE CAST(unixepoch(${column}) * 1000 AS INTEGER) END`,

  formatMonth: column => `strftime('%Y-%m', ${column})`,
  formatYear: column => `strftime('%Y', ${column})`,

  insertIgnore: (table, columns) =>
    `INSERT OR IGNORE INTO ${table} (${columns.map(quote).join(', ')}) ` +
    `VALUES (${placeholders(columns.length)})`,

  insertOrReplace: (table, columns) =>
    `INSERT OR REPLACE INTO ${table} (${columns.map(quote).join(', ')}) ` +
    `VALUES (${placeholders(columns.length)})`,


  columnsOf: async (db: IDatabase, table: string): Promise<string[]> => {
    const rows = await db.getMany<{ name: string }>(`PRAGMA table_info(${table})`);
    return rows.map(row => row.name);
  },

  deferForeignKeys: 'PRAGMA foreign_keys = OFF',
  restoreForeignKeys: 'PRAGMA foreign_keys = ON',

  supportsPartialIndex: true,
  supportsSelfUpdatingTrigger: true
};
