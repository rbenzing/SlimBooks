/**
 * The issue_date defect, against real engines.
 *
 * This branch moved every report and list screen from windowing on
 * `created_at` (NOT NULL, so a row always appeared) to windowing on
 * `issue_date` (nullable, no default). A NULL or empty-string issue_date
 * compares false against every range, so the invoice silently disappears from
 * the profit & loss report, the invoice report, the client report, the list
 * and the dashboard — reviewer-verified live on SQLite: invoices totalling
 * 850 in range, the report returning 100, with nothing on screen to say a
 * NULL row worth 500 and an empty-string row worth 250 had vanished.
 *
 * The unit tests in ReportService.test.ts and InvoiceService.test.ts pin the
 * generated SQL and the value written, against a mock. That proves the
 * string, not that the report actually finds the row and adds it up — the
 * whole reason this defect shipped despite full test coverage. This drives
 * the real InvoiceService and ReportService against a real database, and
 * reproduces the reviewer's repro exactly: 100/850 before the fix, 850/850
 * after (proved by temporarily reverting InvoiceService's default and
 * re-running this file — see the fix report for the transcript).
 *
 * The schema is cloned from tables.schema.ts's real `invoices`/`clients`
 * definitions rather than hand-written, so the shape under test is exactly
 * what InvoiceService and ReportService expect. Migration 016's up() hardcodes
 * the table name `invoices`, so this suite needs a table under that literal
 * name to exercise it for real — which means it cannot use a fixture name of
 * its own to dodge baselineLive.test.ts the way most live suites do (see
 * userInvariantLive.test.ts's header for that problem, on `users`). Instead
 * this suite gets a private database of its own on MySQL/MariaDB — see
 * mysqlScratch.test-helper.ts — so it can never race baselineLive regardless
 * of vitest's parallel file scheduling. SQLite needs no such treatment: every
 * `:memory:` connection is already its own database.
 *
 * SQLite always runs. MySQL runs when TEST_MYSQL_URL is set. A skipped MySQL
 * half is reported rather than silent.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { SQLiteDatabase } from '../database/SQLiteDatabase.js';
import { MySQLDatabase } from '../database/MySQLDatabase.js';
import { tableSchemas } from '../database/schemas/tables.schema.js';
import { renderCreateTable as renderSqliteTable } from '../database/schemas/sqlite.ddl.js';
import { renderCreateTable as renderMysqlTable, indexedColumnsFor } from '../database/schemas/mysql.ddl.js';
import { ensureScratchDatabase, scratchSettingsFrom } from '../database/mysqlScratch.test-helper.js';
import { up as backfillIssueDate } from '../database/migrations/016_backfill_issue_date.js';
import { epochToCalendarDay } from '../utils/utcTime.util.js';
import type { IDatabase, TableSchema } from '../types/database.types.js';

const DDL_TIMEOUT_MS = 60_000;

const url = process.env.TEST_MYSQL_URL;

/** The three real tables this suite needs, without their cross-table foreign keys. */
const OWNED_TABLES = ['clients', 'invoices', 'expenses'] as const;

const schemaFor = (name: string): TableSchema => {
  const original = tableSchemas.find(schema => schema.name === name);
  if (!original) throw new Error(`No schema named ${name} in tables.schema.ts`);

  // Columns only. `invoices`' table-level constraints are foreign keys to
  // clients, invoice_design_templates and recurring_invoice_templates — the
  // latter two do not exist here, and referential integrity is not what is
  // under test.
  return { name: original.name, columns: original.columns };
};

const ownedSchemas = OWNED_TABLES.map(schemaFor);

const sqliteDdl = ownedSchemas.map(renderSqliteTable);

const mysqlIndexed = indexedColumnsFor(ownedSchemas, []);
const mysqlDdl = ownedSchemas.map(schema =>
  renderMysqlTable(schema, mysqlIndexed.get(schema.name) ?? new Set())
);

