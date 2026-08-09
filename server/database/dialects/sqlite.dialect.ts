// SQLite spellings for the statements the two backends disagree about.

import type { IDatabase } from '../../types/database.types.js';
import type { ConditionalUpsert, ConditionalUpsertSpec, SqlDialect } from '../dialect.types.js';

const quote = (identifier: string): string => `\`${identifier}\``;

const placeholders = (count: number): string =>
  Array.from({ length: count }, () => '?').join(', ');

export const sqliteDialect: SqlDialect = {
  name: 'sqlite',

  now: () => "datetime('now')",
  today: () => "date('now')",

  insertIgnore: (table, columns) =>
    `INSERT OR IGNORE INTO ${table} (${columns.map(quote).join(', ')}) ` +
    `VALUES (${placeholders(columns.length)})`,

  insertOrReplace: (table, columns) =>
    `INSERT OR REPLACE INTO ${table} (${columns.map(quote).join(', ')}) ` +
    `VALUES (${placeholders(columns.length)})`,

  /**
   * `conflictGuardColumn` is accepted and ignored. SQLite tests the WHERE
   * clause against the existing row once, before any assignment runs, so the
   * assignment order that MySQL has to care about is irrelevant here.
   */
  conditionalUpsert: (spec: ConditionalUpsertSpec): ConditionalUpsert => {
    const assignments = spec.updateColumns
      .map(column => `${quote(column)} = excluded.${quote(column)}`)
      .join(', ');

    return {
      sql:
        `INSERT INTO ${spec.table} (${spec.columns.map(quote).join(', ')}) ` +
        `VALUES (${placeholders(spec.columns.length)}) ` +
        `ON CONFLICT (${quote(spec.conflictColumn)}) DO UPDATE SET ${assignments} ` +
        `WHERE ${spec.condition}`,
      params: [...spec.values, ...spec.conditionParams]
    };
  },

  columnsOf: async (db: IDatabase, table: string): Promise<string[]> => {
    const rows = await db.getMany<{ name: string }>(`PRAGMA table_info(${table})`);
    return rows.map(row => row.name);
  },

  supportsPartialIndex: true,
  supportsSelfUpdatingTrigger: true
};
