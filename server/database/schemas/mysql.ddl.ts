// Renders the schema objects in tables.schema.ts into MySQL DDL.
//
// This exists because a MySQL install is built from tables.schema.ts alone and
// never replays SQLite's migration history — so this file, not the migrations,
// decides whether the two backends end up with the same shape. It is a pure
// function of the schema objects so that decision is reviewable, and testable,
// without a database.

import type { ColumnDefinition, TableSchema } from '../../types/database.types.js';
import { mysqlDialect } from '../dialects/mysql.dialect.js';
import { sqliteDialect } from '../dialects/sqlite.dialect.js';
import { indexes, tableSchemas } from './tables.schema.js';

const quote = (identifier: string): string => `\`${identifier}\``;

// Both sides of the translation come from the dialects, so a change to the
// stored timestamp shape lands on both backends or on neither.
const SQLITE_NOW = sqliteDialect.now();
const SQLITE_TODAY = sqliteDialect.today();
const MYSQL_NOW = mysqlDialect.now();
const MYSQL_TODAY = mysqlDialect.today();

/**
 * utf8mb4 is 4 bytes per character, so VARCHAR(255) is 1020 bytes — two of them
 * in a composite index is 2040, comfortably inside InnoDB's 3072-byte key limit.
 */
const INDEXED_TEXT = 'VARCHAR(255)';

/**
 * Every column that ends up in an index, a UNIQUE constraint, a primary key or
 * a foreign key, keyed by table.
 *
 * Gathered from four places because the schema declares these in four different
 * ways, and missing any one of them leaves a column TEXT that MySQL then refuses
 * to index — which does not degrade, it fails the CREATE TABLE outright.
 */
export const indexedColumnsFor = (
  schemas: readonly TableSchema[],
  indexSql: readonly string[]
): Map<string, Set<string>> => {
  const map = new Map<string, Set<string>>();

  const add = (table: string, column: string): void => {
    const existing = map.get(table) ?? new Set<string>();
    existing.add(column);
    map.set(table, existing);
  };

  // 1. Columns named in a CREATE INDEX statement.
  for (const sql of indexSql) {
    const match = /ON\s+(\w+)\s*\(([^)]+)\)/i.exec(sql);
    if (match?.[1] === undefined || match[2] === undefined) continue;

    for (const raw of match[2].split(',')) {
      const column = raw.trim().split(/\s+/)[0];
      if (column !== undefined && column.length > 0) add(match[1], column);
    }
  }

  for (const schema of schemas) {
    // 2. Per-column UNIQUE and PRIMARY KEY, e.g. users.email is declared
    //    'UNIQUE NOT NULL' on the column and appears in no index list.
    for (const column of schema.columns) {
      const constraints = (column.constraints ?? []).join(' ').toUpperCase();

      if (constraints.includes('UNIQUE') || constraints.includes('PRIMARY KEY')) {
        add(schema.name, column.name);
      }
    }

    for (const constraint of schema.constraints ?? []) {
      // 3. Table-level foreign keys. MySQL requires an index on the referencing
      //    column and creates one implicitly, so the column must be indexable.
      const foreign = /FOREIGN KEY\s*\(\s*(\w+)\s*\)/i.exec(constraint);
      if (foreign?.[1] !== undefined) add(schema.name, foreign[1]);

      // 4. Table-level UNIQUE.
      const unique = /UNIQUE\s*\(([^)]+)\)/i.exec(constraint);
      if (unique?.[1] !== undefined) {
        for (const raw of unique[1].split(',')) {
          const column = raw.trim();
          if (column.length > 0) add(schema.name, column);
        }
      }
    }
  }

  return map;
};

/** Types MySQL refuses to give a bare literal default. */
const needsExpressionDefault = (type: string): boolean =>
  type === 'TEXT' || type === 'MEDIUMBLOB';

/**
 * Translate a column's SQLite constraint list.
 *
 * AUTOINCREMENT is spelled differently and must sit beside the type rather than
 * after PRIMARY KEY. Expression defaults keep their parentheses, which MySQL has
 * accepted since 8.0.13 and MariaDB since 10.2 — the floors asserted at boot.
 *
 * The parenthesising of literals is not cosmetic. MySQL: "The BLOB, TEXT,
 * GEOMETRY, and JSON data types can be assigned a default value only if the
 * value is written as an expression, even if the expression value is a
 * literal." So `role TEXT DEFAULT 'user'` is rejected outright while
 * `role TEXT DEFAULT ('user')` is accepted, and ten columns in this schema are
 * declared the first way. Nothing caught it until the generated DDL was run
 * against a real server, because as text the statement looks perfectly ordinary.
 */
