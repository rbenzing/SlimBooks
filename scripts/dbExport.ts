// npm run db:export -- <file.json>
//
// Writes a dialect-neutral dump of the configured database. Operator tool, run
// from a checkout — it needs tsx, which is a dev dependency.

import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRuntime } from '../server/runtime/index.js';
import { activeDatabase, initializeDatabase, closeDatabase } from '../server/database/index.js';
import { exportDatabase } from '../server/database/transfer.util.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));

const main = async (): Promise<void> => {
  const target = process.argv[2];

  if (target === undefined || target.length === 0) {
    console.error('Usage: npm run db:export -- <file.json>');
    process.exit(1);
  }

  const runtime = resolveRuntime(process.env, moduleDir);

  console.log(`Exporting from ${runtime.database.driver}...`);

  // Opens and, if needed, builds the schema. Exporting from a database that has
  // never been started would otherwise fail on a table that does not exist yet.
  await initializeDatabase(runtime);

  const dump = await exportDatabase(activeDatabase(), new Date().toISOString());
  const rows = dump.tables.reduce((total, table) => total + table.rows.length, 0);

  await writeFile(resolve(target), JSON.stringify(dump, null, 2), 'utf8');
  await closeDatabase();

  console.log(`✓ Wrote ${rows} row(s) across ${dump.tables.length} table(s) to ${target}`);
};

main().catch((error: Error) => {
  console.error('❌ Export failed:', error.message);
  process.exit(1);
});
