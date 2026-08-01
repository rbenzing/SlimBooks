// Settings controller for Slimbooks
// Handles application settings and project configuration

import { 
  type Request, 
  type Response 
} from 'express';
import { settingsService } from '../services/SettingsService.js';
import {
  NotFoundError, 
  ValidationError,
  asyncHandler
} from '../middleware/index.js';
import { 
  type IndividualSettingSaveRequest, 
  type ProjectSettingsRequest, 
  type SettingsSaveRequest 
} from '../types/api.types.js';

/**
 * Get all settings or filter by category
 */
export const getAllSettings = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { category } = req.query;
  
  const settings = await settingsService.getAllSettings(category as string);
  res.json({ success: true, settings });
});

/**
 * Get individual setting by key
 */
export const getSettingByKey = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { key } = req.params;
  
  if (!key) {
    throw new ValidationError('Setting key parameter is required');
  }
  
  const value = await settingsService.getSettingByKey(key);
  res.json({ success: true, value });
});

/**
 * Save individual setting
 */
export const saveSetting = asyncHandler(async (req: Request<object, object, IndividualSettingSaveRequest>, res: Response): Promise<void> => {
  const { key, value, category = 'general' } = req.body;
  
  if (!key) {
    throw new ValidationError('Setting key is required');
  }
  
  try {
    await settingsService.saveSetting(key, value, category);
    res.json({ success: true, message: 'Setting saved successfully' });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('key is required')) {
      throw new ValidationError('Setting key is required');
    } else if (errorMessage.includes('category is required')) {
      throw new ValidationError('Setting category is required');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Save multiple settings at once
 */
export const saveMultipleSettings = asyncHandler(async (req: Request<object, object, SettingsSaveRequest>, res: Response): Promise<void> => {
  const { settings } = req.body;

  if (!settings || typeof settings !== 'object') {
    throw new ValidationError('Settings object is required');
  }

  // Validate settings structure
  for (const [key, data] of Object.entries(settings)) {
    if (!data || typeof data !== 'object') {
      throw new ValidationError(`Invalid setting data for key: ${key}`);
    }
    if (data.value === undefined) {
      throw new ValidationError(`Missing value for setting: ${key}`);
    }
  }

  try {
    await settingsService.saveMultipleSettings(settings);
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('Settings object is required')) {
      throw new ValidationError('Settings object is required');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Get project configuration (combines .env defaults with database overrides)
 *
 * The login screen reads this before anyone has signed in, so the route cannot
 * simply require auth. Signed-in callers get the settings-screen view with
 * every credential stripped; everyone else gets only what the login screen
 * needs. Neither view contains a secret.
 */
export const getProjectSettings = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const projectSettings = req.user
    ? await settingsService.getProjectSettings()
    : await settingsService.getPublicProjectSettings();

  res.json({ success: true, settings: projectSettings });
});

/**
 * Update project settings
 */
export const updateProjectSettings = asyncHandler(async (req: Request<object, object, ProjectSettingsRequest>, res: Response): Promise<void> => {
  const { settings } = req.body;

  if (!settings || typeof settings !== 'object') {
    throw new ValidationError('Settings object is required');
  }

  try {
    // Ensure all required properties have default values for exactOptionalPropertyTypes
    const projectSettings = {
      google_oauth: {
        enabled: false,
        client_id: '',
        configured: false,
        ...settings.google_oauth
      },
      stripe: {
        enabled: false,
        publishable_key: '',
        configured: false,
        ...settings.stripe
      },
      // Credentials arrive alongside the rest; blank ones are dropped by the
      // service rather than overwriting what is stored.
      email: {
        enabled: false,
        smtp_host: '',
        smtp_port: 587,
        smtp_user: '',
        smtp_pass: '',
        email_from: '',
        configured: false,
        ...settings.email
      },
      security: {
        require_email_verification: false,
        max_failed_login_attempts: 5,
        account_lockout_duration: 30,
        ...settings.security
      }
    };

    // Validate email verification dependency.
    //
    // `configured` is checked against what the server resolves, not against the
    // flag in the request: the client cannot see the stored SMTP password, so
    // its copy of `configured` is a claim rather than a fact. `configured`
    // itself is derived on read and is not stored.
    if (projectSettings.security.require_email_verification) {
      const current = await settingsService.getProjectSettings();
      const emailConfigured = projectSettings.email.smtp_host && projectSettings.email.smtp_user
        ? current.email.configured || !!projectSettings.email.smtp_pass
        : current.email.configured;

      if (!emailConfigured || !projectSettings.email.enabled) {
        throw new ValidationError('Email must be configured and enabled before enabling email verification');
      }
    }

    await settingsService.updateProjectSettings(projectSettings);
    res.json({ success: true, message: 'Project settings updated successfully' });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('Settings object is required')) {
      throw new ValidationError('Settings object is required');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Get security setting value
 */
export const getSecuritySetting = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { setting_name } = req.params;
  
  if (!setting_name) {
    throw new ValidationError('Setting name parameter is required');
  }
  
  try {
    const value = await settingsService.getSecuritySetting(setting_name);
    res.json({ success: true, value });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('Setting name is required')) {
      throw new ValidationError('Setting name is required');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Delete setting by key
 */
export const deleteSetting = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { key } = req.params;
  
  if (!key) {
    throw new ValidationError('Setting key parameter is required');
  }
  
  try {
    const deleted = await settingsService.deleteSetting(key);
    if (deleted) {
      res.json({ success: true, message: 'Setting deleted successfully' });
    } else {
      throw new NotFoundError('Setting not found');
    }
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('Valid setting key is required')) {
      throw new ValidationError('Valid setting key is required');
    }
    throw error;
  }
});

/**
 * Delete settings by category
 */
export const deleteSettingsByCategory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { category } = req.params;
  
  if (!category) {
    throw new ValidationError('Category parameter is required');
  }
  
  try {
    const deletedCount = await settingsService.deleteSettingsByCategory(category);
    res.json({ 
      success: true, 
      data: { deletedCount },
      message: `${deletedCount} settings deleted successfully` 
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('Valid category is required')) {
      throw new ValidationError('Valid category is required');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Get all categories
 */
export const getCategories = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const categories = await settingsService.getCategories();
  res.json({ success: true, data: categories });
});

/**
 * Check if setting exists
 */
export const checkSettingExists = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { key } = req.params;
  
  if (!key) {
    throw new ValidationError('Setting key parameter is required');
  }
  
  const exists = await settingsService.settingExists(key);
  res.json({ success: true, data: { exists } });
});

/**
 * Get settings count by category
 */
export const getSettingsCount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { category } = req.query;
  
  const count = await settingsService.getSettingsCount(category as string);
  res.json({ success: true, data: { count } });
});

/**
 * Reset settings to defaults
 */
export const resetSettings = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { category } = req.query;
  
  try {
    await settingsService.resetSettings(category as string);
    const message = category 
      ? `Settings for category '${category}' reset successfully`
      : 'All settings reset successfully';
    res.json({ success: true, message });
  } catch (error) {
    throw new ValidationError((error as Error).message);
  }
});