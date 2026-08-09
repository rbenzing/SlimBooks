// Exclusive claim over a single keyed row: the primitive behind the boot lock
// and the scheduler lease.
//
// Both need "insert if absent, or take over only when the existing row permits
// it" as one indivisible decision. This used to be a single statement —
// SQLite's ON CONFLICT ... DO UPDATE ... WHERE, translated for MySQL by pushing
// the predicate into each assignment with IF(). That translation rested on
// assignment evaluation order, and MySQL documents ordering only for plain
// UPDATE ("Single-table UPDATE assignments are generally evaluated from left to
// right") — not for ON DUPLICATE KEY UPDATE, and not without the word
// "generally". Getting it wrong is silent: the guard reads the value it just
// wrote, the lock stops excluding anyone, and two instances bill the same
// customer twice.
//
// So the claim is expressed with statements whose semantics both engines
// actually document:
//
//   1. UPDATE ... WHERE key = ? AND (takeover predicate)
//   2. INSERT-if-absent, when no row was updated
//   3. a confirming read, when neither reported a change
//
// Step 3 exists because MySQL's affected-rows counts rows CHANGED, not matched —
// "If you set a column to the value it currently has, MySQL notices this and
// does not update it" — while SQLite counts the row regardless. Without the
// read, a holder renewing with byte-identical values would be told it had lost
// its own lease on MySQL and kept it on SQLite. Reading the owner back settles
// it the same way on both.
//
// Each step is a single autocommit statement, so two racing instances cannot
// both observe "unheld": the UPDATE takes a row lock and the loser re-evaluates
// its predicate against the winner's committed row, and the INSERT collides on
// the primary key.

import type { IDatabase, SQLParameter } from '../types/database.types.js';

export interface ClaimSpec {
  table: string;
  /** The uniquely-keyed column identifying the row being claimed. */
  keyColumn: string;
  keyValue: SQLParameter;
  /** Column holding the claimant's identity. Must be one of `values`. */
  ownerColumn: string;
  owner: string;
  /** Columns to write, excluding the key. Must include `ownerColumn`. */
  values: Readonly<Record<string, SQLParameter>>;
  /**
   * Predicate over the EXISTING row that permits a takeover, with `?`
   * placeholders — e.g. `expires_at <= ?`. Unqualified column names, which both
   * engines resolve against the table being updated.
   */
  takeoverCondition: string;
  takeoverParams: readonly SQLParameter[];
}

const quote = (identifier: string): string => `\`${identifier}\``;

/**
 * Claim the row, or report that someone else holds it.
 *
 * @returns true when the caller now holds the claim.
 */
export const claimExclusive = async (db: IDatabase, spec: ClaimSpec): Promise<boolean> => {
  if (!Object.keys(spec.values).includes(spec.ownerColumn)) {
    throw new Error(`claimExclusive: values must include the owner column "${spec.ownerColumn}".`);
  }

  const columns = Object.keys(spec.values);

  // 1. Take over an existing row, if its own state permits.
  const assignments = columns.map(column => `${quote(column)} = ?`).join(', ');

  const updated = await db.executeQuery(
    `UPDATE ${spec.table} SET ${assignments} ` +
      `WHERE ${quote(spec.keyColumn)} = ? AND (${spec.takeoverCondition})`,
    [...columns.map(column => spec.values[column] as SQLParameter), spec.keyValue, ...spec.takeoverParams]
  );

  if (updated.changes > 0) return true;

  // 2. No row to take over — create it. Ignoring the collision is what makes
  //    this safe to race: the loser gets zero rows, not an error.
  const inserted = await db.executeQuery(
    db.dialect.insertIgnore(spec.table, [spec.keyColumn, ...columns]),
    [spec.keyValue, ...columns.map(column => spec.values[column] as SQLParameter)]
  );

  if (inserted.changes > 0) return true;

  // 3. Neither reported a change. Either someone else holds the row, or this
  //    caller already held it and rewrote identical values — which MySQL
  //    reports as zero rows changed. The owner column distinguishes them.
  const held = await db.getOne<Record<string, string>>(
    `SELECT ${quote(spec.ownerColumn)} FROM ${spec.table} WHERE ${quote(spec.keyColumn)} = ?`,
    [spec.keyValue]
  );

  return held?.[spec.ownerColumn] === spec.owner;
};
