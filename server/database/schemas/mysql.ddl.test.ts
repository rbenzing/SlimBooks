import { describe, it, expect } from 'vitest';
import {
  indexedColumnsFor,
  mysqlSchemaStatements,
  renderCreateTable,
  renderIndex
} from './mysql.ddl.js';
import { indexes, tableSchemas } from './tables.schema.js';
import { mysqlDialect } from '../dialects/mysql.dialect.js';
import { sqliteDialect } from '../dialects/sqlite.dialect.js';

const tableFor = (name: string) => {
  const schema = tableSchemas.find(candidate => candidate.name === name);
  if (!schema) throw new Error(`no schema named ${name}`);
  return schema;
};

const indexed = indexedColumnsFor(tableSchemas, indexes);
const columnsOf = (table: string) => indexed.get(table) ?? new Set<string>();

describe('indexedColumnsFor', () => {
  it('collects columns named in a CREATE INDEX statement', () => {
    expect(columnsOf('clients')).toContain('email');
    expect(columnsOf('invoices')).toContain('due_date');
  });

  it('collects every column of a composite index, not just the first', () => {
    expect(columnsOf('invoices')).toContain('issue_date');
    expect(columnsOf('clients')).toContain('first_name');
    expect(columnsOf('clients')).toContain('last_name');
  });

  it('collects columns carrying a per-column UNIQUE constraint', () => {
    // users.email is declared 'UNIQUE NOT NULL' on the column, not in an index
    // list. Missing this leaves it TEXT, and MySQL cannot build a unique index
    // on TEXT without a prefix length — the table simply fails to create.
    expect(columnsOf('users')).toContain('email');
    expect(columnsOf('users')).toContain('username');
    expect(columnsOf('users')).toContain('google_id');
    expect(columnsOf('settings')).toContain('key');
  });

  it('collects primary keys, including the non-integer ones', () => {
    expect(columnsOf('stripe_events')).toContain('event_id');
    expect(columnsOf('scheduler_leases')).toContain('job_name');
  });

  it('collects columns named in a table-level FOREIGN KEY', () => {
    expect(columnsOf('payments')).toContain('invoice_id');
    expect(columnsOf('recurring_invoice_templates')).toContain('client_id');
  });

  it('does not sweep in every column, which would make the whole schema VARCHAR', () => {
    expect(columnsOf('clients')).not.toContain('notes');
    expect(columnsOf('invoices')).not.toContain('description');
  });
});

describe('renderCreateTable', () => {
  it('maps an autoincrement primary key', () => {
    expect(renderCreateTable(tableFor('users'), columnsOf('users')))
      .toContain('`id` INT AUTO_INCREMENT PRIMARY KEY');
  });

  it('maps indexed TEXT to VARCHAR and unindexed TEXT to TEXT', () => {
    const sql = renderCreateTable(tableFor('clients'), columnsOf('clients'));

    expect(sql).toContain('`email` VARCHAR(255)');
    expect(sql).toContain('`notes` TEXT');
  });

  it('maps REAL to DOUBLE, never DECIMAL', () => {
    // DECIMAL is the correct type for money and REAL is not — but mapping only
    // MySQL to it would make the same invoice total differently depending on
    // which backend stored it. Currency precision is fixed for both together.
    const sql = renderCreateTable(tableFor('payments'), columnsOf('payments'));

    expect(sql).toContain('`amount` DOUBLE NOT NULL');
    expect(sql).not.toContain('DECIMAL');
  });

  it('translates the SQLite timestamp default to an identical MySQL expression', () => {
    const sql = renderCreateTable(tableFor('users'), columnsOf('users'));

    expect(sql).toContain(`DEFAULT (${mysqlDialect.now()})`);
    expect(sql).not.toContain(sqliteDialect.now());
    expect(sql).not.toContain('strftime');
  });

  it('emits InnoDB and utf8mb4, which the transaction guarantee depends on', () => {
    const sql = renderCreateTable(tableFor('invoices'), columnsOf('invoices'));

    expect(sql).toContain('ENGINE=InnoDB');
    expect(sql).toContain('DEFAULT CHARSET=utf8mb4');
  });

  it('keeps table-level foreign keys', () => {
    expect(renderCreateTable(tableFor('payments'), columnsOf('payments')))
      .toContain('FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE SET NULL');
  });

  it('quotes every column, since settings.key is a reserved word', () => {
    expect(renderCreateTable(tableFor('settings'), columnsOf('settings')))
      .toContain('`key` VARCHAR(255)');
  });

  it('keeps a TEXT primary key indexable', () => {
    // A TEXT PRIMARY KEY is not creatable in MySQL at all.
    const sql = renderCreateTable(tableFor('stripe_events'), columnsOf('stripe_events'));

    expect(sql).toContain('`event_id` VARCHAR(255) PRIMARY KEY');
  });
});

