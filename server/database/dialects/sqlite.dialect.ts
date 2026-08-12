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
 * The canonical timestamp shape, as SQLite spells it.
 *
 * `datetime('now')` would be the obvious choice and is what this used to be,
 * but it renders `YYYY-MM-DD HH:MM:SS`, which JavaScript does not parse to a
 * defined instant — see `server/utils/utcTime.util.ts`. `strftime` builds the
 * ISO-8601 form instead, byte-identical to what `utcNow()` writes.
 */
const TIMESTAMP_MASK = "'%Y-%m-%dT%H:%M:%SZ'";

export const sqliteDialect: SqlDialect = {
  name: 'sqlite',

  now: () => `strftime(${TIMESTAMP_MASK}, 'now')`,
  today: () => "date('now')",

  nowMinus: (count, unit) => `strftime(${TIMESTAMP_MASK}, 'now', ${modifier(count, unit)})`,
  todayMinus: (count, unit) => `date('now', ${modifier(count, unit)})`,

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
