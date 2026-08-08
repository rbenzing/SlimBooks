/**
 * Webhook idempotency tests.
 *
 * Stripe retries a delivery on any non-2xx and on timeout. Without a dedupe
 * key, a restart mid-processing replays the event and the side effect runs
 * twice — on a payment webhook that means recording a payment twice.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(`
    CREATE TABLE stripe_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
});

const claim = (eventId: string): number =>
  raw
    .prepare('INSERT OR IGNORE INTO stripe_events (event_id, event_type) VALUES (?, ?)')
    .run(eventId, 'checkout.session.completed').changes;

describe('stripe event claiming', () => {
  it('claims an event the first time it is seen', () => {
    expect(claim('evt_1')).toBe(1);
  });

  it('does not claim a replayed event', () => {
    claim('evt_1');

    expect(claim('evt_1')).toBe(0);
  });

  it('claims distinct events independently', () => {
    claim('evt_1');

    expect(claim('evt_2')).toBe(1);
  });
});
