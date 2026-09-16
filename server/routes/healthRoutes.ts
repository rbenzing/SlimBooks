// Health check routes for Slimbooks API
// Provides system health and status information

import { Router, type Request, type Response } from 'express';
import { serverConfig, appConfig } from '../config/index.js';
import type { Runtime } from '../runtime/types.js';

export const createHealthRoutes = (runtime: Runtime): Router => {
const router: Router = Router();

/**
 * Basic health check
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { databaseHealthService } = await import('../services/DatabaseHealthService.js');
    const isHealthy = await databaseHealthService.checkDatabaseHealth();

    // 503 when the database is unreachable. Load balancers, container
    // orchestrators and uptime monitors read the status code, not the body, so
    // answering 200 with `database: "disconnected"` kept traffic arriving at an
    // instance that could not serve a single request.
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'ok' : 'error',
      database: isHealthy ? 'connected' : 'disconnected',
      version: appConfig.version,
      timestamp: new Date().toISOString(),
      environment: serverConfig.nodeEnv,
      // What this instance actually resolved. "Why is there no PDF button here"
      // should be answerable from this endpoint rather than from the container's
      // logs, which an operator may not be able to reach.
      features: runtime.features,
      providers: {
        pdf: runtime.pdf?.name ?? null,
        scheduler: runtime.features.scheduler ? 'in-process' : null,
        tls: runtime.listener.tls
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Detailed health check
 */
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const { databaseHealthService } = await import('../services/DatabaseHealthService.js');
    const healthData = await databaseHealthService.getDetailedHealthData();
    
    // System information
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    // Same reasoning as the basic check: the status code is the part monitoring
    // reads.
    res.status(healthData.status === 'ok' ? 200 : 503).json({
      status: healthData.status,
      timestamp: new Date().toISOString(),
      environment: serverConfig.nodeEnv,
      version: appConfig.version,
      database: healthData.database,
      system: {
        uptime: Math.floor(uptime),
        memory: {
          used: Math.round(memUsage.heapUsed / 1024 / 1024),
          total: Math.round(memUsage.heapTotal / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024)
        },
        node_version: process.version,
        platform: process.platform
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: (error as Error).message,
      database: {
        status: 'disconnected'
      }
    });
  }
});

/**
 * Readiness check (for container orchestration)
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const { databaseHealthService } = await import('../services/DatabaseHealthService.js');
    const isHealthy = await databaseHealthService.checkDatabaseHealth();
    
    if (isHealthy) {
      res.json({ 
        ready: true,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({ 
        ready: false,
        error: 'Database not ready',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({ 
      ready: false,
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Liveness check (for container orchestration)
 */
router.get('/live', (req: Request, res: Response) => {
  res.json({
    alive: true,
    timestamp: new Date().toISOString()
  });
});

  return router;
};

export default createHealthRoutes;