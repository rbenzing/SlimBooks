// Middleware index - exports all middleware modules
// Provides a single import point for all middleware

// Authentication middleware
export {
  requireAuth,
  requireAdmin,
  requireRole,
  requireEmailVerified,
  optionalAuth,
  generateToken,
  verifyToken,
  isAccountLocked
} from './auth.js';

// Validation middleware
export {
  validateRequest,
  validationRules,
  validationSets,
  validateFileUpload,
  sanitizeSQL
} from './validation.js';

// Error handling middleware
export {
  AppError,
  DatabaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  timeoutHandler,
  registerShutdown
} from './errorHandler.js';

// Logging middleware
export {
  requestLogger,
  securityLogger,
  dbLogger,
  performanceMonitor,
  userActivityLogger,
  endpointTracker,
  errorRateMonitor,
  healthLogger
} from './logging.js';

// Security middleware (from existing security.js)
export {
  createGeneralRateLimit,
  createLoginRateLimit,
  createSecurityHeaders,
  createCorsOptions
} from './security.js';