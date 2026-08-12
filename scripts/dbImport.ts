// npm run db:import -- <file.json>
//
// Loads a dump into the configured database, whose schema must already exist
// and whose tables must be empty. Operator tool, run from a checkout.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRuntime } from '../server/runtime/index.js';
import { activeDatabase, initializeDatabase, closeDatabase } from '../server/database/index.js';
import { importDatabase, type TransferDump } from '../server/database/transfer.util.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));

const main = async (): Promise<void> => {
  const source = process.argv[2];

  if (source === undefined || source.length === 0) {
    console.error('Usage: npm run db:import -- <file.json>');
    process.exit(1);
  }

  const dump = JSON.parse(await readFile(resolve(source), 'utf8')) as TransferDump;
  const runtime = resolveRuntime(process.env, moduleDir);

  console.log(`Importing a ${dump.driver} dump into ${runtime.database.driver}...`);

  // Schema only. Seeding creates the administrator account and the default
  // settings, and import refuses a non-empty target — so with seeds on, there
  // would be no way to load a dump into a database this very process had just
  // prepared.
  await initializeDatabase(runtime, { seed: false });

  const written = await importDatabase(activeDatabase(), dump);

  await closeDatabase();

  console.log(`✓ Imported ${written} row(s) across ${dump.tables.length} table(s)`);
};

main().catch((error: Error) => {
  console.error('❌ Import failed:', error.message);
  process.exit(1);
});
