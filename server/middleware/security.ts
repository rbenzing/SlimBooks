// Security middleware for Slimbooks server
// Implements rate limiting, input validation, and security headers

import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import helmet, { type HelmetOptions } from 'helmet';
import { type Request, type Response, type NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import { serverConfig } from '../config/index.js';

interface RateLimitResponse {
  error: string;
  retryAfter: number;
}

interface CorsOptions {
  origin: string | boolean | string[];
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
  maxAge: number;
}

interface SQLSanitizeResult {
  query: string;
  params: unknown[];
}

// Rate limiting configurations
export const createGeneralRateLimit = (
  windowMs = serverConfig.rateLimiting.windowMs,
  max = serverConfig.rateLimiting.maxRequests
): RateLimitRequestHandler => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(windowMs / 1000)
    } as RateLimitResponse,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // Skip rate limiting for health checks
    skip: (req: Request): boolean => {
      return req.path === '/api/health' || req.path === '/health';
    },
    handler: (_req: Request, res: Response): void => {
      res.status(429).json({
        success: false,
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

export const createLoginRateLimit = (
  windowMs = serverConfig.rateLimiting.loginWindowMs,
  max = serverConfig.rateLimiting.loginMaxRequests
): RateLimitRequestHandler => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: 'Too many login attempts from this IP, please try again later.',
      retryAfter: Math.ceil(windowMs / 1000)
    } as RateLimitResponse,
    skipSuccessfulRequests: true, // Don't count successful requests
    handler: (_req: Request, res: Response): void => {
      res.status(429).json({
        success: false,
        error: 'Too many login attempts from this IP, please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Security headers configuration
export const createSecurityHeaders = (_corsOrigin = 'http://localhost:8080') => {
  const helmetOptions: HelmetOptions = {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Disable for compatibility
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  };

  return helmet(helmetOptions);
};

// Input validation middleware
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

// Common validation rules
export const validationRules = {
  // User validation
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Must be a valid email address'),
  
  password: body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters'),
  
  name: body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  
  // Database query validation for read-only operations
  sql: body('sql')
    .custom((value: string): boolean => {
      // Block dangerous SQL operations for read-only endpoints
      const dangerousPatterns = [
        /DROP\s+TABLE/i,
        /DELETE\s+FROM/i,
        /TRUNCATE/i,
        /ALTER\s+TABLE/i,
        /CREATE\s+TABLE/i,
        /UPDATE.*SET/i,
        /INSERT\s+INTO/i
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(value)) {
          throw new Error('SQL operation not allowed');
        }
      }
      return true;
    }),

  // Database query validation for write operations (more permissive)
  sqlWrite: body('sql')
    .custom((value: string): boolean => {
      // Only block extremely dangerous operations for write endpoints
      const dangerousPatterns = [
        /DROP\s+TABLE/i,
        /DROP\s+DATABASE/i,
        /TRUNCATE/i,
        /CREATE\s+TABLE/i
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(value)) {
          throw new Error('SQL operation not allowed');
        }
      }
      return true;
    }),
  
  // ID validation
  id: param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer'),
  
  // Invoice validation
  invoiceNumber: body('invoice_number')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Invoice number must be between 1 and 50 characters'),
  
  amount: body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
  
  // Client validation
  clientName: body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Client name must be between 1 and 100 characters'),
  
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
  
  // File upload validation
  fileSize: (maxSize = 10 * 1024 * 1024) => (req: Request, res: Response, next: NextFunction): void => {
    if (req.file && req.file.size > maxSize) {
      res.status(400).json({
        success: false,
        error: `File size exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`
      });
      return;
    }
    next();
  }
};

// SQL injection protection for dynamic queries
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

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  const originalSend = res.send.bind(res);
  
  res.send = function(data: unknown): Response {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    return originalSend(data);
  };
  
  next();
};

// Error handling middleware
export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction): void => {
  console.error('Error:', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const statusCode = 'status' in err && typeof err.status === 'number' ? err.status : 500;
  
  res.status(statusCode).json({
    success: false,
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack })
  });
};

// Authentication and role middleware live in ./auth.ts, which actually verifies
// the JWT, loads the user, and checks lockout and email verification. This file
// previously exported same-named stubs that accepted any non-empty token and let
// every caller through; they were unreferenced, but importing one by mistake
// would have silently disabled authentication on whatever route used it.

// CORS configuration
export const createCorsOptions = (
  origin = serverConfig.corsOrigin,
  credentials = serverConfig.corsCredentials
): CorsOptions => {
  return {
    origin: origin,
    credentials: credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // 24 hours
  };
};