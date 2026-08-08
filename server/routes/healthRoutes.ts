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

    res.json({
      status: 'ok',
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
    
    res.json({
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