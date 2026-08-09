// Building a MySQL schema from nothing.
//
// A MySQL database is built once from tables.schema.ts and its migration
// history recorded as already applied. Migrations 001-012 are SQLite
// archaeology — PRAGMA table_info guards, a create-copy-drop-rename table
// rebuild — and none of it can or should run on a dialect with no PRAGMA.
//
// That makes tables.schema.ts the sole definition of a MySQL install's shape,
// which is why the schema-drift test in index.test.ts is load-bearing rather
// than nice to have: if a migration would still alter a freshly-created
// database, this baseline produces the wrong schema and the two backends
// diverge from the moment the MySQL one is created.

import type { IDatabase } from '../types/database.types.js';
import { mysqlSchemaStatements } from './schemas/mysql.ddl.js';
import { markAllMigrationsApplied } from './migrations/index.js';

interface VersionRow {
  version: string;
}

interface EngineRow {
  ENGINE: string;
  SUPPORT: string;
}

/**
 * Version floors, and what breaks below them.
 *
 * MySQL 8.0.13 introduced expression defaults, and BLOB/TEXT columns can be
 * given a default ONLY in expression form — which is exactly what every
 * created_at in this schema uses. Below that floor the CREATE TABLE is a syntax
 * error, so the failure is loud but unexplained; this turns it into a sentence
 * an operator can act on.
 *
 * MariaDB gained both in 10.2.
 */
const MYSQL_FLOOR = [8, 0, 13];
const MARIADB_FLOOR = [10, 2];

const parseVersion = (raw: string): number[] =>
  (raw.split('-')[0] ?? '').split('.').map(part => Number(part) || 0);

const atLeast = (actual: readonly number[], floor: readonly number[]): boolean => {
  for (let index = 0; index < floor.length; index++) {
    const left = actual[index] ?? 0;
    const right = floor[index] ?? 0;

    if (left > right) return true;
    if (left < right) return false;
  }

  return true;
};

/**
 * Refuse to build against a server that cannot honour the schema's assumptions.
 *
 * Both checks exist because "near-certain on any current managed server" is how
 * ENABLE_HTTPS came to be read by nothing for months.
 */
export const assertMysqlCapabilities = async (db: IDatabase): Promise<void> => {
  const versionRow = await db.getOne<VersionRow>('SELECT VERSION() as version');
  const raw = versionRow?.version ?? '';
  const isMaria = /mariadb/i.test(raw);
  const floor = isMaria ? MARIADB_FLOOR : MYSQL_FLOOR;

  if (!atLeast(parseVersion(raw), floor)) {
    throw new Error(
      `Slimbooks needs ${isMaria ? 'MariaDB' : 'MySQL'} ${floor.join('.')} or newer; this server ` +
        `reports "${raw}". Below that, columns cannot take an expression default, and every ` +
        `created_at in the schema uses one.`
    );
  }

  const engine = await db.getOne<EngineRow>(
    "SELECT ENGINE, SUPPORT FROM INFORMATION_SCHEMA.ENGINES WHERE ENGINE = 'InnoDB'"
  );

  if (engine === null || !['YES', 'DEFAULT'].includes(engine.SUPPORT)) {
    throw new Error(
      'InnoDB is not available on this server. Slimbooks creates every table with ENGINE=InnoDB ' +
        'because MyISAM ignores transactions silently, which would let an interrupted ' +
        'recurring-invoice run bill a customer twice.'
    );
  }
};

/**
 * Whether an index already exists.
 *
 * MySQL 8 has no CREATE INDEX ... IF NOT EXISTS — the grammar simply does not
 * include it — so re-running the baseline would fail on the second boot without
 * this check. MariaDB does support the clause, but one form has to work on both.
 */
const indexExists = async (db: IDatabase, statement: string): Promise<boolean> => {
  const match = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+(\w+)/i.exec(statement);

  // An unparseable statement is left to the server to reject, rather than
  // silently skipped as "already there".
  if (match?.[1] === undefined || match[2] === undefined) return false;

  const row = await db.getOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [match[2], match[1]]
  );

  return (row?.count ?? 0) > 0;
};

const isIndexStatement = (statement: string): boolean =>
  /^CREATE\s+(UNIQUE\s+)?INDEX/i.test(statement);

/**
 * Build the complete schema, then record every migration as already applied.
 *
 * Idempotent: tables use CREATE TABLE IF NOT EXISTS, indexes are checked first,
 * and the migration recording skips ids already present. A process killed
 * part-way through simply resumes on the next boot.
 */
export const buildMysqlBaseline = async (db: IDatabase): Promise<void> => {
  await assertMysqlCapabilities(db);

  for (const statement of mysqlSchemaStatements()) {
    if (isIndexStatement(statement) && (await indexExists(db, statement))) continue;

    await db.executeQuery(statement);
  }

  await markAllMigrationsApplied(db);
};
