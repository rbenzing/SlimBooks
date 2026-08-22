// Database controller - handles database backup and restore operations
import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { createReadStream, existsSync, unlinkSync, statSync } from 'fs';
import { copyFile } from 'fs/promises';
import { join } from 'node:path';
import multer from 'multer';
import { closeDatabase, initializeDatabase } from '../database/index.js';
import { databaseService } from '../core/DatabaseService.js';
import type { Runtime } from '../runtime/types.js';

/**
 * Staging area for an uploaded database file, built on first use.
 *
 * It was `dest: 'temp/'` — a relative path resolved against the working
 * directory, which is the kind of path arithmetic that belongs to the runtime
 * and nowhere else. multer's disk storage creates that directory in its
 * constructor, so the expression ran at module load: on a read-only container
 * filesystem the process died with ENOENT before serving a request, and did so
 * even under MySQL, where both handlers here refuse to run at all. It survived
 * in development only because a `temp/` directory happens to exist in the
 * checkout.
 *
 * DATA_DIR is the right home: what is being staged is the database, and that
 * directory is writable wherever SQLite is in use.
 */
let stagedUpload: RequestHandler | null = null;

const stageUpload = (req: Request, res: Response, next: NextFunction): void => {
  if (stagedUpload === null) {
    const runtime = req.app.locals.runtime as Runtime;

    stagedUpload = multer({
      dest: join(runtime.paths.dataDir, 'imports'),
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
      },
      fileFilter: (_req, file, cb) => {
        // Accept only database files
        if (file.originalname.match(/\.(db|sqlite|sqlite3)$/i)) {
          cb(null, true);
        } else {
          cb(new Error('Only database files (.db, .sqlite, .sqlite3) are allowed'));
        }
      }
    }).single('database');
  }

  stagedUpload(req, res, next);
};

// Export database
/**
 * Both endpoints below move the SQLite file itself — copying it, checkpointing
 * its WAL, replacing it wholesale. None of that has a MySQL counterpart, and a
 * handler that half-works is worse than one that says so: an operator who
 * downloads a "backup" that is not a backup finds out at restore time.
 *
 * 501 rather than 404: the route exists, the operation does not apply here.
 */
const refuseUnlessSqlite = (runtime: Runtime, res: Response, action: string): boolean => {
  if (runtime.database.driver === 'sqlite') return true;

  res.status(501).json({
    success: false,
    error:
      `Database ${action} moves the SQLite file, which the ${runtime.database.driver} driver ` +
      'does not have. Use mysqldump, or npm run db:export / db:import.'
  });

  return false;
};

export const exportDatabase = async (req: Request, res: Response): Promise<void> => {
  try {
    const runtime = req.app.locals.runtime as Runtime;
    if (!refuseUnlessSqlite(runtime, res, 'download')) return;

    const dbPath = runtime.paths.dbFile;

    if (!existsSync(dbPath)) {
      res.status(404).json({
        success: false,
        error: 'Database file not found'
      });
      return;
    }

    // Checkpoint WAL to ensure all data is written to the main database file
    // This is crucial in WAL mode to include all recent transactions
    try {
      // sqlite-only: refuseUnlessSqlite() returned already on any other driver.
      console.log('Checkpointing WAL before export...');
      databaseService.executeQuery('PRAGMA wal_checkpoint(FULL)');
      console.log('WAL checkpoint completed');
    } catch (checkpointError) {
      console.warn('WAL checkpoint failed, continuing with export:', checkpointError);
    }

    // Set headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename=slimbooks-export.db');
    res.setHeader('Content-Length', statSync(dbPath).size);

    // Stream the database file to the response
    const fileStream = createReadStream(dbPath);
    fileStream.pipe(res);

    fileStream.on('error', (error: Error) => {
      console.error('Database export stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to export database'
        });
      }
    });

    fileStream.on('end', () => {
      console.log('Database export completed successfully');
    });

  } catch (error) {
    console.error('Database export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export database'
    });
  }
};

// Import database
export const importDatabase = [
  // Refuse before staging, so a MySQL install never creates the directory for
  // an upload it is about to decline.
  (req: Request, res: Response, next: NextFunction): void => {
    const runtime = req.app.locals.runtime as Runtime;
    if (!refuseUnlessSqlite(runtime, res, 'upload')) return;

    stageUpload(req, res, next);
  },
  async (req: Request, res: Response): Promise<void> => {
    try {
      const runtime = req.app.locals.runtime as Runtime;
      if (!refuseUnlessSqlite(runtime, res, 'upload')) return;

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No database file provided'
        });
        return;
      }

      const uploadedFilePath = req.file.path;
      const dbPath = runtime.paths.dbFile;

      // Create backup of current database
      const backupPath = `${dbPath}.backup-${Date.now()}`;
      
      try {
        // Close database connection to release file lock
        console.log('Closing database connection...');
        await closeDatabase();

        if (existsSync(dbPath)) {
          await copyFile(dbPath, backupPath);
          console.log('Current database backed up to:', backupPath);
        }

        // Clean up any existing WAL/SHM files
        const walPath = `${dbPath}-wal`;
        const shmPath = `${dbPath}-shm`;

        if (existsSync(walPath)) {
          unlinkSync(walPath);
          console.log('Removed existing WAL file');
        }

        if (existsSync(shmPath)) {
          unlinkSync(shmPath);
          console.log('Removed existing SHM file');
        }

        // Replace current database with uploaded file
        await copyFile(uploadedFilePath, dbPath);
        console.log('Database imported successfully from:', req.file.originalname);

        // Reconnect to the new database
        console.log('Reconnecting to database...');
        await initializeDatabase(runtime);

        // Checkpoint the new database to ensure proper WAL initialization
        try {
          // sqlite-only: refuseUnlessSqlite() returned already on any other driver.
          console.log('Checkpointing new database...');
          databaseService.executeQuery('PRAGMA wal_checkpoint(FULL)');
          console.log('New database checkpoint completed');
        } catch (checkpointError) {
          console.warn('New database checkpoint failed:', checkpointError);
        }

        // Clean up uploaded file
        unlinkSync(uploadedFilePath);

        res.json({
          success: true,
          message: 'Database imported successfully'
        });

      } catch (importError) {
        // If import fails, restore backup
        if (existsSync(backupPath)) {
          await copyFile(backupPath, dbPath);
          console.log('Database restored from backup due to import failure');
        }

        // Always try to reconnect the database, even if import failed
        try {
          console.log('Reconnecting to database after import failure...');
          await initializeDatabase(runtime);
        } catch (reconnectError) {
          console.error('Failed to reconnect to database:', reconnectError);
        }

        throw importError;
      } finally {
        // Clean up backup file after successful import (optional)
        // Keep backup for safety - could implement cleanup job later
      }

    } catch (error) {
      console.error('Database import error:', error);
      
      // Clean up uploaded file if it exists
      if (req.file?.path && existsSync(req.file.path)) {
        unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import database'
      });
    }
  }
];