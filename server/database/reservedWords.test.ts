/**
 * `key` is a reserved word in MySQL and an ordinary identifier in SQLite, so
 * `SELECT key FROM settings` runs on one backend and is a syntax error on the
 * other. Backticks are accepted by both — SQLite supports them explicitly for
 * MySQL compatibility — so the fix is to quote, not to rename the column.
 *
 * This test exists because the failure is invisible until a MySQL install runs
 * the exact code path, and settings are read on nearly every page.
 *
 * Scanning is line by line rather than by tokenising the file: a single
 * apostrophe in a comment ("doesn't") desynchronises a regex string-matcher for
 * everything after it, which silently hid most of the real offenders when this
 * test was first written.
 */

import { describe, it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOTS = [
  'server/services',
  'server/core',
  'server/database',
  'server/controllers',
  'server/runtime'
];

/**
 * Migrations are exempt. They only ever run on SQLite — a MySQL database is
 * built from tables.schema.ts by the baseline and has its migration history
 * recorded as already applied — so their SQLite-specific SQL is correct as it
 * stands, and rewriting it would risk a replay that already works.
 */
const EXEMPT = /server[\\/]database[\\/]migrations[\\/]/;

/** Reserved in MySQL 8 and used as a column name somewhere in this schema. */
const RESERVED = ['key'];

const SQL_HINT = /\b(SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/i;

/**
 * `KEY` is also an SQL keyword in its own right — FOREIGN KEY, PRIMARY KEY, and
 * MySQL's ON DUPLICATE KEY. Those are not column references and must not be
 * quoted, so they are removed before the column check runs.
 */
export const withoutKeyPhrases = (sql: string): string =>
  sql.replace(/\b(FOREIGN|PRIMARY|UNIQUE|DUPLICATE)\s+KEY\b/gi, '$1_KEYWORD');

/**
 * The SQL-carrying part of a line: its quoted literals, or the whole line when
 * it has no quotes at all (an interior line of a multi-line template literal).
 * Everything else on the line is TypeScript, where a variable named `key` is
 * perfectly fine.
 */
const sqlPartsOf = (line: string): string[] => {
  const literals = line.match(/'[^']*'|"[^"]*"|`[^`]*`/g);

  if (literals !== null) return literals;

  if (/['"`]/.test(line)) return [];

  // An unquoted line is only SQL if it carries no TypeScript punctuation.
  // `async delete(key: string): Promise<void> {` matches DELETE otherwise.
  // The cost is that an interior template line containing ${…} is skipped;
  // none of the multi-line SQL in this codebase both interpolates and names a
  // reserved column, and the literal path covers every single-line statement.
  return /[;{}]|=>/.test(line) ? [] : [line];
};

const isComment = (line: string): boolean => /^\s*(\/\/|\/\*|\*)/.test(line);

const walk = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });

  const nested = await Promise.all(
    entries.map(async entry => {
      const full = join(dir, entry.name);

      if (entry.isDirectory()) return walk(full);

      return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
    })
  );

  return nested.flat();
};

const bareReference = (word: string): RegExp => new RegExp(`(?<![\`\\w.$])${word}(?![\`\\w])`, 'i');

describe('reserved-word quoting', () => {
  it('never references a reserved column name unquoted in SQL', async () => {
    const files = (await Promise.all(ROOTS.map(walk))).flat();
    const offenders: string[] = [];

    for (const file of files) {
      if (EXEMPT.test(file)) continue;

      const source = await readFile(file, 'utf8');

      source.split('\n').forEach((line, index) => {
        if (isComment(line)) return;

        for (const part of sqlPartsOf(line)) {
          if (!SQL_HINT.test(part)) continue;

          const scanned = withoutKeyPhrases(part);

          for (const word of RESERVED) {
            if (bareReference(word).test(scanned)) {
              offenders.push(`${file}:${index + 1}  ${line.trim()}`);
            }
          }
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('detects an unquoted reserved word, so a green result means something', () => {
    // Guards the guard. A matcher that matched nothing would make the test above
    // pass forever, which is the failure mode this whole file exists to prevent.
    const bare = bareReference('key');

    expect(bare.test('SELECT key, value FROM settings')).toBe(true);
    expect(bare.test('SELECT `key`, value FROM settings')).toBe(false);
    expect(bare.test('SELECT value FROM settings WHERE monkey = ?')).toBe(false);
    expect(bare.test('SELECT value FROM settings WHERE s.key = ?')).toBe(false);

    expect(bare.test(withoutKeyPhrases('FOREIGN KEY (user_id) REFERENCES users (id)'))).toBe(false);
    expect(bare.test(withoutKeyPhrases('id INTEGER PRIMARY KEY AUTOINCREMENT'))).toBe(false);
    expect(bare.test(withoutKeyPhrases('INSERT INTO settings (key) VALUES (?)'))).toBe(true);
  });

  it('reads SQL out of a line without tripping over TypeScript on the same line', () => {
    // The line that motivated this: a bound parameter named `key` sits beside
    // the statement that must quote its column.
    const line = `const r = await db.getOne('SELECT value FROM settings WHERE key = ?', [key]);`;

    expect(sqlPartsOf(line)).toEqual([`'SELECT value FROM settings WHERE key = ?'`]);
  });

  it('treats an unquoted line as SQL, so multi-line template literals are covered', () => {
    expect(sqlPartsOf('          SELECT value FROM settings WHERE key = ?')).toEqual([
      '          SELECT value FROM settings WHERE key = ?'
    ]);
  });

  it('does not mistake a TypeScript signature for SQL', () => {
    // `delete(key: string): Promise<void>` matched DELETE and reported the
    // StorageProvider interface as an offender.
    expect(sqlPartsOf('  delete(key: string): Promise<void>;')).toEqual([]);
    expect(sqlPartsOf('  async delete(key: string): Promise<void> {')).toEqual([]);
  });
});
