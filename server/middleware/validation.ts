// Validation middleware for Slimbooks
// Handles input validation, sanitization, and validation rules

import { type Request, type Response, type NextFunction } from 'express';
import { body, param, query, validationResult, type ValidationChain } from 'express-validator';
import { validationConfig, serverConfig } from '../config/index.js';

interface SQLSanitizeResult {
  query: string;
  params: unknown[];
}

/**
 * Middleware to check validation results
 */
export const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
    return;
  }
  next();
};

/**
 * Common validation rules
 */
export const validationRules = {
  // User validation
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Must be a valid email address')
    .isLength({ max: validationConfig.maxFieldLengths.email })
    .withMessage(`Email must be less than ${validationConfig.maxFieldLengths.email} characters`),
  
  password: body('password')
    .isLength({ 
      min: validationConfig.password.minLength, 
      max: validationConfig.password.maxLength 
    })
    .withMessage(`Password must be between ${validationConfig.password.minLength} and ${validationConfig.password.maxLength} characters`),
  
  name: body('name')
    .trim()
    .isLength({ min: 1, max: validationConfig.maxFieldLengths.name })
    .withMessage(`Name must be between 1 and ${validationConfig.maxFieldLengths.name} characters`)
    .escape(),
  
  // ID validation
  id: param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer'),
  
  // Invoice validation
  invoiceNumber: body('invoice_number')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Invoice number must be between 1 and 50 characters')
    .escape(),
  
  amount: body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
  
  // Client validation
  clientName: body('name')
    .trim()
    .isLength({ min: 1, max: validationConfig.maxFieldLengths.name })
    .withMessage(`Client name must be between 1 and ${validationConfig.maxFieldLengths.name} characters`)
    .escape(),
  
  clientEmail: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Must be a valid email address'),
  
  // Settings validation
  settingsKey: body('key')
    .trim()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9_.-]+$/)
    .withMessage('Settings key must contain only alphanumeric characters, dots, hyphens, and underscores'),
  
  // Date validation
  date: body('date')
    .isISO8601()
    .withMessage('Date must be in ISO 8601 format'),
  
  // Description validation
  description: body('description')
    .optional()
    .trim()
    .isLength({ max: validationConfig.maxFieldLengths.description })
    .withMessage(`Description must be less than ${validationConfig.maxFieldLengths.description} characters`)
    .escape(),
  
  // Notes validation
  notes: body('notes')
    .optional()
    .trim()
    .isLength({ max: validationConfig.maxFieldLengths.notes })
    .withMessage(`Notes must be less than ${validationConfig.maxFieldLengths.notes} characters`)
    .escape(),
  
  // Phone validation
  phone: body('phone')
    .optional()
    .isMobilePhone('en-US')
    .withMessage('Must be a valid phone number'),
  
  // Status validation
  status: body('status')
    .isIn(['draft', 'sent', 'paid', 'overdue', 'cancelled'])
    .withMessage('Status must be one of: draft, sent, paid, overdue, cancelled'),
  
  // Role validation
  role: body('role')
    .isIn(['user', 'admin'])
    .withMessage('Role must be either user or admin'),
  
  // Category validation (for expenses)
  category: body('category')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Category must be between 1 and 50 characters')
    .escape(),
  
  // Merchant validation (for expenses)
  // The expense payee is `vendor` everywhere; see validationSets.createExpense.
  vendor: body('vendor')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Vendor must be between 1 and 100 characters')
    .escape()
};

/**
 * Validation rule sets for different endpoints
 */
