// Dialect-neutral database export and import.
//
// JSON rather than a SQL dump, because the two dialects disagree on precisely
// the syntax a dump emits — quoting, AUTOINCREMENT, expression defaults, the
// engine clause. A dump taken from one would not load into the other, which is
// the only direction anyone actually needs.
//
// The schema is NOT part of the dump. Import runs against a database whose
// tables already exist, built by createTables() or the MySQL baseline, so this
// carries rows and nothing else.

import type { IDatabase, SQLParameter } from '../types/database.types.js';
import { tableSchemas } from './schemas/tables.schema.js';

/** Format version, so a future change can refuse an incompatible file. */
export const TRANSFER_VERSION = 1;

export interface TransferTable {
  name: string;
  rows: Array<Record<string, unknown>>;
}

export interface TransferDump {
  version: number;
  exportedAt: string;
  driver: string;
  tables: TransferTable[];
}

/**
 * Tables carried by a transfer, in foreign-key order.
 *
 * tableSchemas is already ordered by its dependency graph, and the token tables
 * follow because both reference users.
 *
 * Deliberately absent:
 *   migrations      the target records its own history when its schema is built
 *   boot_locks      an expiring advisory row; carrying one would block a boot
 *   scheduler_leases likewise, and a stale lease would stall the scheduler
 *                   until it expired
 *
 * stripe_events IS carried. It is the webhook idempotency ledger, and losing it
 * means a delivery Stripe retries after the move gets processed a second time —
 * on a payment event, that records the payment twice.
 */
export const transferTables = (): string[] => [
  ...tableSchemas.map(schema => schema.name),
  'password_reset_tokens',
  'email_verification_tokens'
];

const EXCLUDED = new Set(['migrations', 'boot_locks', 'scheduler_leases']);

/** Marker for a value that was binary, so import can restore it as a Buffer. */
interface BinaryValue {
  $binary: string;
}

const isBinary = (value: unknown): value is Buffer | Uint8Array =>
  Buffer.isBuffer(value) || value instanceof Uint8Array;

const isBinaryMarker = (value: unknown): value is BinaryValue =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as BinaryValue).$binary === 'string';

/**
 * JSON.stringify turns a Buffer into {"type":"Buffer","data":[…]} — lossless
 * but roughly four bytes of JSON per byte stored, which for a 5 MB logo is
 * 20 MB of digits. Base64 is about 1.37x and reads back the same.
 */
const encodeValue = (value: unknown): unknown =>
  isBinary(value) ? { $binary: Buffer.from(value).toString('base64') } : value;

const decodeValue = (value: unknown): SQLParameter =>
  isBinaryMarker(value) ? Buffer.from(value.$binary, 'base64') : (value as SQLParameter);

export const exportDatabase = async (db: IDatabase, now: string): Promise<TransferDump> => {
  const tables: TransferTable[] = [];

  for (const name of transferTables()) {
    if (EXCLUDED.has(name)) continue;
    if (!(await db.tableExists(name))) continue;

    const rows = await db.getMany<Record<string, unknown>>(`SELECT * FROM ${name}`);

    tables.push({
      name,
      rows: rows.map(row =>
        Object.fromEntries(Object.entries(row).map(([key, value]) => [key, encodeValue(value)]))
      )
    });
  }

  return { version: TRANSFER_VERSION, exportedAt: now, driver: db.dialect.name, tables };
};

/**
 * Tables that only ever hold data a person entered.
 *
 * "Refuse a non-empty target" cannot mean "refuse any row": building a schema
 * populates several tables on its own — seeds create the administrator account
 * and the default settings, and migration 003 inserts a default design
 * template. Since the documented flow is to start once against the new database
 * and then import, a blanket rule would refuse every legitimate transfer.
 *
 * These are the tables a freshly-built database has none of, so rows here mean
 * the target already holds someone's books.
 */
const BUSINESS_TABLES: readonly string[] = [
  'clients',
  'invoices',
  'invoice_items',
  'payments',
  'expenses',
  'reports',
  'recurring_invoice_templates'
];

/**
 * Load a dump into a database whose schema exists and which holds no books.
 *
 * The carried tables are cleared first, so the result is exactly the dump
 * rather than a merge. Merging is not defined: ids would collide and foreign
 * keys would silently attach to the wrong parents, which nobody would notice
 * until an invoice showed the wrong customer.
 */
export const importDatabase = async (db: IDatabase, dump: TransferDump): Promise<number> => {
  if (dump.version !== TRANSFER_VERSION) {
    throw new Error(
      `Dump is format version ${dump.version}; this build reads version ${TRANSFER_VERSION}.`
    );
  }

  for (const table of dump.tables) {
    if (!(await db.tableExists(table.name))) {
      throw new Error(
        `Target has no table "${table.name}". Build the schema first by starting the ` +
          'application once against the new database, then import.'
      );
    }
  }

  for (const name of BUSINESS_TABLES) {
    if (!(await db.tableExists(name))) continue;

    const existing = await db.getOne<{ count: number }>(`SELECT COUNT(*) as count FROM ${name}`);

    if ((existing?.count ?? 0) > 0) {
      throw new Error(
        `Target already holds data: "${name}" has ${existing?.count} row(s). Import replaces ` +
          'rather than merges, so it refuses to run against a database that is already in use. ' +
          'Point it at an empty one.'
      );
    }
  }

  let written = 0;

  await db.executeQuery(db.dialect.deferForeignKeys);

  try {
    // Clear in reverse dependency order, so a child is gone before its parent
    // even with enforcement deferred — which matters if a future backend
    // ignores the defer.
    for (const table of [...dump.tables].reverse()) {
      await db.executeQuery(`DELETE FROM ${table.name}`);
    }

    for (const table of dump.tables) {
      for (const row of table.rows) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;

        const placeholders = columns.map(() => '?').join(', ');
        const columnList = columns.map(column => `\`${column}\``).join(', ');

        await db.executeQuery(
          `INSERT INTO ${table.name} (${columnList}) VALUES (${placeholders})`,
          columns.map(column => decodeValue(row[column]))
        );

        written++;
      }
    }
  } finally {
    await db.executeQuery(db.dialect.restoreForeignKeys);
  }

  return written;
};
