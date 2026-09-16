// Scheduled database backups.
//
// Until now `BACKUP_ENABLED`, `BACKUP_SCHEDULE`, `BACKUP_RETENTION` and
// `BACKUP_DIR` were documented in .env.example and the configuration reference
// and configured nothing: `getBackupConfig()` and `backupDatabase()` both had
// zero callers, and the scheduler registered exactly one job, which was not
// this. An operator who set BACKUP_ENABLED=true got silence.
//
// The artifact is the dialect-neutral JSON dump that `npm run db:export`
// already produces, not a file copy. That choice is what makes scheduled
// backups work at all under DB_DRIVER=mysql, where there is no SQLite file to
// copy and the binary path has to refuse — and it means the restore procedure
// is the one already documented (`npm run db:import`), rather than a second one
// that only applies to automatic backups.

import { mkdir, readdir, writeFile, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { exportDatabase } from '../database/transfer.util.js';
import type { IDatabase } from '../types/database.types.js';

/** `slimbooks-backup-2026-09-16T02-00-00-000Z.json` */
const FILE_PREFIX = 'slimbooks-backup-';
const FILE_SUFFIX = '.json';

export interface BackupSettings {
  directory: string;
  /** Days to keep. A backup older than this is deleted after a successful run. */
  retentionDays: number;
  /** Local time of day to run at, from BACKUP_SCHEDULE. */
  hour: number;
  minute: number;
}

export interface BackupResult {
  path: string;
  rows: number;
  tables: number;
  bytes: number;
}

/**
 * Read the daily time out of a cron expression.
 *
 * The in-process scheduler is interval-based and there is no cron engine here,
 * so only the daily shape this project documents (`M H * * *`) is honoured. A
 * more complicated expression is not silently reinterpreted: the caller is told
 * what was used, because a backup that runs on a schedule the operator did not
 * ask for is worse than one that says so.
 */
export const parseDailySchedule = (
  schedule: string
): { hour: number; minute: number; exact: boolean } => {
  const fields = schedule.trim().split(/\s+/);
  const minute = Number(fields[0]);
  const hour = Number(fields[1]);

  const daily =
    fields.length === 5 &&
    Number.isInteger(minute) && minute >= 0 && minute <= 59 &&
    Number.isInteger(hour) && hour >= 0 && hour <= 23 &&
    fields[2] === '*' && fields[3] === '*' && fields[4] === '*';

  if (!daily) return { hour: 2, minute: 0, exact: false };

  return { hour, minute, exact: true };
};

/** The timestamp portion of a backup filename, filesystem-safe on Windows too. */
const stamp = (at: Date): string => at.toISOString().replace(/[:.]/g, '-');

const isBackupFile = (name: string): boolean =>
  name.startsWith(FILE_PREFIX) && name.endsWith(FILE_SUFFIX);

export class BackupService {
  /**
   * Write one backup now, then drop anything past the retention window.
   */
  async run(db: IDatabase, settings: BackupSettings, at: Date = new Date()): Promise<BackupResult> {
    await mkdir(settings.directory, { recursive: true });

    const dump = await exportDatabase(db, at.toISOString());
    const body = JSON.stringify(dump);
    const path = join(settings.directory, `${FILE_PREFIX}${stamp(at)}${FILE_SUFFIX}`);

    // 0600: the dump contains every bcrypt hash, the Stripe secret key and the
    // SMTP password. The default 0644 would leave all of that world-readable to
    // any other account on the host.
    await writeFile(path, body, { encoding: 'utf8', mode: 0o600 });

    // Pruning runs only after the write succeeded, so a failing backup can
    // never delete the last good one.
    await this.prune(settings, at);

    return {
      path,
      rows: dump.tables.reduce((total, table) => total + table.rows.length, 0),
      tables: dump.tables.length,
      bytes: Buffer.byteLength(body)
    };
  }

  /** Delete backups older than the retention window. Returns how many went. */
  async prune(settings: BackupSettings, at: Date = new Date()): Promise<number> {
    if (!Number.isFinite(settings.retentionDays) || settings.retentionDays <= 0) return 0;

    const cutoff = at.getTime() - settings.retentionDays * 24 * 60 * 60 * 1000;

    let names: string[];
    try {
      names = await readdir(settings.directory);
    } catch {
      return 0;
    }

    let removed = 0;

    for (const name of names.filter(isBackupFile)) {
      const full = join(settings.directory, name);

      try {
        // mtime rather than the name's timestamp: the file's own age is the
        // thing retention is about, and it survives a rename.
        const info = await stat(full);
        if (info.mtimeMs < cutoff) {
          await unlink(full);
          removed += 1;
        }
      } catch {
        // A file that vanished underneath us is already pruned.
      }
    }

    return removed;
  }

  /**
   * Whether a backup is due: past today's scheduled time, and none taken since.
   *
   * The scheduler ticks on an interval (hourly by default), so "due" cannot mean
   * "it is exactly 02:00". It means the scheduled moment has passed and the
   * newest backup on disk predates it.
   */
  async isDue(settings: BackupSettings, at: Date = new Date()): Promise<boolean> {
    const scheduledToday = new Date(at);
    scheduledToday.setHours(settings.hour, settings.minute, 0, 0);

    if (at.getTime() < scheduledToday.getTime()) return false;

    const newest = await this.newestBackupTime(settings.directory);

    return newest === null || newest < scheduledToday.getTime();
  }

  /** mtime of the most recent backup, or null if there are none. */
  async newestBackupTime(directory: string): Promise<number | null> {
    let names: string[];
    try {
      names = await readdir(directory);
    } catch {
      return null;
    }

    let newest: number | null = null;

    for (const name of names.filter(isBackupFile)) {
      try {
        const info = await stat(join(directory, name));
        if (newest === null || info.mtimeMs > newest) newest = info.mtimeMs;
      } catch {
        // Ignore a file that disappeared mid-scan.
      }
    }

    return newest;
  }
}

export const backupService = new BackupService();
