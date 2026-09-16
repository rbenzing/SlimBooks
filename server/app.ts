// Main application setup for Slimbooks server
// Clean, modular server configuration

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';

// Import configuration
import { serverConfig, validateConfig } from './config/index.js';

// Import database
import { initializeDatabase } from './database/index.js';

// Import middleware
import {
  createGeneralRateLimit,
  createSecurityHeaders,
  createCorsOptions,
  requestLogger,
  errorHandler,
  notFoundHandler,
  performanceMonitor,
  healthLogger,
  registerShutdown
} from './middleware/index.js';

// Import routes
import { createRoutes } from './routes/index.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { createUploadsRoute } from './routes/uploadsRoute.js';

import type { Runtime } from './runtime/types.js';
import { createRuntimeScheduler } from './runtime/index.js';

/**
 * Create and configure Express application
 */
export const createApp = async (runtime: Runtime) => {
  validateConfig();

  const includeSampleData = serverConfig.enableSampleData || serverConfig.isDevelopment;
  await initializeDatabase(runtime, { includeSampleData });

  const app = express();

  // Stashed on app.locals so request handlers that are not themselves given
  // the runtime (e.g. controllers reached only via req/res) can still read it
  // without falling back to process.env or __dirname.
  app.locals.runtime = runtime;

  // Behind a proxy, forwarded headers decide the client address. Without this,
  // express-rate-limit attributes every request to the proxy and the shared
  // budget locks out all users at once.
  if (runtime.listener.trustProxyHops > 0) {
    app.set('trust proxy', runtime.listener.trustProxyHops);
  }

  app.use(createSecurityHeaders(runtime.urls.publicUrl));

  // Same-origin deployment needs no CORS. It exists only for the Vite dev
  // server on a different port.
  if (serverConfig.isDevelopment) {
    app.use(cors(createCorsOptions(serverConfig.corsOrigin)));
  }

  app.use(createGeneralRateLimit());
  app.use(requestLogger);
  app.use(performanceMonitor());

  // Webhooks, before any body parser.
  //
  // Stripe signs the exact bytes of the request. express.json() would consume
  // the stream and leave only a parsed object, and no re-serialisation of that
  // object reproduces the signed bytes — so signature verification would fail
  // on every genuine delivery. This router reads the body as a raw Buffer and
  // must stay ahead of the parsers below.
  //
  // It sits after the rate limiter on purpose: the endpoint is public, and
  // Stripe backs off and retries on a 429.
  app.use('/api/webhooks', webhookRoutes);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  app.use(cookieParser());

  // There was a `POST /api/upload` here, with no authentication of any kind,
  // writing whatever it was handed into uploadsDir. Nothing called it: logo
  // uploads go through /api/settings, and database import has its own staged
  // multer in databaseController. It was an anonymous write into the data
  // directory that served no feature, so it is gone rather than guarded.

  // Uploads are written and served through the same provider, so the two can no
  // longer drift apart — and a database-backed provider works here, which
  // express.static could never serve.
  app.use('/uploads', createUploadsRoute(runtime));
  app.use(express.static(runtime.paths.staticDir));

  app.use('/', createRoutes(runtime));

  app.get('/*splat', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(join(runtime.paths.staticDir, 'index.html'));
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

/**
 * Start the server
 */
export const startServer = async (runtime: Runtime) => {
  const app = await createApp(runtime);

  const server = runtime.listener.tls === 'self'
    ? createHttpsServer(
        {
          key: readFileSync(runtime.listener.tlsKeyPath as string),
          cert: readFileSync(runtime.listener.tlsCertPath as string)
        },
        app
      )
    : createHttpServer(app);

  await new Promise<void>((resolve) => {
    if (runtime.listener.host === null) {
      server.listen(runtime.listener.target as string, resolve);
    } else {
      server.listen(runtime.listener.target as number, runtime.listener.host, resolve);
    }
  });

  console.log(`🚀 Slimbooks listening (${runtime.listener.tls} TLS)`);

  // Two handles on the same database, deliberately. `rawSqliteHandle` gives the
  // better-sqlite3 object shutdown needs for `pragma` and `close` — null under
  // any other driver — while `activeDatabase` gives the IDatabase wrapper the
  // scheduler queries through.
  const { rawSqliteHandle } = await import('./models/index.js');
  const { activeDatabase } = await import('./database/index.js');
  const database = activeDatabase();

  // A local rather than a runtime field, because the runtime is frozen.
  //
  // process.env appears here rather than inside the scheduler because
  // startServer sits above the runtime boundary; the scheduler itself only ever
  // receives resolved values.
  const scheduler = createRuntimeScheduler(database, runtime.features.scheduler, process.env, [
    {
      name: 'recurring-invoices',
      run: async () => {
        const { recurringInvoiceProcessorService } = await import(
          './services/RecurringInvoiceProcessorService.js'
        );

        const result = await recurringInvoiceProcessorService.processAllDueTemplates();

        if (result.created > 0 || result.errors.length > 0) {
          console.log(
            `Recurring invoices: ${result.created} created, ` +
              `${result.skipped} already billed, ${result.errors.length} failed`
          );
        }
      }
    },
    {
      // Registered unconditionally; the job itself is a no-op when
      // BACKUP_ENABLED is not set. Keeping the decision inside the job means the
      // lease and the tick behave identically either way.
      name: 'database-backup',
      run: async () => {
        const { getBackupConfig } = await import('./database/config/sqlite.config.js');
        const config = getBackupConfig(runtime.paths.dataDir);

        if (!config.enabled) return;

        const { backupService, parseDailySchedule } = await import('./services/BackupService.js');
        const { hour, minute } = parseDailySchedule(config.schedule);
        const settings = {
          directory: config.directory,
          retentionDays: config.retention,
          hour,
          minute
        };

        if (!(await backupService.isDue(settings))) return;

        const result = await backupService.run(database, settings);

        console.log(
          `Backup: ${result.rows} row(s) across ${result.tables} table(s), ` +
            `${Math.round(result.bytes / 1024)} KB → ${result.path}`
        );
      }
    },
    {
      // Retention for the audit trail. An assessor wants records kept long
      // enough to investigate; GDPR wants the IP addresses in them not kept
      // forever. Both are the same knob.
      name: 'audit-retention',
      run: async () => {
        const days = Number(process.env.AUDIT_RETENTION_DAYS ?? '365');
        if (!Number.isFinite(days) || days <= 0) return;

        const { auditService } = await import('./services/AuditService.js');
        const removed = await auditService.prune(days);

        if (removed > 0) {
          console.log(`Audit retention: removed ${removed} record(s) older than ${days} days`);
        }
      }
    }
  ]);

  scheduler?.start();
  healthLogger();

  registerShutdown(server, rawSqliteHandle(), scheduler, [
    {
      // Imported lazily: puppeteer is an optional dependency, and on a host
      // without it this module must never be reached. close() is a no-op when
      // no browser was ever launched.
      what: 'pdf browser',
      close: async () => {
        if (runtime.pdf === null) return;

        const { pdfService } = await import('./services/PdfService.js');
        await pdfService.close();
      }
    }
  ]);

  return server;
};

export default { createApp, startServer };
