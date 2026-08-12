// Renders the schema objects in tables.schema.ts into SQLite DDL.
//
// The counterpart to mysql.ddl.ts, and it exists for the same reason: the
// logical column types in the schema are not the physical ones, so something
// has to do the mapping, and a pure function of the schema objects is
// reviewable and testable without a database.
//
// Until this existed, createTables() interpolated `col.type` straight into the
// statement. That worked only while every logical type happened to be spelled
// the way SQLite wanted it — which stopped being true the moment `TIMESTAMP`
// arrived, because SQLite has no such type and a STRICT table rejects the word.

import type { ColumnDefinition, ColumnType, TableSchema } from '../../types/database.types.js';

/**
 * The physical type SQLite gets.
 *
 * Every result is one of the six a STRICT table permits
 * (`INT INTEGER REAL TEXT BLOB ANY`), which is what lets `renderCreateTable`
 * stamp STRICT below. `NUMERIC` is the only logical type without a STRICT
 * equivalent; nothing in the schema uses it, and it maps to REAL rather than
 * being left to SQLite's affinity rules.
 */
export const sqliteColumnType = (column: ColumnDefinition): string => {
  const mapping: Record<ColumnType, string> = {
    TIMESTAMP: 'INTEGER',
    NUMERIC: 'REAL',
    TEXT: 'TEXT',
    INTEGER: 'INTEGER',
    REAL: 'REAL',
    BLOB: 'BLOB'
  };

  return mapping[column.type];
};

/**
 * STRICT is the half of the epoch-timestamp change that makes the other half
 * true.
 *
 * An INTEGER column in an ordinary SQLite table still accepts text: affinity
 * converts what looks numeric and stores the rest verbatim. So a stray
 * `'2026-08-12T13:54:13Z'` written to `created_at` would sit in the column as
 * text, next to integers, compared against them by SQLite's type ordering —
 * which is the two-shapes-in-one-column bug this whole change removes, wearing a
 * different hat. STRICT makes that write an error at the point it happens.
 *
 * Not every table can have it. `migrations` and `boot_locks` are declared once
 * for both engines, in `VARCHAR`/`BIGINT` that MySQL needs and STRICT rejects;
 * they hold a lock row and a migration ledger, no customer data, and splitting
 * their DDL per dialect would cost more than it buys. Migration 015 skips them
 * for the same reason.
 */
export const renderCreateTable = (schema: TableSchema): string => {
  const columns = schema.columns.map(column => {
    const constraints = (column.constraints ?? []).join(' ').trim();

    return `${column.name} ${sqliteColumnType(column)}${constraints.length > 0 ? ` ${constraints}` : ''}`;
  });

  const constraints = schema.constraints ?? [];

  return (
    `CREATE TABLE IF NOT EXISTS ${schema.name} (` +
    [...columns, ...constraints].join(', ') +
    ') STRICT'
  );
};