/**
 * A stand-in for `databaseService` that forwards to whichever engine the
 * enclosing suite is running against — the same technique
 * userInvariantLive.test.ts uses, so InvoiceService and ReportService run
 * unmodified and their generated SQL is actually executed, not just pattern
 * matched.
 */
const engine = vi.hoisted(() => ({
  getOne: vi.fn(),
  getMany: vi.fn(),
  executeQuery: vi.fn(),
  exists: vi.fn(),
  getNextSequence: vi.fn(),
  dialect: undefined as unknown
}));

vi.mock('../core/DatabaseService.js', () => ({ databaseService: engine }));

const { invoiceService } = await import('./InvoiceService.js');
const { reportService } = await import('./ReportService.js');

interface Backend {
  name: string;
  open: () => Promise<IDatabase>;
  close: (raw: IDatabase) => Promise<void>;
  ddl: string[];
}

const backends: Backend[] = [
  {
    name: 'sqlite',
    open: async () => {
      const raw = new SQLiteDatabase();
      await raw.connect({ driver: 'sqlite', path: ':memory:' });
      return raw;
    },
    close: async raw => {
      await raw.disconnect();
    },
    ddl: sqliteDdl
  }
];

if (url !== undefined && url.length > 0) {
  backends.push({
    name: 'mysql',
    open: async () => {
      const settings = scratchSettingsFrom(url, 'issuedatelive');
      await ensureScratchDatabase(settings);

      const raw = new MySQLDatabase();
      await raw.connect({ driver: 'mysql', settings });
      return raw;
    },
    close: async raw => {
      await raw.disconnect();
    },
    ddl: mysqlDdl
  });
}

describe('issue_date live coverage', () => {
  it('reports which backends are under test', () => {
    console.log(`issue_date live suite covering: ${backends.map(b => b.name).join(', ')}`);

    expect(backends.map(b => b.name)).toContain('sqlite');
  });

  it('includes MySQL whenever a server was configured', () => {
    if (url === undefined || url.length === 0) return;

    expect(backends.map(b => b.name)).toContain('mysql');
  });
});

