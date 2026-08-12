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
 * (`INT INTEGER REAL TEXT BLOB ANY`), so turning STRICT on is a one-word change
 * rather than a retyping exercise. `NUMERIC` is the only logical type without a
 * STRICT equivalent; nothing in the schema uses it, and it maps to REAL rather
 * than being left to SQLite's affinity rules.
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

export const renderCreateTable = (schema: TableSchema): string => {
  const columns = schema.columns.map(column => {
    const constraints = (column.constraints ?? []).join(' ').trim();

    return `${column.name} ${sqliteColumnType(column)}${constraints.length > 0 ? ` ${constraints}` : ''}`;
  });

  const constraints = schema.constraints ?? [];

  return (
    `CREATE TABLE IF NOT EXISTS ${schema.name} (` +
    [...columns, ...constraints].join(', ') +
    ')'
  );
};
