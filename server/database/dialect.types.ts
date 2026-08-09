// The places where SQLite and MySQL genuinely disagree.
//
// Deliberately a small object, not a query builder. Everything else in this
// codebase is already portable ANSI SQL — soft-delete filtering, pagination,
// joins — and a builder would obscure that by rewriting statements that never
// needed rewriting. What is collected here is only what breaks.

import type { IDatabase, SQLParameter } from '../types/database.types.js';

export type DialectName = 'sqlite' | 'mysql';

/** The calendar units the report queries actually use. */
export type DateUnit = 'day' | 'month' | 'year';

/** A statement and the parameters that go with it, since the two co-vary. */
export interface ConditionalUpsert {
  sql: string;
  params: SQLParameter[];
}

export interface ConditionalUpsertSpec {
  table: string;
  /** Column names in insert order. */
  columns: string[];
  /** Values for `columns`, same order. */
  values: SQLParameter[];
  /** The column whose uniqueness defines the conflict. */
  conflictColumn: string;
  /** Columns to overwrite when the condition holds. */
  updateColumns: string[];
  /**
   * A predicate over the EXISTING row, with `?` placeholders. Written in terms
   * of the table's own name (`scheduler_leases.expires_at <= ?`), which both
   * dialects accept.
   */
  condition: string;
  conditionParams: SQLParameter[];
  /**
   * A column the condition reads and the update also writes.
   *
   * MySQL evaluates assignments left to right and later ones observe earlier
   * ones, so such a column must be assigned last or every subsequent guard
   * tests the value just written. Naming it here lets the dialect reorder;
   * SQLite ignores it, since its WHERE clause is evaluated once up front.
   */
  conflictGuardColumn?: string;
}

export interface SqlDialect {
  readonly name: DialectName;

  /** Expression yielding `YYYY-MM-DD HH:MM:SS` in UTC. */
  now(): string;

  /** Expression yielding `YYYY-MM-DD` in UTC. */
  today(): string;

  /**
   * Expression yielding a UTC timestamp `count` units in the past.
   *
   * The count is interpolated rather than bound, because MySQL cannot take an
   * INTERVAL quantity as a placeholder. Implementations must therefore reject a
   * count that is not a non-negative integer — `getClientsWithRecentActivity`
   * takes its window from a request parameter.
   */
  nowMinus(count: number, unit: DateUnit): string;

  /** Expression yielding a UTC date `count` units in the past. */
  todayMinus(count: number, unit: DateUnit): string;

  /**
   * Expression rendering a date column as `YYYY-MM`, for grouping by month.
   *
   * SQLite says `strftime('%Y-%m', date)`; MySQL has no `strftime` at all and
   * spells it `DATE_FORMAT(date, '%Y-%m')`. Five report queries depend on this,
   * and report payloads are where a shape mismatch crashes the UI rather than
   * erroring cleanly.
   */
  formatMonth(column: string): string;

  /** Expression rendering a date column as `YYYY`, for grouping by year. */
  formatYear(column: string): string;

  /** Insert, ignoring a duplicate-key collision. */
  insertIgnore(table: string, columns: string[]): string;

  /** Insert, overwriting any existing row with the same key. */
  insertOrReplace(table: string, columns: string[]): string;

  /**
   * Insert, or overwrite only when the existing row satisfies a predicate.
   *
   * SQLite expresses this directly: `ON CONFLICT … DO UPDATE … WHERE`. MySQL's
   * `ON DUPLICATE KEY UPDATE` accepts no WHERE clause, so the predicate has to
   * be pushed into each assignment with `IF()`. That is not a translation a
   * caller should have to know about, which is why this returns both SQL and
   * parameters rather than a format string.
   *
   * Both forms must report `changes > 0` exactly when the caller won the race.
   */
  conditionalUpsert(spec: ConditionalUpsertSpec): ConditionalUpsert;

  /** The column names a table currently has, in declaration order. */
  columnsOf(db: IDatabase, table: string): Promise<string[]>;

  /** Whether `CREATE INDEX … WHERE …` is available. */
  readonly supportsPartialIndex: boolean;

  /** Whether a trigger may update the table it is attached to. */
  readonly supportsSelfUpdatingTrigger: boolean;
}
