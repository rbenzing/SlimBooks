// Database controller - handles database backup and restore operations
import { type Request, type Response } from 'express';
import { createReadStream, existsSync, unlinkSync, statSync } from 'fs';
import { copyFile } from 'fs/promises';
import multer from 'multer';
import { closeDatabase, initializeDatabase } from '../database/index.js';
import { databaseService } from '../core/DatabaseService.js';
import type { Runtime } from '../runtime/types.js';

// Configure multer for file uploads
const upload = multer({
  dest: 'temp/',
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only database files
    if (file.originalname.match(/\.(db|sqlite|sqlite3)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only database files (.db, .sqlite, .sqlite3) are allowed'));
    }
  }
});

// Export database
export const exportDatabase = async (req: Request, res: Response): Promise<void> => {
  try {
    const runtime = req.app.locals.runtime as Runtime;
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
  upload.single('database'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No database file provided'
        });
        return;
      }

      const runtime = req.app.locals.runtime as Runtime;
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
        await initializeDatabase(runtime.paths);

        // Checkpoint the new database to ensure proper WAL initialization
        try {
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
          await initializeDatabase(runtime.paths);
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