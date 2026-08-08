// Public runtime configuration for the SPA.
//
// One bundle is built and deployed to every supported host, so nothing
// host-specific can be baked in at build time. This endpoint carries no secrets
// — only what the UI needs to avoid offering a control the host cannot honour,
// such as a PDF button on a host with no Chromium.

import { Router, type Request, type Response } from 'express';
import { appConfig } from '../config/index.js';
import type { Runtime } from '../runtime/types.js';

export const createConfigRoutes = (runtime: Runtime): Router => {
  const router: Router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json({
      appName: appConfig.name,
      version: appConfig.version,
      publicUrl: runtime.urls.publicUrl,
      features: runtime.features
    });
  });

  return router;
};

export default createConfigRoutes;
