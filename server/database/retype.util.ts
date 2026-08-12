// Changing a column's stored type, on a database that already holds data.
//
// Written for migration 015 (text timestamps to epoch milliseconds) but not
// specific to it: the caller names the columns, the new physical type and the
// SQL expression converting old values to new. The currency-precision change
// needs the same three things.
//
// The two engines need genuinely different strategies, and that difference is
// the whole reason this file exists rather than an `if` in a migration body.

import type { IDatabase } from '../types/database.types.js';

export interface ColumnRetype {
  /** The column to convert. */
  column: string;
  /**
   * Its new definition, minus the name — type and any constraints.
   * SQLite: `INTEGER NOT NULL DEFAULT (…)`. MySQL: `BIGINT NOT NULL`.
   */
  definition: string;
  /** SQL expression turning the stored value into the new one. */
  conversion: string;
}

/** Whether the column is already the type we are converting to. */
const alreadyRetyped = (declared: string, definition: string): boolean => {
  const target = definition.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
  const current = declared.trim().split(/[\s(]/)[0]?.toUpperCase() ?? '';

  // BIGINT and INTEGER are the two targets; SQLite reports INT for both.
  const normalise = (type: string) => (type === 'INT' || type === 'BIGINT' ? 'INTEGER' : type);

  return normalise(current) === normalise(target);
};

interface SqliteColumn {
  name: string;
  type: string;
}

/**
 * Split a CREATE TABLE body into its comma-separated items.
 *
 * Depth- and quote-aware, because a column definition can contain both: the
 * timestamp columns are declared `DEFAULT (datetime('now'))`, which carries a
 * nested paren *and* a quoted string. A regex that stopped at the first `)`
 * produced `created_at INTEGER NOT NULL))` and a syntax error — which is how
 * this function came to exist rather than the regex it replaced.
 */
const splitDefinitions = (body: string): string[] => {
  const items: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let index = 0; index < body.length; index++) {
    const character = body[index]!;

    if (quote !== null) {
      // '' inside a single-quoted string is an escaped quote, not a close.
      if (character === quote && body[index + 1] === quote) index++;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === "'" || character === '"' || character === '`') quote = character;
    else if (character === '(') depth++;
    else if (character === ')') depth--;
    else if (character === ',' && depth === 0) {
      items.push(body.slice(start, index));
      start = index + 1;
    }
  }

  items.push(body.slice(start));
  return items;
};

/** The column a definition declares, or null for a table-level constraint. */
const declaredColumn = (definition: string): string | null => {
  const match = /^\s*(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|(\w+))/.exec(definition);
  const name = match?.[1] ?? match?.[2] ?? match?.[3] ?? match?.[4] ?? null;
  if (name === null) return null;

  // FOREIGN KEY / PRIMARY KEY / UNIQUE / CHECK / CONSTRAINT start a table-level
  // clause, never a column.
  return /^(FOREIGN|PRIMARY|UNIQUE|CHECK|CONSTRAINT)$/i.test(name) ? null : name;
};

/**
 * The same CREATE TABLE, under a new name, with the named columns redeclared.
 *
 * Everything else — foreign keys, table constraints, column order, defaults on
 * columns that are not being retyped — survives verbatim, because it is the
 * table's own DDL being edited rather than a schema object being re-rendered.
 */
export const rewriteCreateTable = (
  sql: string,
  newName: string,
  retypes: readonly ColumnRetype[]
): string => {
  const open = sql.indexOf('(');
  const close = sql.lastIndexOf(')');
  if (open === -1 || close <= open) {
    throw new Error(`Cannot parse CREATE TABLE: ${sql.slice(0, 80)}`);
  }

  const body = splitDefinitions(sql.slice(open + 1, close));

  const rewritten = body.map(definition => {
    const column = declaredColumn(definition);
    if (column === null) return definition;

    const retype = retypes.find(
      candidate => candidate.column.toLowerCase() === column.toLowerCase()
    );

    return retype ? `\n  ${column} ${retype.definition}` : definition;
  });

  return `CREATE TABLE ${newName} (${rewritten.join(',')}${sql.slice(close)}`;
};

/**
 * SQLite: rebuild the table.
 *
 * `ALTER TABLE` cannot retype a column, and there is no gradual path — a TEXT
 * column has TEXT affinity, so writing `1786546225000` into one yields
 * `"1786546225000.0"`, round-tripped through a float. SQLite's documented
 * twelve-step procedure it is.
 *
 * The new DDL is derived from the old table's own `sqlite_master.sql` rather
 * than re-rendered from the schema objects, so foreign keys, table-level
 * constraints and column order survive verbatim — and so tables that are not
 * schema objects at all (the two token tables, `boot_locks`, `migrations`) go
 * through the same path.
 */