describe('renderIndex', () => {
  it('drops IF NOT EXISTS, which MySQL 8 does not accept on CREATE INDEX', () => {
    expect(renderIndex('CREATE INDEX IF NOT EXISTS idx_clients_email ON clients (email)'))
      .toBe('CREATE INDEX idx_clients_email ON clients (email)');
  });

  it('drops the WHERE clause from a partial unique index', () => {
    // MySQL unique indexes already permit multiple NULL rows, which is exactly
    // what the WHERE clause was emulating, so the guarantee survives the loss.
    expect(
      renderIndex(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_recurring_period ' +
          'ON invoices (recurring_template_id, recurring_period_date) ' +
          'WHERE recurring_template_id IS NOT NULL'
      )
    ).toBe(
      'CREATE UNIQUE INDEX idx_invoices_recurring_period ' +
        'ON invoices (recurring_template_id, recurring_period_date)'
    );
  });

  it('flattens a multi-line declaration', () => {
    expect(renderIndex('CREATE INDEX IF NOT EXISTS idx_a\n  ON t (a,\n      b)'))
      .toBe('CREATE INDEX idx_a ON t (a, b)');
  });

  it('returns null for something that is not a CREATE INDEX', () => {
    expect(renderIndex('CREATE TABLE t (id INT)')).toBeNull();
  });
});

describe('mysqlSchemaStatements', () => {
  const statements = mysqlSchemaStatements();

  it('emits one CREATE TABLE per schema, plus the two token tables', () => {
    expect(statements.filter(sql => sql.startsWith('CREATE TABLE'))).toHaveLength(
      tableSchemas.length + 2
    );
  });

  it('creates a referenced table before the table that references it', () => {
    const at = (name: string) =>
      statements.findIndex(sql => sql.includes(`CREATE TABLE IF NOT EXISTS \`${name}\``));

    expect(at('clients')).toBeLessThan(at('recurring_invoice_templates'));
    expect(at('invoices')).toBeLessThan(at('payments'));
    expect(at('users')).toBeLessThan(at('password_reset_tokens'));
  });

  it('creates every table before any index', () => {
    const lastTable = statements.map(sql => sql.startsWith('CREATE TABLE')).lastIndexOf(true);
    const firstIndex = statements.findIndex(sql => sql.startsWith('CREATE '.concat('INDEX')) || /^CREATE UNIQUE INDEX/.test(sql));

    expect(lastTable).toBeLessThan(firstIndex);
  });

  it('emits no trigger, because MySQL forbids one that updates its own table', () => {
    // Error 1442. Every service writes updated_at explicitly instead.
    expect(statements.some(sql => sql.includes('CREATE TRIGGER'))).toBe(false);
  });

  it('contains no SQLite-only syntax at all', () => {
    const joined = statements.join('\n');

    expect(joined).not.toContain('AUTOINCREMENT');
    expect(joined).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX\s+IF NOT EXISTS/);
    expect(joined).not.toContain("datetime('now')");
    expect(joined).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX[^\n]*WHERE/);
  });

  it('indexes no TEXT column, which MySQL cannot do without a prefix length', () => {
    // The failure this prevents is a table that simply will not create, so it
    // is worth asserting over the whole schema rather than per table.
    const types = new Map<string, string>();

    for (const statement of statements) {
      const table = /CREATE TABLE IF NOT EXISTS `(\w+)`/.exec(statement)?.[1];
      if (table === undefined) continue;

      for (const match of statement.matchAll(/`(\w+)` (VARCHAR\(\d+\)|TEXT|INT|DOUBLE|MEDIUMBLOB)/g)) {
        types.set(`${table}.${match[1]}`, match[2] as string);
      }
    }

    const offenders: string[] = [];

    for (const statement of statements) {
      const match = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+\w+\s+ON\s+(\w+)\s*\(([^)]+)\)/.exec(statement);
      if (match?.[1] === undefined || match[2] === undefined) continue;

      for (const raw of match[2].split(',')) {
        const key = `${match[1]}.${raw.trim()}`;
        if (types.get(key) === 'TEXT') offenders.push(key);
      }
    }

    expect(offenders).toEqual([]);
  });
});
