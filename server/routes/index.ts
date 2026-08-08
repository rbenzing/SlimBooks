// Routes index - sets up all API routes
// Provides a single import point for all routes

import { Router } from 'express';
import userRoutes from './userRoutes.js';
import authRoutes from './authRoutes.js';
import clientRoutes from './clientRoutes.js';
import invoiceRoutes from './invoiceRoutes.js';
import expenseRoutes from './expenseRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import { createHealthRoutes } from './healthRoutes.js';
import { createConfigRoutes } from './configRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import projectSettingsRoutes from './projectSettingsRoutes.js';
import counterRoutes from './counterRoutes.js';
import reportRoutes from './reportRoutes.js';
import pdfRoutes from './pdfRoutes.js';
import cronRoutes from './cronRoutes.js';
import templateRoutes from './templateRoutes.js';
import recurringInvoiceTemplateRoutes from './recurringInvoiceTemplateRoutes.js';
import databaseRoutes from './databaseRoutes.js';
import stripeRoutes from './stripeRoutes.js';
import emailRoutes from './emailRoutes.js';
import { requireAuth, requireAdmin } from '../middleware/index.js';
import type { Runtime } from '../runtime/types.js';

/**
 * Build the API router.
 *
 * Takes the runtime so future sub-routers (e.g. the config routes that read
 * `runtime.features`) can be threaded through from a single place, without
 * each one reaching for a global. Every mount below is unchanged from before
 * this became a factory.
 */
export const createRoutes = (runtime: Runtime): Router => {
  const router: Router = Router();

  // API routes with /api prefix
  router.use('/api/auth', authRoutes);
  router.use('/api/users', userRoutes);
  router.use('/api/clients', clientRoutes);
  router.use('/api/invoices', invoiceRoutes);
  router.use('/api/expenses', expenseRoutes);
  router.use('/api/payments', paymentRoutes);
  router.use('/api/settings', settingsRoutes);
  router.use('/api/project-settings', projectSettingsRoutes);
  router.use('/api/counters', counterRoutes);
  router.use('/api/reports', reportRoutes);
  router.use('/api/pdf', pdfRoutes);

  // The cron endpoint exists only for hosts where an external scheduler owns
  // recurring work. When the in-process scheduler is running it would be a
  // second, redundant trigger — and it used to be mounted unconditionally with
  // no authentication at all, so anyone who could reach the server could
  // generate invoices.
  if (!runtime.features.scheduler) {
    router.use('/api/cron', requireAuth, requireAdmin, cronRoutes);
  }
  router.use('/api/templates', templateRoutes);
  router.use('/api/recurring-templates', recurringInvoiceTemplateRoutes);
  router.use('/api/db', databaseRoutes);
  // The Stripe webhook receiver is not mounted here - it needs the raw request
  // body, so app.ts mounts it ahead of the body parsers.
  router.use('/api/stripe', stripeRoutes);
  router.use('/api/email', emailRoutes);

  // What this instance resolved, for the SPA and for operators. Public and
  // secret-free by design: the bundle is built once and deployed anywhere, so
  // it cannot know its host's capabilities until it asks.
  router.use('/api/config', createConfigRoutes(runtime));

  // Health check routes
  router.use('/api/health', createHealthRoutes(runtime));

  return router;
};