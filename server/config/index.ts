// Configuration management for Slimbooks server
// Centralizes all environment variables and app settings with TypeScript type safety

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from project root
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

/**
 * The application version, read from package.json.
 *
 * One source of truth: the version was previously written out by hand in three
 * places — here, the health endpoint and the seed data — while package.json
 * said something different again, so "which version is running" had four
 * possible answers.
 *
 * Resolved by walking up rather than by a fixed relative path, because this
 * module sits at `server/config` in development and `server/dist/config` once
 * compiled, and a fixed path cannot be right in both.
 */
const readPackageVersion = (): string => {
  try {
    let directory = __dirname;

    for (let level = 0; level < 5; level += 1) {
      const candidate = join(directory, 'package.json');

      if (existsSync(candidate)) {
        const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: string };
        if (parsed.version) return parsed.version;
      }

      directory = dirname(directory);
    }
  } catch (error) {
    console.warn('Could not read version from package.json:', (error as Error).message);
  }

  return '0.0.0';
};

export const APP_VERSION = readPackageVersion();

/**
 * Server configuration interface
 */
export interface ServerConfig {
  port: number;
  host: string;
  nodeEnv: string;
  isDevelopment: boolean;
  isProduction: boolean;
  corsOrigin: string;
  corsCredentials: boolean;
  maxFileSize: number;
  uploadPath: string;
  enableDebugEndpoints: boolean;
  enableSampleData: boolean;
  rateLimiting: {
    windowMs: number;
    maxRequests: number;
    loginWindowMs: number;
    loginMaxRequests: number;
  };
}

/**
 * Database configuration interface
 */
export interface DatabaseConfig {
  dbPath: string;
  backupPath: string;
  timeout: number;
  verbose: ((message: string) => void) | null;
  pragmas: {
    foreign_keys: string;
    journal_mode: string;
  };
}

/**
 * Authentication configuration interface
 */
export interface AuthConfig {
  jwtSecret: string;
  jwtRefreshSecret: string;
  sessionSecret: string;
  accessTokenExpiry: number;
  refreshTokenExpiry: number;
  emailTokenExpiry: number;
  passwordResetExpiry: number;
  bcryptRounds: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
  requireEmailVerification: boolean;
}

/**
 * Email configuration interface
 */
export interface EmailConfig {
  smtp: {
    host: string | undefined;
    port: number;
    secure: boolean;
    auth: {
      user: string | undefined;
      pass: string | undefined;
    };
  };
  from: string;
  templates: {
    verification: {
      subject: string;
      from: string;
    };
    passwordReset: {
      subject: string;
      from: string;
    };
  };
  isConfigured: boolean;
}

/**
 * Stripe configuration interface
 */
export interface StripeConfig {
  secretKey: string | undefined;
  publishableKey: string | undefined;
  webhookSecret: string | undefined;
  currency: string;
  isConfigured: boolean;
}

/**
 * Google OAuth configuration interface
 */
export interface GoogleConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  redirectUri: string | undefined;
  isConfigured: boolean;
}

/**
 * Application configuration interface
 */
export interface AppConfig {
  name: string;
  version: string;
  description: string;
  defaultAdmin: {
    email: string;
    name: string;
    role: string;
  };
}

/**
 * Logging configuration interface
 */
export interface LoggingConfig {
  level: string;
  enableRequestLogging: boolean;
  enableErrorLogging: boolean;
  logDir: string;
  logFile: string;
  errorLogFile: string;
  accessLogFile: string;
}

/**
 * Validation configuration interface
 */
export interface ValidationConfig {
  password: {
    minLength: number;
    maxLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
  };
  allowedMimeTypes: string[];
  maxFieldLengths: {
    name: number;
    email: number;
    description: number;
    notes: number;
  };
}

/**
 * Complete application configuration interface
 */
export interface AppConfigComplete {
  server: ServerConfig;
  database: DatabaseConfig;
  auth: AuthConfig;
  email: EmailConfig;
  stripe: StripeConfig;
  google: GoogleConfig;
  app: AppConfig;
  logging: LoggingConfig;
  validation: ValidationConfig;
}

/**
 * Server configuration
 */
export const serverConfig: ServerConfig = {
  port: parseInt(process.env.PORT || '3002'),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // CORS configuration
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:8080',
  corsCredentials: process.env.CORS_CREDENTIALS === 'true',

  // File upload configuration
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
  uploadPath: process.env.UPLOAD_PATH || 'uploads',

  // Security configuration
  enableDebugEndpoints: process.env.ENABLE_DEBUG_ENDPOINTS === 'true',
  enableSampleData: process.env.ENABLE_SAMPLE_DATA === 'true',

  // Rate limiting configuration
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // requests per window
    loginWindowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || '900000'),
    loginMaxRequests: parseInt(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS || '5') // login attempts per window
  }
};

/**
 * Database configuration
 */
export const databaseConfig: DatabaseConfig = {
  // Database file path (relative to project root)
  dbPath: process.env.DB_PATH || 'data/slimbooks.db',
  backupPath: process.env.DB_BACKUP_PATH || 'data/backups',

  // Connection settings
  timeout: 5000,
  verbose: serverConfig.isDevelopment ? console.log : null,

  // SQLite pragmas
  pragmas: {
    foreign_keys: 'ON',
    journal_mode: 'WAL'
  }
};

