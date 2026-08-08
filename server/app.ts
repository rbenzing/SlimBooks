// Main application setup for Slimbooks server
// Clean, modular server configuration

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
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
  validateFileUpload,
  registerShutdown
} from './middleware/index.js';

// Import routes
import { createRoutes } from './routes/index.js';
import webhookRoutes from './routes/webhookRoutes.js';

import type { Runtime } from './runtime/types.js';
import { createRuntimeScheduler } from './runtime/index.js';

/**
 * Create and configure Express application
 */
export const createApp = async (runtime: Runtime) => {
  validateConfig();

  const includeSampleData = serverConfig.enableSampleData || serverConfig.isDevelopment;
  await initializeDatabase(runtime.paths, includeSampleData);

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

  const upload = multer({
    dest: runtime.paths.uploadsDir,
    limits: { fileSize: serverConfig.maxFileSize, files: 1, fieldSize: 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowedMimes = [
        'application/octet-stream',
        'application/x-sqlite3',
        'application/vnd.sqlite3'
      ];

      cb(null, allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.db'));
    }
  });

  app.post('/api/upload', upload.single('file'), validateFileUpload(), (req, res) => {
    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        filename: req.file?.filename,
        originalname: req.file?.originalname,
        size: req.file?.size
      }
    });
  });

  // Uploads are written and served through the same resolved root, so the two
  // can no longer drift apart.
  app.use('/uploads', express.static(runtime.paths.uploadsDir));
  app.use(express.static(runtime.paths.staticDir));

  app.use('/', createRoutes(runtime));

  app.get('*', (req, res, next) => {
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

  // Two handles on the same database, deliberately. `models` exports the raw
  // better-sqlite3 object, which shutdown needs for `pragma` and `close`;
  // `database` exports the IDatabase wrapper the scheduler queries through.
  const { db } = await import('./models/index.js');
  const { db: database } = await import('./database/index.js');

  // A local rather than a runtime field, because the runtime is frozen.
  //
  // process.env appears here rather than inside the scheduler because
  // startServer sits above the runtime boundary; the scheduler itself only ever
  // receives resolved values.
  const scheduler = createRuntimeScheduler(database, runtime.features.scheduler, process.env, {
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
  });

  scheduler?.start();
  healthLogger();

  registerShutdown(server, db, scheduler);

  return server;
};

export default { createApp, startServer };
