// Raw database handle, used for graceful shutdown.
//
// This module also used to export an `initializeCompleteDatabase` bootstrap.
// Nothing called it, and it created tables and seeded WITHOUT running
// migrations — anything that did call it would have produced a database
// missing every migration. `initializeDatabase` in ../database/index.ts is the
// real entry point, and it is what app.ts starts the server with.

import type Database from 'better-sqlite3';
import { database } from '../database/SQLiteDatabase.js';

export const db: Database.Database = database.getRawConnection();