const retypeSqlite = async (
  db: IDatabase,
  table: string,
  retypes: readonly ColumnRetype[]
): Promise<boolean> => {
  const columns = await db.getMany<SqliteColumn>(`PRAGMA table_info(${table})`);
  if (columns.length === 0) return false;

  const pending = retypes.filter(retype => {
    const existing = columns.find(column => column.name === retype.column);
    return existing !== undefined && !alreadyRetyped(existing.type, retype.definition);
  });

  if (pending.length === 0) return false;

  const original = await db.getOne<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table]
  );
  if (!original?.sql) return false;

  // Indexes do not survive DROP TABLE — verified, and easy to miss because
  // nothing fails, queries just quietly stop using them. Captured now,
  // recreated after. `sql IS NULL` excludes the implicit indexes SQLite builds
  // for UNIQUE and PRIMARY KEY, which the rebuilt CREATE TABLE remakes itself.
  const indexes = await db.getMany<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL",
    [table]
  );

  const temporary = `${table}__retype`;
  const ddl = rewriteCreateTable(original.sql, temporary, pending);

  const selected = columns
    .map(column => {
      const retype = pending.find(candidate => candidate.column === column.name);
      return retype ? `${retype.conversion} AS ${column.name}` : column.name;
    })
    .join(', ');

  const names = columns.map(column => column.name).join(', ');

  // Foreign keys off for the duration: DROP TABLE on a referenced table would
  // otherwise fail, and the rename would be checked against a table that does
  // not exist yet.
  await db.executeQuery('PRAGMA foreign_keys = OFF');

  try {
    // One transaction, DDL included — SQLite's is transactional, so a SIGKILL
    // mid-rebuild leaves either the old table or the new one, never a partial
    // copy. That is what makes this resumable rather than merely retryable.
    await db.transaction(async () => {
      await db.executeQuery(ddl);
      await db.executeQuery(`INSERT INTO ${temporary} (${names}) SELECT ${selected} FROM ${table}`);
      await db.executeQuery(`DROP TABLE ${table}`);
      await db.executeQuery(`ALTER TABLE ${temporary} RENAME TO ${table}`);
    });

    for (const index of indexes) {
      await db.executeQuery(index.sql);
    }

    const violations = await db.getMany('PRAGMA foreign_key_check');
    if (violations.length > 0) {
      throw new Error(
        `Retyping ${table} left ${violations.length} foreign-key violation(s); database unchanged`
      );
    }
  } finally {
    await db.executeQuery('PRAGMA foreign_keys = ON');
  }

  return true;
};

/**
 * MySQL: convert in place, then retype.
 *
 * No rebuild needed, and no risk of losing an index or a constraint, because
 * nothing is dropped. Two statements per column, both set-based.
 *
 * MySQL DDL is not transactional, so resumability is per column rather than
 * per table: a column already the target type is skipped whole, and a crash
 * between the UPDATE and the ALTER leaves numeric text that the conversion
 * passes through untouched on the next run.
 */
const retypeMysql = async (
  db: IDatabase,
  table: string,
  retypes: readonly ColumnRetype[]
): Promise<boolean> => {
  const declared = await db.getMany<{ COLUMN_NAME: string; COLUMN_TYPE: string }>(
    `SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  if (declared.length === 0) return false;

  let changed = false;

  for (const retype of retypes) {
    const existing = declared.find(column => column.COLUMN_NAME === retype.column);
    if (!existing) continue;
    if (alreadyRetyped(existing.COLUMN_TYPE, retype.definition)) continue;

    // Values first, while the column still holds text. Assigning a number to a
    // TEXT column stores its digits, which the next ALTER then reads back as a
    // number — no intermediate column, no second table.
    await db.executeQuery(
      `UPDATE \`${table}\` SET \`${retype.column}\` = ${retype.conversion} ` +
      `WHERE \`${retype.column}\` IS NOT NULL`
    );

    await db.executeQuery(
      `ALTER TABLE \`${table}\` MODIFY \`${retype.column}\` ${retype.definition}`
    );

    changed = true;
  }

  return changed;
};

/**
 * Bring a table's stored types in line, converting the data as it goes.
 *
 * Idempotent: a column already at the target type is skipped, so a second run
 * does nothing and an interrupted run resumes correctly. Returns whether
 * anything was actually changed, which is only used for the migration's log
 * line.
 */
export const retypeColumns = async (
  db: IDatabase,
  table: string,
  retypes: readonly ColumnRetype[]
): Promise<boolean> => {
  if (!(await db.tableExists(table))) return false;

  return db.dialect.name === 'sqlite'
    ? retypeSqlite(db, table, retypes)
    : retypeMysql(db, table, retypes);
};
