// Settings routes for Slimbooks
// Handles application settings and project configuration endpoints

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, resolve, extname } from 'path';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import {
  getAllSettings,
  getSettingByKey,
  saveSetting,
  saveMultipleSettings
} from '../controllers/settingsController.js';
import { requireAuth, requireAdmin } from '../middleware/index.js';

const router: Router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure multer for image uploads
const imageStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = resolve(__dirname, '../../public/uploads/logos');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `logo-${randomUUID()}${extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const uploadImage = multer({
  storage: imageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for images
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  }
});

// Public settings (no auth required)

// Get currency format settings (public for UI formatting)
router.get('/currency', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { settingsService } = await import('../services/SettingsService.js');
    const result = await settingsService.getSettingByKey('general.currency_format_settings');

    if (result) {
      res.json({ success: true, value: result });
    } else {
      // Return default currency format settings
      res.json({
        success: true,
        value: {
          currency: 'USD',
          symbol: '$',
          position: 'before',
          decimal_places: 2,
          thousands_separator: ',',
          decimal_separator: '.'
        }
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Get company settings (public for UI display and invoice generation)
router.get('/company', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { settingsService } = await import('../services/SettingsService.js');
    const result = await settingsService.getSettingByKey('company.company_settings');

    if (result) {
      res.json({ success: true, value: result });
    } else {
      // Return default company settings
      res.json({
        success: true,
        value: {
          companyName: '',
          ownerName: '',
          address: '',
          city: '',
          state: '',
          zipCode: '',
          email: '',
          phone: '',
          brandingImage: ''
        }
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Upload company logo (requires auth but not admin)
router.post('/company/logo', requireAuth, uploadImage.single('logo'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    const { settingsService } = await import('../services/SettingsService.js');
    const logoPath = `/uploads/logos/${req.file.filename}`;

    // Get existing company settings
    const existingSettings = (await settingsService.getSettingByKey('company.company_settings') as Record<string, string>) || {
      companyName: '',
      ownerName: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      email: '',
      phone: '',
      brandingImage: ''
    };

    // Delete old logo file if it exists
    if (existingSettings.brandingImage && existingSettings.brandingImage.startsWith('/uploads/logos/')) {
      const oldFilename = existingSettings.brandingImage.split('/').pop();
      if (oldFilename && oldFilename.startsWith('logo-')) {
        const oldFilePath = resolve(__dirname, '../../public/uploads/logos', oldFilename);
        try {
          await fs.unlink(oldFilePath);
        } catch (deleteError) {
          console.warn('Could not delete old logo file:', deleteError);
        }
      }
    }

    // Update company settings with new logo path
    const updatedSettings = {
      ...existingSettings,
      brandingImage: logoPath
    };

    await settingsService.saveSetting('company_settings', updatedSettings, 'company');

    res.json({
      success: true,
      logoPath,
      settings: updatedSettings,
      message: 'Logo uploaded and company settings updated successfully'
    });
  } catch (error) {
    console.error('Logo upload error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Delete company logo (requires auth but not admin)
router.delete('/company/logo', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { settingsService } = await import('../services/SettingsService.js');

    // Get existing company settings
    const existingSettings = (await settingsService.getSettingByKey('company.company_settings') as Record<string, string>) || {
      companyName: '',
      ownerName: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      email: '',
      phone: '',
      brandingImage: ''
    };

    // Delete logo file if it exists
    if (existingSettings.brandingImage && existingSettings.brandingImage.startsWith('/uploads/logos/')) {
      const filename = existingSettings.brandingImage.split('/').pop();
      if (filename && filename.startsWith('logo-')) {
        const filePath = resolve(__dirname, '../../public/uploads/logos', filename);
        try {
          await fs.unlink(filePath);
        } catch (deleteError) {
          console.warn('Could not delete logo file:', deleteError);
          // Don't fail if file doesn't exist
        }
      }
    }

    // Update company settings to remove logo path
    const updatedSettings = {
      ...existingSettings,
      brandingImage: ''
    };

    await settingsService.saveSetting('company_settings', updatedSettings, 'company');

    res.json({
      success: true,
      settings: updatedSettings,
      message: 'Logo deleted and company settings updated successfully'
    });
  } catch (error) {
    console.error('Logo delete error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Save company settings (requires auth but not admin)
router.post('/company', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { settingsService } = await import('../services/SettingsService.js');
    const { companyName, ownerName, address, city, state, zipCode, email, phone, brandingImage } = req.body;
    
    // Validate required fields
    if (!companyName || typeof companyName !== 'string') {
      res.status(400).json({ success: false, error: 'Company name is required' });
      return;
    }
    
    // Build company settings object
    const companySettings = {
      companyName: companyName.trim(),
      ownerName: ownerName || '',
      address: address || '',
      city: city || '',
      state: state || '',
      zipCode: zipCode || '',
      email: email || '',
      phone: phone || '',
      brandingImage: brandingImage || ''
    };
    
    await settingsService.saveSetting('company_settings', companySettings, 'company');
    res.json({ success: true, message: 'Company settings saved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Get appearance settings (category-based)
router.get('/appearance', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    req.query.category = 'appearance';
    await getAllSettings(req, res, () => {});
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Save appearance settings (user-level, no admin required)
router.put('/appearance', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ success: false, error: 'Settings object is required' });
      return;
    }
    
    // Only allow appearance-related settings to be saved through this endpoint
    const allowedSettings = ['theme', 'invoice_template_preference', 'pdf_format_preference'];
    const filteredSettings: Record<string, Record<string, unknown>> = {};
    
    for (const [key, value] of Object.entries(settings)) {
      if (allowedSettings.includes(key)) {
        filteredSettings[key] = { ...(value as Record<string, unknown>), category: 'appearance' };
      }
    }
    
    if (Object.keys(filteredSettings).length === 0) {
      res.status(400).json({ success: false, error: 'No valid appearance settings provided' });
      return;
    }
    
    await saveMultipleSettings({ body: { settings: filteredSettings } } as Request, res, () => {});
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Get general settings (category-based)  
router.get('/general', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    req.query.category = 'general';
    await getAllSettings(req, res, () => {});
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Get notification settings (specific key)
router.get('/notification', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { settingsService } = await import('../services/SettingsService.js');
    const result = await settingsService.getSettingByKey('general.notification_settings');

    if (result) {
      res.json({ success: true, settings: { notification_settings: result } });
    } else {
      // Return default notification settings
      res.json({
        success: true,
        settings: {
          notification_settings: {
            showToastNotifications: true,
            showSuccessToasts: true,
            showErrorToasts: true,
            showWarningToasts: true,
            showInfoToasts: true,
            toastDuration: 4000,
            toastPosition: 'bottom-right'
          }
        }
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Settings operations (require auth)

// Get all settings or filter by category
router.get('/', requireAuth, getAllSettings);

// Get individual setting by key
router.get('/:key', requireAuth, getSettingByKey);

// Save individual setting
router.post('/', requireAuth, requireAdmin, saveSetting);

// Save multiple settings at once
router.put('/', requireAuth, requireAdmin, saveMultipleSettings);

// Note: Project settings are handled in separate routes at /api/project-settings

export default router;