// Authentication types and interfaces
// Consolidated from both frontend and backend type definitions

import type { BaseEntity } from '../shared/common.types';

// User entity with all possible fields - BaseEntity is imported from shared/common.types.ts
export interface User extends BaseEntity {
  name: string;
  email: string;
  username: string;
  password_hash?: string;
  role: 'admin' | 'user' | 'viewer';
  email_verified: number; // SQLite uses INTEGER for boolean (0 or 1)
  google_id?: string;
  two_factor_enabled?: number;
  two_factor_secret?: string;
  backup_codes?: string;
  last_login?: number;
  failed_login_attempts: number;
  account_locked_until?: number;
  password_updated_at?: number;
  email_verified_at?: number;
}

// Public user interface without sensitive fields
export type UserPublic = Omit<User, 'password_hash' | 'two_factor_secret' | 'backup_codes'>;

/** A user as the management screen sees them. Never carries a password hash. */
export interface ManagedUser {
  id: number;
  name: string;
  email: string;
  username: string;
  role: 'admin' | 'user' | 'viewer';
  email_verified: boolean;
  /** Epoch milliseconds, or null when they have never signed in. */
  last_login: number | null;
  failed_login_attempts: number;
  /** Epoch milliseconds while the account is locked, otherwise null. */
  account_locked_until: number | null;
  created_at: number;
}

/**
 * What the form collects.
 *
 * `viewer` is absent on purpose: it is declared in the type union but no code
 * treats it differently from `user`, so offering it would promise an access
 * level that does not exist.
 */
export interface UserFormData {
  name: string;
  email: string;
  username: string;
  role: 'admin' | 'user';
  password?: string;
}

export interface AuthSession {
  id: number;
  user_id: number;
  session_token: string;
  refresh_token: string;
  expires_at: number;
  ip_address?: string;
  user_agent?: string;
  created_at: number;
}

export interface EmailVerificationToken {
  id: number;
  user_id: number;
  token: string;
  expires_at: number;
  created_at: number;
}

export interface PasswordResetToken {
  id: number;
  user_id: number;
  token: string;
  expires_at: number;
  used: boolean;
  created_at: number;
}

export interface OAuthCredentials {
  id: number;
  provider: string;
  client_id: string;
  client_secret: string;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  html_content: string;
  text_content?: string;
  variables?: string[];
  created_at: number;
  updated_at: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  remember_me?: boolean;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  confirm_password: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  session_token?: string;
  refresh_token?: string;
  message?: string;
  requires_2fa?: boolean;
  requires_email_verification?: boolean;
}

export interface TwoFactorSetup {
  secret: string;
  qr_code: string;
  backup_codes: string[];
}

// EmailSettings moved to domain/settings.types.ts to avoid duplication
// Import if needed: import { EmailSettings } from './settings.types';

export interface PasswordRequirements {
  min_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_numbers: boolean;
  require_special_chars: boolean;
}

export interface SecuritySettings {
  session_timeout: number; // minutes
  max_failed_attempts: number;
  lockout_duration: number; // minutes
  password_requirements: PasswordRequirements;
  require_email_verification: boolean;
  allow_google_oauth: boolean;
}

// Default settings
export const DEFAULT_PASSWORD_REQUIREMENTS: PasswordRequirements = {
  min_length: 8,
  require_uppercase: true,
  require_lowercase: true,
  require_numbers: true,
  require_special_chars: true
};

export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  session_timeout: 480, // 8 hours
  max_failed_attempts: 5,
  lockout_duration: 30, // 30 minutes
  password_requirements: DEFAULT_PASSWORD_REQUIREMENTS,
  require_email_verification: true,
  allow_google_oauth: true
};

// Email template names
export const EMAIL_TEMPLATE_NAMES = {
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
  WELCOME: 'welcome',
  TWO_FACTOR_ENABLED: 'two_factor_enabled',
  ACCOUNT_LOCKED: 'account_locked',
  LOGIN_ALERT: 'login_alert'
} as const;

// JWT Token interfaces
export interface BaseJWTPayload {
  userId: number;
  email: string;
  iat: number;
  exp: number;
}

export interface JWTPayload extends BaseJWTPayload {
  role: string;
  type: 'access' | 'refresh';
}

export interface EmailVerificationPayload extends BaseJWTPayload {
  type: 'email_verification';
}

export interface PasswordResetPayload extends BaseJWTPayload {
  type: 'password_reset';
}

export type AnyJWTPayload = JWTPayload | EmailVerificationPayload | PasswordResetPayload;

// Default email templates
export const DEFAULT_EMAIL_TEMPLATES: Omit<EmailTemplate, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    name: EMAIL_TEMPLATE_NAMES.EMAIL_VERIFICATION,
    subject: 'Verify your email address - {{app_name}}',
    html_content: `
      <h2>Welcome to {{app_name}}!</h2>
      <p>Hi {{user_name}},</p>
      <p>Please verify your email address by clicking the link below:</p>
      <p><a href="{{verification_link}}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't create an account, please ignore this email.</p>
    `,
    text_content: `Welcome to {{app_name}}!\n\nHi {{user_name}},\n\nPlease verify your email address by visiting: {{verification_link}}\n\nThis link will expire in 24 hours.\n\nIf you didn't create an account, please ignore this email.`,
    variables: ['app_name', 'user_name', 'verification_link']
  },
  {
    name: EMAIL_TEMPLATE_NAMES.PASSWORD_RESET,
    subject: 'Reset your password - {{app_name}}',
    html_content: `
      <h2>Password Reset Request</h2>
      <p>Hi {{user_name}},</p>
      <p>You requested to reset your password. Click the link below to set a new password:</p>
      <p><a href="{{reset_link}}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `,
    text_content: `Password Reset Request\n\nHi {{user_name}},\n\nYou requested to reset your password. Visit this link to set a new password: {{reset_link}}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.`,
    variables: ['app_name', 'user_name', 'reset_link']
  },
  {
    name: EMAIL_TEMPLATE_NAMES.WELCOME,
    subject: 'Welcome to {{app_name}}!',
    html_content: `
      <h2>Welcome to {{app_name}}!</h2>
      <p>Hi {{user_name}},</p>
      <p>Your account has been successfully created and verified.</p>
      <p>You can now start using all the features of {{app_name}}.</p>
      <p><a href="{{login_link}}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Get Started</a></p>
    `,
    text_content: `Welcome to {{app_name}}!\n\nHi {{user_name}},\n\nYour account has been successfully created and verified.\n\nYou can now start using all the features of {{app_name}}.\n\nGet started: {{login_link}}`,
    variables: ['app_name', 'user_name', 'login_link']
  }
];
