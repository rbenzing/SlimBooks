// The places where SQLite and MySQL genuinely disagree.
//
// Deliberately a small object, not a query builder. Everything else in this
// codebase is already portable ANSI SQL — soft-delete filtering, pagination,
// joins — and a builder would obscure that by rewriting statements that never
// needed rewriting. What is collected here is only what breaks.

import type { IDatabase } from '../types/database.types.js';

export type DialectName = 'sqlite' | 'mysql';

/** The calendar units the report queries actually use. */
export type DateUnit = 'day' | 'month' | 'year';

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

  /** The column names a table currently has, in declaration order. */
  columnsOf(db: IDatabase, table: string): Promise<string[]>;

  /**
   * Statements bracketing a bulk load, to suspend foreign-key enforcement.
   *
   * Import inserts in dependency order, so this is belt and braces — but a
   * source database with a row pointing at a parent that was hard-deleted years
   * ago would otherwise abort the whole transfer, and refusing to move a
   * customer's books because of one orphan is the wrong trade.
   */
  readonly deferForeignKeys: string;
  readonly restoreForeignKeys: string;

  /** Whether `CREATE INDEX … WHERE …` is available. */
  readonly supportsPartialIndex: boolean;

  /** Whether a trigger may update the table it is attached to. */
  readonly supportsSelfUpdatingTrigger: boolean;
}
