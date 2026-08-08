// Migration 012: Tables the runtime needs to be ephemeral-safe
//
// `scheduler_leases` lets one instance claim a scheduled job. Leases expire, so
// a process killed mid-run releases its claim without any manual cleanup — the
// property an ephemeral host requires.
//
// `stripe_events` records which webhook deliveries have been processed. Stripe
// retries on every non-2xx and on timeout, and a restart mid-processing replays
// the event, so the event id is the idempotency key.

import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  console.log('Running migration 012: Add scheduler_leases and stripe_events');

  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS scheduler_leases (
      job_name TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      acquired_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);

  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS stripe_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  console.log('Migration 012 completed successfully');
};

export const down = async (db: IDatabase): Promise<void> => {
  await db.executeQuery('DROP TABLE IF EXISTS scheduler_leases');
  await db.executeQuery('DROP TABLE IF EXISTS stripe_events');
};
