/**
 * The rule that an install can never be left without an administrator.
 *
 * It is a SQL predicate rather than an application check on purpose. Counting
 * administrators and then deleting one is check-then-act: two concurrent
 * deletes of the last two administrators both pass the count and both proceed.
 * Appending the predicate to the statement makes the check and the write a
 * single operation, and **zero affected rows is the refusal** — there is
 * nothing else to interrogate.
 *
 * No project imports, so it loads standalone under Vitest.
 */

/** The role that the guard protects. */
const ADMIN_ROLE = 'admin';

/**
 * Refuses any statement that would remove or demote the last live administrator.
 *
 * The subquery is wrapped in a derived table, and that is not cosmetic:
 * **MySQL rejects a bare subquery over the table being mutated** with
 * ER_UPDATE_TABLE_USED (1093), "You can't specify target table 'users' for
 * update in FROM clause". SQLite and MariaDB accept both forms — which is the
 * trap, because one `mysqlDialect` serves MySQL and MariaDB alike, so anyone
 * testing only against MariaDB would unwrap this and ship SQL MySQL refuses.
 * There is deliberately no `SqlDialect` method for this: the derived-table
 * form is portable across all three engines, so there is no dialect
 * difference to encode, and a method returning the same string for both
 * dialects would be ceremony.
 *
 * `deleted_at IS NULL` matters for the same reason it always does here: a
 * soft-deleted administrator cannot administer anything, so counting one would
 * let the last live administrator be removed.
 */
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

const assertIdentifier = (name: string): void => {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`"${name}" is not a plain identifier.`);
  }
};

/**
 * The guard predicate for one table.
 *
 * `table` exists so the live suite can prove this against a fixture table of
 * its own. `baselineLive.test.ts` drops every table in `tableSchemas` —
 * `users` among them — inside the same `slimbooks_test` database, and vitest
 * runs test files in parallel, so a live suite operating on `users` would race
 * it and fail in a way that looks like the guard is broken.
 */
export const lastAdminGuard = (table = 'users'): string => {
  assertIdentifier(table);

  return (
    `NOT (role = '${ADMIN_ROLE}' AND ` +
    `(SELECT live FROM (SELECT COUNT(*) AS live FROM ${table} ` +
    `WHERE role = '${ADMIN_ROLE}' AND deleted_at IS NULL) AS live_admins) <= 1)`
  );
};

/** The guard as it reads against the real `users` table. */
export const LAST_ADMIN_GUARD = lastAdminGuard();

/** Delete one user, unless doing so would remove the last administrator. */
export const deleteUserSql = (table = 'users'): string => {
  assertIdentifier(table);

  return `DELETE FROM ${table} WHERE id = ? AND ${lastAdminGuard(table)}`;
};

/**
 * Update one user, guarding the statement when it demotes.
 *
 * Column names are interpolated because a placeholder cannot stand in for an
 * identifier; every one is checked against a plain-identifier pattern first.
 * Values stay bound.
 *
 * @param columns Columns to SET, in the order their parameters are bound.
 * @param guarded Whether this update would demote an administrator.
 */
export const guardedUpdateSql = (
  columns: string[],
  guarded: boolean,
  table = 'users'
): string => {
  if (columns.length === 0) {
    throw new Error('An update needs at least one column.');
  }

  assertIdentifier(table);
  columns.forEach(assertIdentifier);

  const assignments = columns.map(column => `${column} = ?`).join(', ');
  const guard = guarded ? ` AND ${lastAdminGuard(table)}` : '';

  return `UPDATE ${table} SET ${assignments} WHERE id = ?${guard}`;
};

/** Whether setting this role would take administrator rights away. */
export const demotesAdmin = (role: unknown): boolean =>
  typeof role === 'string' && role !== ADMIN_ROLE;
