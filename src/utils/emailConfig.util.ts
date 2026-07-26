// Email configuration utilities

import { sqliteService } from '@/services/sqlite.svc';
import { type EmailSettings, type EmailConfigStatus } from '@/types';

/**
 * Checks if email settings are properly configured and enabled
 */
export const checkEmailConfiguration = async (): Promise<EmailConfigStatus> => {
  try {
    // Initialize SQLite service if needed
    if (!sqliteService.isReady()) {
      await sqliteService.initialize();
    }

    // Get email settings from database
    const emailSettings = await sqliteService.getSetting('email_settings') as EmailSettings;
    
    if (!emailSettings) {
      return {
        isConfigured: false,
        isEnabled: false,
        missingFields: ['All email settings'],
        canSendEmails: false
      };
    }

    // Check if email is enabled
    if (!emailSettings.isEnabled) {
      return {
        isConfigured: true,
        isEnabled: false,
        missingFields: [],
        canSendEmails: false
      };
    }

    // Check required fields
    const requiredFields = [
      { field: 'smtpHost', name: 'SMTP Host' },
      { field: 'smtpPort', name: 'SMTP Port' },
      { field: 'smtpUsername', name: 'SMTP Username' },
      { field: 'smtpPassword', name: 'SMTP Password' },
      { field: 'fromEmail', name: 'From Email' }
    ];

    const missingFields: string[] = [];

    for (const { field, name } of requiredFields) {
      const value = emailSettings[field];
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        missingFields.push(name);
      }
    }

    // Additional validation for email format
    if (emailSettings.fromEmail && !isValidEmail(emailSettings.fromEmail)) {
      missingFields.push('Valid From Email');
    }

    if (emailSettings.smtpUsername && !isValidEmail(emailSettings.smtpUsername)) {
      missingFields.push('Valid SMTP Username');
    }

    const isConfigured = missingFields.length === 0;

    return {
      isConfigured,
      isEnabled: emailSettings.isEnabled,
      missingFields,
      canSendEmails: isConfigured && emailSettings.isEnabled
    };

  } catch (error) {
    console.error('Error checking email configuration:', error);
    return {
      isConfigured: false,
      isEnabled: false,
      missingFields: ['Configuration check failed'],
      canSendEmails: false
    };
  }
};

/**
 * Simple email validation
 */
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Checks if environment variables for email are set (fallback check)
 */
export const checkEnvironmentEmailConfig = (): EmailConfigStatus => {
  const envVars = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    EMAIL_FROM: process.env.EMAIL_FROM
  };

  const missingFields: string[] = [];

  Object.entries(envVars).forEach(([key, value]) => {
    if (!value || value.trim() === '') {
      missingFields.push(key);
    }
  });

  const isConfigured = missingFields.length === 0;

  return {
    isConfigured,
    isEnabled: isConfigured, // Assume enabled if configured via env
    missingFields,
    canSendEmails: isConfigured
  };
};

/**
 * Comprehensive email configuration check (database first, then environment)
 */
export const getEmailConfigurationStatus = async (): Promise<EmailConfigStatus> => {
  // First check database settings
  const dbConfig = await checkEmailConfiguration();
  
  // If database config is complete, use it
  if (dbConfig.canSendEmails) {
    return dbConfig;
  }

  // Otherwise, check environment variables as fallback
  const envConfig = checkEnvironmentEmailConfig();
  
  // Return the better of the two configurations
  if (envConfig.canSendEmails) {
    return envConfig;
  }

  // Return database config (which includes proper error details)
  return dbConfig;
};