/**
 * Authentication configuration
 */
export const authConfig: AuthConfig = {
  // JWT configuration
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-change-in-production',
  sessionSecret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',

  // Token expiration (in milliseconds)
  accessTokenExpiry: parseInt(process.env.ACCESS_TOKEN_EXPIRY || '7200000'), // 2 hours
  refreshTokenExpiry: parseInt(process.env.REFRESH_TOKEN_EXPIRY || '604800000'), // 7 days
  emailTokenExpiry: parseInt(process.env.EMAIL_TOKEN_EXPIRY || '86400000'), // 24 hours
  passwordResetExpiry: parseInt(process.env.PASSWORD_RESET_EXPIRY || '3600000'), // 1 hour

  // Password hashing
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),

  // Account lockout settings
  maxLoginAttempts: parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS || '5'),
  lockoutDuration: parseInt(process.env.ACCOUNT_LOCKOUT_DURATION || '1800000'), // 30 minutes

  // Email verification
  requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true'
};

/**
 * Email configuration
 */
export const emailConfig: EmailConfig = {
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  },

  // Email settings
  from: process.env.EMAIL_FROM || 'noreply@slimbooks.app',

  // Email templates
  templates: {
    verification: {
      subject: 'Verify your email address',
      from: process.env.EMAIL_FROM || 'noreply@slimbooks.app'
    },
    passwordReset: {
      subject: 'Reset your password',
      from: process.env.EMAIL_FROM || 'noreply@slimbooks.app'
    }
  },

  // Check if email is configured
  isConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
};

/**
 * Stripe configuration (for payment processing)
 */
export const stripeConfig: StripeConfig = {
  secretKey: process.env.STRIPE_SECRET_KEY,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,

  // Default currency
  currency: process.env.DEFAULT_CURRENCY || 'usd',

  // Check if Stripe is configured
  isConfigured: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY)
};

/**
 * Google OAuth configuration
 */
export const googleConfig: GoogleConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,

  // Check if Google OAuth is configured
  isConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
};

/**
 * Application metadata
 */
export const appConfig: AppConfig = {
  name: 'Slimbooks',
  version: APP_VERSION,
  description: 'Simple invoicing and expense tracking application',
  
  // Default admin user credentials
  defaultAdmin: {
    email: 'admin@slimbooks.app',
    name: 'Administrator',
    role: 'admin'
  }
};

/**
 * Logging configuration
 */
export const loggingConfig: LoggingConfig = {
  level: process.env.LOG_LEVEL || (serverConfig.isDevelopment ? 'debug' : 'info'),
  enableRequestLogging: true,
  enableErrorLogging: true,

  // Log file paths
  logDir: 'logs',
  logFile: process.env.LOG_FILE || './logs/app.log',
  errorLogFile: 'error.log',
  accessLogFile: 'access.log'
};

/**
 * Validation configuration
 */
export const validationConfig: ValidationConfig = {
  // Password requirements
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: false,
    requireLowercase: false,
    requireNumbers: false,
    requireSpecialChars: false
  },
  
  // File upload restrictions
  allowedMimeTypes: [
    'application/octet-stream',
    'application/x-sqlite3',
    'application/vnd.sqlite3'
  ],
  
  // Input length limits
  maxFieldLengths: {
    name: 100,
    email: 255,
    description: 1000,
    notes: 2000
  }
};

/**
 * Get all configuration as a single object
 * @returns Complete configuration object
 */
export const getAllConfig = (): AppConfigComplete => ({
  server: serverConfig,
  database: databaseConfig,
  auth: authConfig,
  email: emailConfig,
  stripe: stripeConfig,
  google: googleConfig,
  app: appConfig,
  logging: loggingConfig,
  validation: validationConfig
});

/**
 * Validate required environment variables
 * @throws {Error} If required environment variables are missing
 */
export const validateConfig = (): void => {
  const requiredVars: string[] = [];
  const warnings: string[] = [];

  // Always required variables
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
    if (serverConfig.isProduction) {
      requiredVars.push('JWT_SECRET');
    } else {
      warnings.push('JWT_SECRET is using default value - change in production');
    }
  }

  // Check for missing required variables
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Configuration warnings are disabled for cleaner logs
  // if (warnings.length > 0 && serverConfig.isDevelopment) {
  //   console.warn('⚠️  Configuration warnings:');
  //   warnings.forEach(warning => console.warn(`   - ${warning}`));
  // }

  // Log configuration status in a concise format
  const services: string[] = [];
  if (emailConfig.isConfigured) services.push('Email');
  if (stripeConfig.isConfigured) services.push('Stripe');
  if (googleConfig.isConfigured) services.push('OAuth');

  console.log(`✅ Config validated | Services: ${services.length > 0 ? services.join(', ') : 'None'} | Email verification: ${authConfig.requireEmailVerification ? 'On' : 'Off'}`);
};

// Export default configuration
const config: AppConfigComplete = {
  server: serverConfig,
  database: databaseConfig,
  auth: authConfig,
  email: emailConfig,
  stripe: stripeConfig,
  google: googleConfig,
  app: appConfig,
  logging: loggingConfig,
  validation: validationConfig
};

export default config;