const translateConstraints = (constraints: readonly string[], type: string): string => {
  // Split/join rather than a regex: the SQLite spellings come from the dialect
  // and contain `(`, `'` and `%`, so building a pattern from them would need
  // escaping that the next edit to the dialect would silently invalidate.
  const translated = constraints
    .join(' ')
    .replace(/PRIMARY KEY AUTOINCREMENT/i, 'AUTO_INCREMENT PRIMARY KEY')
    .split(SQLITE_NOW)
    .join(MYSQL_NOW)
    .split(SQLITE_TODAY)
    .join(MYSQL_TODAY)
    .trim();

  if (!needsExpressionDefault(type)) return translated;

  // Skips a default that is already an expression — the timestamp defaults
  // arrive parenthesised and come out already wrapped.
  return translated.replace(/\bDEFAULT\s+(?!\()('[^']*'|\S+)/i, 'DEFAULT ($1)');
};

export const mysqlColumnType = (
  column: ColumnDefinition,
  indexedColumns: ReadonlySet<string>
): string => {
  switch (column.type) {
    case 'INTEGER':
      return 'INT';
    case 'REAL':
    case 'NUMERIC':
      // DOUBLE, never DECIMAL. DECIMAL is the correct type for money and REAL
      // is not, but mapping only MySQL to it would make the same invoice total
      // differently depending on which backend stored it. Currency precision is
      // a real defect in this schema and gets fixed for both backends together.
      return 'DOUBLE';
    case 'BLOB':
      return 'MEDIUMBLOB';
    case 'TEXT':
    default:
      // MySQL cannot index TEXT without a prefix length, so anything reachable
      // by an index, a unique constraint, a primary key or a foreign key has to
      // be VARCHAR.
      return indexedColumns.has(column.name) ? INDEXED_TEXT : 'TEXT';
  }
};

export const renderCreateTable = (schema: TableSchema, indexed: ReadonlySet<string>): string => {
  const columns = schema.columns.map(column => {
    const type = mysqlColumnType(column, indexed);
    const constraints = translateConstraints(column.constraints ?? [], type);

    return `${quote(column.name)} ${type}${constraints.length > 0 ? ` ${constraints}` : ''}`;
  });

  return (
    `CREATE TABLE IF NOT EXISTS ${quote(schema.name)} (\n  ` +
    [...columns, ...(schema.constraints ?? [])].join(',\n  ') +
    '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
  );
};

/**
 * Translate a CREATE INDEX statement, or null when it is not one.
 *
 * Two SQLite features are dropped:
 *
 *   - IF NOT EXISTS, which MySQL 8 rejects on CREATE INDEX. MariaDB accepts it,
 *     but the deploy target is MySQL and one form has to work on both.
 *   - The WHERE clause of a partial index. For the three that exist the clause
 *     is either an optimisation (the two token-table indexes, narrowing to
 *     unused rows) or emulating MySQL's own NULL handling
 *     (idx_invoices_recurring_period, where MySQL unique indexes already permit
 *     multiple NULLs), so no guarantee is lost.
 *
 * A future partial index whose predicate carries a real guarantee would need a
 * different answer. That is why the drop is documented rather than silent.
 */
export const renderIndex = (sql: string): string | null => {
  const flattened = sql.replace(/\s+/g, ' ').trim();

  if (!/^CREATE\s+(UNIQUE\s+)?INDEX/i.test(flattened)) return null;

  return flattened
    .replace(/\bIF NOT EXISTS\s+/i, '')
    .replace(/\s+WHERE\s+.*$/i, '')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
};

/**
 * The token tables are raw SQL in tokenTables.schema.ts rather than schema
 * objects, so their MySQL form is declared here. Keeping it beside the renderer
 * means one file to check when either side changes.
 *
 * expires_at and used_at are VARCHAR because the active-token indexes cover
 * them; created_at is not indexed anywhere, so it stays TEXT — the same rule the
 * renderer applies to the schema objects, applied by hand.
 */
const TOKEN_TABLES: readonly string[] = ['password_reset_tokens', 'email_verification_tokens'].map(
  table => `CREATE TABLE IF NOT EXISTS \`${table}\` (
  \`id\` INT AUTO_INCREMENT PRIMARY KEY,
  \`user_id\` INT NOT NULL,
  \`token_hash\` VARCHAR(255) NOT NULL UNIQUE,
  \`expires_at\` VARCHAR(64) NOT NULL,
  \`used_at\` VARCHAR(64) DEFAULT NULL,
  \`created_at\` TEXT NOT NULL DEFAULT (${MYSQL_NOW}),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
);

const TOKEN_INDEXES: readonly string[] = [
  'CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens (user_id)',
  'CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens (expires_at)',
  'CREATE INDEX idx_password_reset_tokens_active ON password_reset_tokens (token_hash, expires_at, used_at)',
  'CREATE INDEX idx_email_verification_tokens_user_id ON email_verification_tokens (user_id)',
  'CREATE INDEX idx_email_verification_tokens_expires_at ON email_verification_tokens (expires_at)',
  'CREATE INDEX idx_email_verification_tokens_active ON email_verification_tokens (token_hash, expires_at, used_at)'
];

/**
 * Every statement needed to build a complete MySQL schema, in order: all tables
 * first (dependency order, as tableSchemas already declares), then all indexes.
 *
 * No triggers. MySQL error 1442 forbids a trigger updating the table it is
 * attached to, which is exactly what update_expenses_timestamp does. Every
 * service writes updated_at explicitly, so nothing depends on it.
 */
export const mysqlSchemaStatements = (): string[] => {
  const indexed = indexedColumnsFor(tableSchemas, indexes);

  const tables = tableSchemas.map(schema =>
    renderCreateTable(schema, indexed.get(schema.name) ?? new Set<string>())
  );

  const indexStatements = [...indexes, ...TOKEN_INDEXES]
    .map(renderIndex)
    .filter((sql): sql is string => sql !== null);

  return [...tables, ...TOKEN_TABLES, ...indexStatements];
};