describe.each(backends)('on $name', backend => {
  let raw: IDatabase;

  beforeAll(async () => {
    raw = await backend.open();

    for (const table of OWNED_TABLES) {
      await raw.executeQuery(`DROP TABLE IF EXISTS ${table}`);
    }
    for (const statement of backend.ddl) {
      await raw.executeQuery(statement);
    }
  }, DDL_TIMEOUT_MS);

  afterAll(async () => {
    for (const table of OWNED_TABLES) {
      await raw.executeQuery(`DROP TABLE IF EXISTS ${table}`);
    }
    await backend.close(raw);
  }, DDL_TIMEOUT_MS);

  beforeEach(async () => {
    for (const table of OWNED_TABLES) {
      await raw.executeQuery(`DELETE FROM ${table}`);
    }

    let counter = 0;

    engine.getOne.mockImplementation((sql: string, params: unknown[] = []) => raw.getOne(sql, params));
    engine.getMany.mockImplementation((sql: string, params: unknown[] = []) => raw.getMany(sql, params));
    engine.executeQuery.mockImplementation((sql: string, params: unknown[] = []) =>
      raw.executeQuery(sql, params)
    );
    engine.exists.mockImplementation(async (table: string, column: string, value: unknown) => {
      const row = await raw.getOne(`SELECT 1 FROM ${table} WHERE \`${column}\` = ?`, [value]);
      return row !== null;
    });
    // A local counter stands in for the real getNextSequence, which reads a
    // `counters` table this suite deliberately does not create — the id it
    // returns becomes an internal primary key nothing here asserts on.
    engine.getNextSequence.mockImplementation(async () => {
      counter += 1;
      return counter;
    });
    engine.dialect = raw.dialect;
  }, DDL_TIMEOUT_MS);

  const insertClient = async (): Promise<number> =>
    (await raw.executeQuery('INSERT INTO clients (name) VALUES (?)', ['Acme'])).lastInsertRowid;

  /** A row shaped like what a pre-fix InvoiceService, or a direct import, could write. */
  const rawInvoice = async (options: {
    invoiceNumber: string;
    clientId: number;
    amount: number;
    issueDate: string | null;
    createdAt: number;
  }): Promise<void> => {
    await raw.executeQuery(
      `INSERT INTO invoices (invoice_number, client_id, amount, total_amount, issue_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        options.invoiceNumber,
        options.clientId,
        options.amount,
        options.amount,
        options.issueDate,
        options.createdAt
      ]
    );
  };

  it(
    'drops a NULL and an empty-string issue_date from the invoice report, and the backfill recovers both',
    async () => {
      const clientId = await insertClient();
      const day = '2026-02-15';
      const createdAt = Date.parse(`${day}T12:00:00.000Z`);

      // The control: a normal invoice with a real issue_date, always visible.
      await invoiceService.createInvoice({
        invoice_number: 'INV-A',
        client_id: clientId,
        amount: 100,
        issue_date: day
      });

      // The reviewer's exact repro: a NULL row worth 500 and an empty-string
      // row worth 250, both created the same day.
      await rawInvoice({ invoiceNumber: 'INV-B', clientId, amount: 500, issueDate: null, createdAt });
      await rawInvoice({ invoiceNumber: 'INV-C', clientId, amount: 250, issueDate: '', createdAt });

      const before = await reportService.generateInvoiceData(day, day);
      expect(before.totalCount).toBe(1);
      expect(before.totalAmount).toBe(100);

      await backfillIssueDate(raw);

      const after = await reportService.generateInvoiceData(day, day);
      expect(after.totalCount).toBe(3);
      expect(after.totalAmount).toBe(850);
      expect(after.invoices.map(inv => inv.invoice_number).sort()).toEqual(['INV-A', 'INV-B', 'INV-C']);
    },
    DDL_TIMEOUT_MS
  );

  it(
    'recovers the same rows in the profit & loss report',
    async () => {
      // The report the bug report calls out by name: "revenue silently missing
      // from a filed report is the most serious thing this branch could ship."
      const clientId = await insertClient();
      const day = '2026-02-15';
      const createdAt = Date.parse(`${day}T12:00:00.000Z`);

      await rawInvoice({ invoiceNumber: 'INV-D', clientId, amount: 500, issueDate: null, createdAt });
      await rawInvoice({ invoiceNumber: 'INV-E', clientId, amount: 250, issueDate: '', createdAt });

      const before = await reportService.generateProfitLossData(day, day, 1);
      expect(before.revenue.total).toBe(0);

      await backfillIssueDate(raw);

      const after = await reportService.generateProfitLossData(day, day, 1);
      expect(after.revenue.total).toBe(750);
    },
    DDL_TIMEOUT_MS
  );

  it(
    'is idempotent: backfilling twice leaves the report unchanged',
    async () => {
      const clientId = await insertClient();
      const day = '2026-03-01';
      const createdAt = Date.parse(`${day}T00:00:00.000Z`);

      await rawInvoice({ invoiceNumber: 'INV-F', clientId, amount: 40, issueDate: null, createdAt });

      await backfillIssueDate(raw);
      const first = await reportService.generateInvoiceData(day, day);

      await backfillIssueDate(raw);
      const second = await reportService.generateInvoiceData(day, day);

      expect(second.totalCount).toBe(first.totalCount);
      expect(second.totalAmount).toBe(first.totalAmount);
      expect(second.totalAmount).toBe(40);
    },
    DDL_TIMEOUT_MS
  );

  it(
    'defaults a newly created invoice to today, so it needs no migration to appear in a report',
    async () => {
      const clientId = await insertClient();

      await invoiceService.createInvoice({ invoice_number: 'INV-G', client_id: clientId, amount: 75 });

      const today = epochToCalendarDay(Date.now());
      const report = await reportService.generateInvoiceData(today, today);

      const found = report.invoices.find(inv => inv.invoice_number === 'INV-G');
      expect(found).toBeDefined();
      expect(Number(found?.amount)).toBe(75);
    },
    DDL_TIMEOUT_MS
  );
});
