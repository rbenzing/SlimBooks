// Main entry point for the Slimbooks server.
//
// The runtime is resolved before anything else so a configuration fault stops
// the process before it opens a socket or touches the database.
//
// There is exactly one signal handler, registered by startServer. The previous
// version registered handlers here at module load that called process.exit(0)
// synchronously; Node runs listeners in registration order, so they fired first
// and the graceful path — closing the database, checkpointing the WAL — never
// executed once.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './app.js';
import { assertNoLegacyData, resolveRuntime } from './runtime/index.js';
import { isChromiumAvailable } from './runtime/pdf.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  try {
    const pdfAvailable = await isChromiumAvailable();
    const runtime = resolveRuntime(process.env, moduleDir, { pdf: pdfAvailable });

    assertNoLegacyData(runtime.paths);

    console.log('Slimbooks runtime resolved:');
    console.log(runtime.describe());

    await startServer(runtime);
  } catch (error) {
    console.error('❌ Failed to start server:', (error as Error).message);

    if (process.env.NODE_ENV !== 'production') {
      console.error(error);
    }

    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

main();
