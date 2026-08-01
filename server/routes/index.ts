// Routes index - sets up all API routes
// Provides a single import point for all routes

import { Router } from 'express';
import userRoutes from './userRoutes.js';
import authRoutes from './authRoutes.js';
import clientRoutes from './clientRoutes.js';
import invoiceRoutes from './invoiceRoutes.js';
import expenseRoutes from './expenseRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import healthRoutes from './healthRoutes.js';
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
router.use('/api/cron', cronRoutes);
router.use('/api/templates', templateRoutes);
router.use('/api/recurring-templates', recurringInvoiceTemplateRoutes);
router.use('/api/db', databaseRoutes);
// The Stripe webhook receiver is not mounted here - it needs the raw request
// body, so app.ts mounts it ahead of the body parsers.
router.use('/api/stripe', stripeRoutes);
router.use('/api/email', emailRoutes);

// Health check routes
router.use('/api/health', healthRoutes);

export default router;