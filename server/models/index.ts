// Raw better-sqlite3 handle, when SQLite is the active driver.
//
// This module also used to export an `initializeCompleteDatabase` bootstrap.
// Nothing called it, and it created tables and seeded WITHOUT running
// migrations — anything that did call it would have produced a database
// missing every migration. `initializeDatabase` in ../database/index.ts is the
// real entry point, and it is what app.ts starts the server with.

import type Database from 'better-sqlite3';
import { activeDatabase } from '../database/index.js';
import { SQLiteDatabase } from '../database/SQLiteDatabase.js';

/**
 * The underlying better-sqlite3 object, or null when the active driver is not
 * SQLite.
 *
 * Shutdown and the error handler use it to checkpoint the WAL, which has no
 * meaning on MySQL. Nullable rather than absent so both callers are made to
 * acknowledge that case at the type level, and a function rather than a value
 * because the driver is not chosen until initializeDatabase runs — a captured
 * constant would pin the SQLite singleton whatever the configuration said.
 */
export const rawSqliteHandle = (): Database.Database | null => {
  const active = activeDatabase();

  return active instanceof SQLiteDatabase && active.isConnected()
    ? active.getRawConnection()
    : null;
};
