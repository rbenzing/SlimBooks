// Main application setup for Slimbooks server
// Clean, modular server configuration

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

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
  validateFileUpload
} from './middleware/index.js';

// Import routes
import routes from './routes/index.js';
import webhookRoutes from './routes/webhookRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create and configure Express application
 */
export const createApp = async () => {
  // Validate configuration
  validateConfig();

  // Initialize database
  const includeSampleData = serverConfig.enableSampleData || serverConfig.isDevelopment;
  await initializeDatabase(includeSampleData);

  // Create Express app
  const app = express();

  // Security middleware
  app.use(createSecurityHeaders(serverConfig.corsOrigin));
  app.use(cors(createCorsOptions(serverConfig.corsOrigin)));
  app.use(createGeneralRateLimit());

  // Logging and monitoring middleware
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

  // Body parsing middleware with size limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  app.use(cookieParser());

  // Multer configuration for file uploads
  const projectRoot = join(__dirname, '..');
  const upload = multer({
    dest: resolve(projectRoot, serverConfig.uploadPath),
    limits: {
      fileSize: serverConfig.maxFileSize,
      files: 1,
      fieldSize: 1024 * 1024 // 1MB field size limit
    },
    fileFilter: (req, file, cb) => {
      const allowedMimes = [
        'application/octet-stream',
        'application/x-sqlite3',
        'application/vnd.sqlite3'
      ];

      if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.db')) {
        cb(null, true);
      } else {
        cb(null, false);
        throw new Error('Invalid file type. Only database files are allowed.');
      }
    }
  });

  // File upload endpoint (if needed)
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

  // Serve static files from uploads directory
  const uploadsPath = join(__dirname, '..', 'public', 'uploads');
  app.use('/uploads', express.static(uploadsPath));

  // Serve static files from dist directory (built frontend)
  const distPath = join(__dirname, '..', 'dist');
  app.use(express.static(distPath));

  // API routes
  app.use('/', routes);

  // Serve index.html for client-side routing (must be after API routes)
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(join(distPath, 'index.html'));
  });

  // 404 handler for unmatched routes
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
};

/**
 * Start the server
 */
export const startServer = async () => {
  try {
    const app = await createApp();
    
    // HTTP Server
    const server = app.listen(serverConfig.port, serverConfig.host, () => {
      console.log(`🚀 Slimbooks server running on http://${serverConfig.host}:${serverConfig.port}`);
      console.log(`📊 Environment: ${serverConfig.nodeEnv} | CORS: ${serverConfig.corsOrigin} | Rate limit: ${serverConfig.rateLimiting.maxRequests}/${serverConfig.rateLimiting.windowMs / 1000}s`);

      const features = [];
      if (serverConfig.enableDebugEndpoints) features.push('Debug');
      if (serverConfig.enableSampleData || serverConfig.isDevelopment) features.push('Sample data');
      if (features.length > 0) {
        console.log(`🔧 Features: ${features.join(', ')}`);
      }
    });

    // Initialize health logging
    healthLogger();

    // Graceful shutdown handling
    const { gracefulShutdown } = await import('./middleware/index.js');
    const { db } = await import('./models/index.js');
    gracefulShutdown(server, db);

    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

export default { createApp, startServer };