export const validationSets = {
  // User validation sets
  createUser: [
    validationRules.name,
    validationRules.email,
    validationRules.password,
    validationRules.role
  ] as ValidationChain[],
  
  updateUser: [
    validationRules.id,
    body('name').optional().trim().isLength({ min: 1, max: 100 }).escape(),
    body('email').optional().isEmail().normalizeEmail(),
    body('role').optional().isIn(['user', 'admin'])
  ] as ValidationChain[],
  
  // Client validation sets
  createClient: [
    body('clientData.name')
      .trim()
      .isLength({ min: 1, max: validationConfig.maxFieldLengths.name })
      .withMessage(`Client name must be between 1 and ${validationConfig.maxFieldLengths.name} characters`)
      .escape(),
    body('clientData.email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Must be a valid email address'),
    body('clientData.phone').optional().trim().escape(),
    body('clientData.company').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.address').optional().trim().isLength({ max: 200 }).escape(),
    body('clientData.city').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.state').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.zipCode').optional().trim().isLength({ max: 20 }).escape(),
    body('clientData.country').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.tax_id').optional().trim().isLength({ max: 50 }).escape(),
    body('clientData.notes').optional().trim().isLength({ max: 1000 }).escape(),
    body('clientData.is_active').optional().isBoolean()
  ] as ValidationChain[],
  
  updateClient: [
    validationRules.id,
    body('clientData.name').optional().trim().isLength({ min: 1, max: 100 }).escape(),
    body('clientData.email').optional().isEmail().normalizeEmail(),
    body('clientData.phone').optional().trim().escape(),
    body('clientData.company').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.address').optional().trim().isLength({ max: 200 }).escape(),
    body('clientData.city').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.state').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.zipCode').optional().trim().isLength({ max: 20 }).escape(),
    body('clientData.country').optional().trim().isLength({ max: 100 }).escape(),
    body('clientData.tax_id').optional().trim().isLength({ max: 50 }).escape(),
    body('clientData.notes').optional().trim().isLength({ max: 1000 }).escape(),
    body('clientData.is_active').optional().isBoolean()
  ] as ValidationChain[],
  
  // Invoice validation sets
  createInvoice: [
    body('invoiceData.invoice_number')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Invoice number must be between 1 and 50 characters')
      .escape(),
    body('invoiceData.client_id').isInt({ min: 1 }).withMessage('Client ID must be a positive integer'),
    body('invoiceData.amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('invoiceData.tax_amount').optional().isFloat({ min: 0 }).withMessage('Tax amount must be positive'),
    body('invoiceData.due_date').optional().isISO8601().withMessage('Due date must be in ISO 8601 format'),
    body('invoiceData.issue_date').optional().isISO8601().withMessage('Issue date must be in ISO 8601 format'),
    body('invoiceData.description')
      .optional()
      .trim()
      .isLength({ max: validationConfig.maxFieldLengths.description })
      .withMessage(`Description must be less than ${validationConfig.maxFieldLengths.description} characters`)
      .escape(),
    body('invoiceData.status')
      .optional()
      .isIn(['draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'])
      .withMessage('Status must be one of: draft, sent, paid, overdue, cancelled, refunded')
  ] as ValidationChain[],
  
  updateInvoice: [
    validationRules.id,
    body('invoiceData.invoice_number').optional().trim().isLength({ min: 1, max: 50 }).escape(),
    body('invoiceData.client_id').optional().isInt({ min: 1 }),
    body('invoiceData.amount').optional().isFloat({ min: 0 }),
    body('invoiceData.tax_amount').optional().isFloat({ min: 0 }),
    body('invoiceData.due_date').optional().isISO8601(),
    body('invoiceData.issue_date').optional().isISO8601(),
    body('invoiceData.description').optional().trim().isLength({ max: validationConfig.maxFieldLengths.description }).escape(),
    body('invoiceData.status').optional().isIn(['draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'])
  ] as ValidationChain[],
  
  // Expense validation sets
  createExpense: [
    body('expenseData.date').isISO8601().withMessage('Date must be in ISO 8601 format'),
    body('expenseData.vendor')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Vendor must be between 1 and 100 characters')
      .escape(),
    body('expenseData.category')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Category must be between 1 and 50 characters')
      .escape(),
    body('expenseData.amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('expenseData.description')
      .optional()
      .trim()
      .isLength({ max: validationConfig.maxFieldLengths.description })
      .withMessage(`Description must be less than ${validationConfig.maxFieldLengths.description} characters`)
      .escape(),
    body('expenseData.status').optional().isIn(['pending', 'approved', 'rejected', 'reimbursed']).withMessage('Status must be one of: pending, approved, rejected, reimbursed')
  ] as ValidationChain[],
  
  updateExpense: [
    validationRules.id,
    body('expenseData.date').optional().isISO8601(),
    body('expenseData.vendor').optional().trim().isLength({ min: 1, max: 100 }).escape(),
    body('expenseData.category').optional().trim().isLength({ min: 1, max: 50 }).escape(),
    body('expenseData.amount').optional().isFloat({ min: 0 }),
    body('expenseData.description').optional().trim().isLength({ max: validationConfig.maxFieldLengths.description }).escape(),
    body('expenseData.status').optional().isIn(['pending', 'approved', 'rejected', 'reimbursed']).withMessage('Status must be one of: pending, approved, rejected, reimbursed')
  ] as ValidationChain[],
  
  // Payment validation sets
  getPayments: [
    query('status').optional().isIn(['received', 'pending', 'failed', 'refunded']),
    query('method').optional().trim().isLength({ max: 50 }),
    query('date_from').optional().isISO8601(),
    query('date_to').optional().isISO8601(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 })
  ] as ValidationChain[],
  
  getPaymentById: [
    validationRules.id
  ] as ValidationChain[],
  
  createPayment: [
    body('paymentData.date').isISO8601().withMessage('Date must be in ISO 8601 format'),
    body('paymentData.client_name').trim().isLength({ min: 1, max: 100 }).withMessage('Client name is required and must be less than 100 characters').escape(),
    body('paymentData.amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
    body('paymentData.method').isIn(['cash', 'check', 'bank_transfer', 'credit_card', 'paypal', 'other']).withMessage('Invalid payment method'),
    body('paymentData.invoice_id').optional().isInt({ min: 1 }).withMessage('Invoice ID must be a positive integer'),
    body('paymentData.reference').optional().trim().isLength({ max: 100 }).escape(),
    body('paymentData.description').optional().trim().isLength({ max: 500 }).escape(),
    body('paymentData.status').optional().isIn(['received', 'pending', 'failed', 'refunded'])
  ] as ValidationChain[],
  
  updatePayment: [
    validationRules.id,
    body('paymentData.date').optional().isISO8601(),
    body('paymentData.client_name').optional().trim().isLength({ min: 1, max: 100 }).escape(),
    body('paymentData.amount').optional().isFloat({ min: 0.01 }),
    body('paymentData.method').optional().isIn(['cash', 'check', 'bank_transfer', 'credit_card', 'paypal', 'other']),
    body('paymentData.invoice_id').optional().isInt({ min: 1 }),
    body('paymentData.reference').optional().trim().isLength({ max: 100 }).escape(),
    body('paymentData.description').optional().trim().isLength({ max: 500 }).escape(),
    body('paymentData.status').optional().isIn(['received', 'pending', 'failed', 'refunded'])
  ] as ValidationChain[],
  
  deletePayment: [
    validationRules.id
  ] as ValidationChain[],
  
  getPaymentStats: [
    query('date_from').optional().isISO8601(),
    query('date_to').optional().isISO8601()
  ] as ValidationChain[],
  
  bulkDeletePayments: [
    body('payment_ids').isArray({ min: 1 }).withMessage('Payment IDs array is required'),
    body('payment_ids.*').isInt({ min: 1 }).withMessage('All payment IDs must be positive integers')
  ] as ValidationChain[],
  
  // Authentication validation sets
  login: [
    validationRules.email,
    validationRules.password
  ] as ValidationChain[],
  
  register: [
    validationRules.name,
    validationRules.email,
    validationRules.password
  ] as ValidationChain[],
  
  forgotPassword: [
    validationRules.email
  ] as ValidationChain[],
  
  resetPassword: [
    body('token').notEmpty().withMessage('Reset token is required'),
    validationRules.password
  ] as ValidationChain[],

  // Invoice design template validation (invoice_design_templates, /api/templates)
  getTemplateById: [
    validationRules.id
  ] as ValidationChain[],

  createTemplate: [
    body('templateData.name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Template name must be between 2 and 100 characters')
      .escape(),
    body('templateData.content').notEmpty().withMessage('Template content is required'),
    body('templateData.is_default').optional().isBoolean().withMessage('is_default must be a boolean'),
    body('templateData.variables').optional().isString()
  ] as ValidationChain[],

  updateTemplate: [
    validationRules.id,
    body('templateData.name').optional().trim().isLength({ min: 2, max: 100 }).escape(),
    body('templateData.content').optional().notEmpty().withMessage('Template content cannot be empty'),
    body('templateData.is_default').optional().isBoolean(),
    body('templateData.variables').optional().isString()
  ] as ValidationChain[],

  deleteTemplate: [
    validationRules.id
  ] as ValidationChain[],

  // Recurring invoice template validation (recurring_invoice_templates,
  // /api/recurring-templates). Mirrors RecurringInvoiceTemplateRequest.
  getRecurringTemplateById: [
    validationRules.id
  ] as ValidationChain[],

  getRecurringTemplatesByClientId: [
    param('clientId').isInt({ min: 1 }).withMessage('Client ID must be a positive integer')
  ] as ValidationChain[],

  createRecurringTemplate: [
    body('templateData.name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Template name must be between 2 and 100 characters')
      .escape(),
    body('templateData.client_id').isInt({ min: 1 }).withMessage('Client ID must be a positive integer'),
    body('templateData.amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than zero'),
    body('templateData.frequency')
      .isIn(['weekly', 'monthly', 'quarterly', 'yearly', 'custom'])
      .withMessage('Frequency must be one of: weekly, monthly, quarterly, yearly, custom'),
    body('templateData.payment_terms')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Payment terms are required and must be less than 100 characters')
      .escape(),
    body('templateData.next_invoice_date')
      .isISO8601()
      .withMessage('Next invoice date must be in ISO 8601 format'),
    // `is_active` is the schedule flag; recurring templates have no `status` column.
    body('templateData.is_active').optional().isBoolean().withMessage('is_active must be a boolean'),
    body('templateData.line_items').optional().isString(),
    body('templateData.tax_amount').optional().isFloat({ min: 0 }).withMessage('Tax amount must be positive'),
    body('templateData.tax_rate_id').optional({ nullable: true }).isString().isLength({ max: 50 }),
    body('templateData.shipping_amount').optional().isFloat({ min: 0 }).withMessage('Shipping amount must be positive'),
    body('templateData.shipping_rate_id').optional({ nullable: true }).isString().isLength({ max: 50 }),
    body('templateData.description')
      .optional()
      .trim()
      .isLength({ max: validationConfig.maxFieldLengths.description })
      .escape(),
    body('templateData.notes').optional().trim().isLength({ max: 1000 }).escape()
  ] as ValidationChain[],

  updateRecurringTemplate: [
    validationRules.id,
    body('templateData.name').optional().trim().isLength({ min: 2, max: 100 }).escape(),
    body('templateData.client_id').optional().isInt({ min: 1 }),
    body('templateData.amount').optional().isFloat({ gt: 0 }),
    body('templateData.frequency').optional().isIn(['weekly', 'monthly', 'quarterly', 'yearly', 'custom']),
    body('templateData.payment_terms').optional().trim().isLength({ min: 1, max: 100 }).escape(),
    body('templateData.next_invoice_date').optional().isISO8601(),
    body('templateData.is_active').optional().isBoolean(),
    body('templateData.line_items').optional().isString(),
    body('templateData.tax_amount').optional().isFloat({ min: 0 }),
    body('templateData.tax_rate_id').optional({ nullable: true }).isString().isLength({ max: 50 }),
    body('templateData.shipping_amount').optional().isFloat({ min: 0 }),
    body('templateData.shipping_rate_id').optional({ nullable: true }).isString().isLength({ max: 50 }),
    body('templateData.description')
      .optional()
      .trim()
      .isLength({ max: validationConfig.maxFieldLengths.description })
      .escape(),
    body('templateData.notes').optional().trim().isLength({ max: 1000 }).escape()
  ] as ValidationChain[],

  toggleRecurringTemplate: [
    validationRules.id
  ] as ValidationChain[],

  deleteRecurringTemplate: [
    validationRules.id
  ] as ValidationChain[],

  processSingleTemplate: [
    validationRules.id
  ] as ValidationChain[]
};

/**
 * File upload validation middleware
 * @param maxSize - Maximum file size in bytes
 */
export const validateFileUpload = (maxSize = serverConfig.maxFileSize) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.file && req.file.size > maxSize) {
      res.status(400).json({
        success: false,
        error: `File size exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`
      });
      return;
    }
    
    if (req.file && !validationConfig.allowedMimeTypes.includes(req.file.mimetype)) {
      res.status(400).json({
        success: false,
        error: 'Invalid file type. Only database files are allowed.'
      });
      return;
    }
    
    next();
  };
};

/**
 * SQL injection protection for dynamic queries
 * @param query - SQL query
 * @param params - Query parameters
 * @returns Sanitized query and parameters
 */
export const sanitizeSQL = (query: string, params: unknown[] = []): SQLSanitizeResult => {
  // Basic SQL injection protection
  // In production, use parameterized queries exclusively
  const sanitizedParams = params.map(param => {
    if (typeof param === 'string') {
      return param.replace(/['"\\]/g, '');
    }
    return param;
  });
  
  return { query, params: sanitizedParams };
};