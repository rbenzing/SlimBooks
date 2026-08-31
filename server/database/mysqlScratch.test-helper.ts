// A private, self-provisioned MySQL/MariaDB database for a live suite that
// needs a table under its real production name (`invoices`, `clients`, ...)
// rather than a fixture name of its own choosing.
//
// baselineLive.test.ts owns those names in whatever database TEST_MYSQL_URL
// points at by default, dropping and rebuilding them in its own beforeAll —
// see its header, and userInvariantLive.test.ts, which hit the same problem
// for `users` and solved it with a differently-named fixture table. That
// escape is not available to a suite that has to exercise a migration whose
// SQL hardcodes the real table name — 016_backfill_issue_date.ts operates on
// `invoices` literally, so a test proving it end to end needs a real
// `invoices` table, not a substitute. This gives such a suite its own
// database instead: derived from TEST_MYSQL_URL with a suffix, created on
// first use, so it can never race baselineLive or another suite using this
// same helper, regardless of vitest's parallel file scheduling.

import { MySQLDatabase } from './MySQLDatabase.js';
import type { MysqlSettings } from '../runtime/database.js';

/** Connection settings for a private database derived from TEST_MYSQL_URL. */
export const scratchSettingsFrom = (raw: string, suffix: string): MysqlSettings => {
  const parsed = new URL(raw);
  const database = `${parsed.pathname.replace(/^\//, '')}_${suffix}`;

  return {
    driver: 'mysql',
    host: parsed.hostname,
    port: Number(parsed.port.length > 0 ? parsed.port : 3306),
    database,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    ssl: false,
    poolSize: 4
  };
};

/**
 * Creates the suite's private database if it does not already exist yet.
 *
 * Connects to `information_schema` rather than the target database, because
 * the target is exactly the thing that may not exist yet — every server
 * ships `information_schema`, so it is a safe place to run CREATE DATABASE
 * from.
 */
export const ensureScratchDatabase = async (settings: MysqlSettings): Promise<void> => {
  const bootstrap = new MySQLDatabase();
  await bootstrap.connect({ driver: 'mysql', settings: { ...settings, database: 'information_schema' } });

  try {
    await bootstrap.executeQuery(`CREATE DATABASE IF NOT EXISTS \`${settings.database}\``);
  } finally {
    await bootstrap.disconnect();
  }
};
