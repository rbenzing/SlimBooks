// In-process job scheduler.
//
// Replaces the OS crontab that hit an unauthenticated endpoint — neither IIS
// nor Hostinger offers one, and the endpoint was reachable by anyone.
//
// The lease stops two instances doing the same work and stops a slow run
// overlapping itself. It is an efficiency mechanism only: correctness comes
// from the unique index added in migration 011, so a duplicate invoice is
// rejected by the database rather than by timing.

import { randomUUID } from 'node:crypto';
import type { IDatabase } from '../types/database.types.js';

export interface SchedulerJob {
  name: string;
  run: () => Promise<void>;
}

export interface Scheduler {
  start(): void;
  stop(): Promise<void>;
}

export interface SchedulerOptions {
  /** How often to run each job. */
  intervalMs: number;
  /** How long a claim stays valid if its holder disappears. */
  leaseTtlMs: number;
  /** Delay before the first run, so restarts do not stampede. */
  initialDelayMs: number;
}

const plusMs = (iso: string, milliseconds: number): string =>
  new Date(new Date(iso).getTime() + milliseconds).toISOString();

/**
 * Claim a job, or report that someone else holds it.
 *
 * Expiry is what makes this ephemeral-safe: a SIGKILLed process cannot release
 * its claim, so the claim must lapse on its own.
 */
export const acquireLease = async (
  db: IDatabase,
  jobName: string,
  owner: string,
  ttlMs: number,
  now: string
): Promise<boolean> => {
  const expiresAt = plusMs(now, ttlMs);

  // One statement, so two instances racing cannot both observe "unheld". The
  // condition matches only a lease that has lapsed or that this owner already
  // holds. `expires_at` is named as the guard column because the condition
  // reads it and the update writes it — MySQL evaluates assignments in order
  // and would otherwise test the value it just wrote.
  const { sql, params } = db.dialect.conditionalUpsert({
    table: 'scheduler_leases',
    columns: ['job_name', 'owner', 'acquired_at', 'expires_at'],
    values: [jobName, owner, now, expiresAt],
    conflictColumn: 'job_name',
    updateColumns: ['owner', 'acquired_at', 'expires_at'],
    conflictGuardColumn: 'expires_at',
    condition: 'scheduler_leases.expires_at <= ? OR scheduler_leases.owner = ?',
    conditionParams: [now, owner]
  });

  const result = await db.executeQuery(sql, params);

  return result.changes > 0;
};

/** Release a claim early. A release from a non-holder is ignored. */
export const releaseLease = async (
  db: IDatabase,
  jobName: string,
  owner: string
): Promise<void> => {
  await db.executeQuery('DELETE FROM scheduler_leases WHERE job_name = ? AND owner = ?', [
    jobName,
    owner
  ]);
};

export const createScheduler = (
  db: IDatabase,
  jobs: readonly SchedulerJob[],
  options: SchedulerOptions
): Scheduler => {
  const owner = randomUUID();

  let timer: NodeJS.Timeout | null = null;
  let running: Promise<void> = Promise.resolve();
  let stopped = false;

  const runDueJobs = async (): Promise<void> => {
    for (const job of jobs) {
      if (stopped) return;

      const now = new Date().toISOString();

      if (!(await acquireLease(db, job.name, owner, options.leaseTtlMs, now))) {
        continue;
      }

      try {
        await job.run();
      } catch (error) {
        console.error(`Scheduled job "${job.name}" failed:`, error);
      } finally {
        await releaseLease(db, job.name, owner);
      }
    }
  };

  const tick = (): void => {
    running = runDueJobs();
  };

  return {
    start(): void {
      if (timer !== null) return;

      // `unref` keeps the timer from holding the process open during shutdown.
      const initial = setTimeout(tick, options.initialDelayMs);
      initial.unref();

      timer = setInterval(tick, options.intervalMs);
      timer.unref();
    },

    async stop(): Promise<void> {
      stopped = true;

      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }

      // Let an in-flight run finish so it releases its lease cleanly.
      await running;
    }
  };
};
