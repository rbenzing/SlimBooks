/**
 * The SQLite DDL renderer.
 *
 * Every statement is also prepared against a real in-memory SQLite, because a
 * renderer that produces plausible-looking text SQLite will not accept is
 * exactly how the MySQL half shipped unable to build a schema.
 */

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { renderCreateTable, sqliteColumnType } from './sqlite.ddl.js';
import { tableSchemas } from './tables.schema.js';
import type { ColumnDefinition, TableSchema } from '../../types/database.types.js';

const tableFor = (name: string): TableSchema => {
  const schema = tableSchemas.find(candidate => candidate.name === name);
  if (!schema) throw new Error(`no schema named ${name}`);
  return schema;
};

/** The six physical types a STRICT table permits. */
const STRICT_TYPES = new Set(['INT', 'INTEGER', 'REAL', 'TEXT', 'BLOB', 'ANY']);

describe('sqliteColumnType', () => {
  it('stores an instant as an integer', () => {
    expect(sqliteColumnType({ name: 'created_at', type: 'TIMESTAMP' })).toBe('INTEGER');
  });

  it('leaves a calendar day as text', () => {
    // A day is not an instant. Encoding it as one picks a midnight in some
    // timezone and shows the wrong day to half the world.
    expect(sqliteColumnType({ name: 'due_date', type: 'TEXT' })).toBe('TEXT');
  });

  it('maps every logical type to one STRICT accepts', () => {
    // So enabling STRICT is a one-word change rather than a retyping exercise.
    const types: ColumnDefinition['type'][] = [
      'TEXT', 'INTEGER', 'REAL', 'BLOB', 'NUMERIC', 'TIMESTAMP'
    ];

    for (const type of types) {
      expect(STRICT_TYPES.has(sqliteColumnType({ name: 'c', type }))).toBe(true);
    }
  });
});

describe('renderCreateTable', () => {
  it('produces a statement SQLite accepts, for every table in the schema', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = OFF');

    for (const schema of tableSchemas) {
      expect(() => sqlite.exec(renderCreateTable(schema))).not.toThrow();
    }

    const built = sqlite
      // sqlite_sequence is SQLite's own bookkeeping for AUTOINCREMENT.
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map(row => (row as { name: string }).name);

    expect(built).toHaveLength(tableSchemas.length);
  });

  it('keeps table-level constraints', () => {
    expect(renderCreateTable(tableFor('invoices')))
      .toContain('FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE');
  });

  it('keeps column constraints beside the rendered type', () => {
    expect(renderCreateTable(tableFor('users')))
      .toContain('id INTEGER PRIMARY KEY AUTOINCREMENT');
  });

  it('renders a table with no table-level constraints without a trailing comma', () => {
    const sql = renderCreateTable(tableFor('clients'));

    expect(sql).not.toMatch(/,\s*\)$/);
  });
});
