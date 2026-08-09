// Template Service - Domain-specific service for template operations
// Handles all template-related business logic and database operations

import { databaseService } from '../core/DatabaseService.js';
import type { SQLParams } from '../types/database.types.js';

/**
 * Template interface
 */
interface Template {
  id: number;
  name: string;
  content: string;
  is_default: boolean;
  variables?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Template creation data interface
 */
interface TemplateData {
  name: string;
  content: string;
  is_default?: boolean;
  variables?: string;
}

/**
 * Template Service
 * Manages invoice design templates (layout/design templates)
 */
export class TemplateService {
  /**
   * Get all templates
   */
  async getAllTemplates(): Promise<Template[]> {
    return databaseService.getMany<Template>(
      'SELECT * FROM invoice_design_templates ORDER BY name ASC'
    );
  }

  /**
   * Get template by ID
   */
  async getTemplateById(id: number): Promise<Template | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid template ID is required');
    }

    return databaseService.getOne<Template>(
      'SELECT * FROM invoice_design_templates WHERE id = ?',
      [id]
    );
  }

  /**
   * Create new template
   */
  async createTemplate(templateData: TemplateData): Promise<number> {
    if (!templateData.name || typeof templateData.name !== 'string') {
      throw new Error('Template name is required');
    }

    if (!templateData.content || typeof templateData.content !== 'string') {
      throw new Error('Template content is required');
    }

    // If this is set as default, make sure no other template is default
    if (templateData.is_default) {
      await databaseService.executeQuery(
        'UPDATE invoice_design_templates SET is_default = 0 WHERE is_default = 1'
      );
    }

    const result = await databaseService.executeQuery(
      'INSERT INTO invoice_design_templates (name, content, is_default, variables, created_at, updated_at) VALUES (?, ?, ?, ?, DATETIME(\'now\'), DATETIME(\'now\'))',
      [
        templateData.name,
        templateData.content,
        templateData.is_default ? 1 : 0,
        templateData.variables || null
      ]
    );

    return result.lastInsertRowid;
  }

  /**
   * Update template
   */
  async updateTemplate(id: number, templateData: Partial<TemplateData>): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid template ID is required');
    }

    if (!templateData || Object.keys(templateData).length === 0) {
      throw new Error('Template data is required');
    }

    // Check if template exists
    const existingTemplate = await this.getTemplateById(id);
    if (!existingTemplate) {
      throw new Error('Template not found');
    }

    // If this is set as default, make sure no other template is default
    if (templateData.is_default) {
      await databaseService.executeQuery(
        'UPDATE invoice_design_templates SET is_default = 0 WHERE is_default = 1 AND id != ?',
        [id]
      );
    }

    const updates: string[] = [];
    const values: SQLParams = [];

    if (templateData.name !== undefined) {
      updates.push('name = ?');
      values.push(templateData.name);
    }

    if (templateData.content !== undefined) {
      updates.push('content = ?');
      values.push(templateData.content);
    }

    if (templateData.is_default !== undefined) {
      updates.push('is_default = ?');
      values.push(templateData.is_default ? 1 : 0);
    }

    if (templateData.variables !== undefined) {
      updates.push('variables = ?');
      values.push(templateData.variables);
    }

    updates.push('updated_at = DATETIME(\'now\')');
    values.push(id);

    const result = await databaseService.executeQuery(
      `UPDATE invoice_design_templates SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return result.changes > 0;
  }

  /**
   * Delete template
   */
  async deleteTemplate(id: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid template ID is required');
    }

    // Check if template is in use by any invoices
    const inUse = await databaseService.getOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM invoices WHERE design_template_id = ?',
      [id]
    );

    if (inUse && inUse.count > 0) {
      throw new Error('Template is currently in use by invoices and cannot be deleted');
    }

    const result = await databaseService.executeQuery(
      'DELETE FROM invoice_design_templates WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }

  /**
   * Get default template
   */
  async getDefaultTemplate(): Promise<Template | null> {
    return databaseService.getOne<Template>(
      'SELECT * FROM invoice_design_templates WHERE is_default = 1 LIMIT 1'
    );
  }

  /**
   * Set default template
   */
  async setDefaultTemplate(id: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid template ID is required');
    }

    // Check if template exists
    const template = await this.getTemplateById(id);
    if (!template) {
      throw new Error('Template not found');
    }

    const operations = async () => {
      // Remove default from all templates
      await databaseService.executeQuery(
        'UPDATE invoice_design_templates SET is_default = 0 WHERE is_default = 1'
      );

      // Set new default
      await databaseService.executeQuery(
        'UPDATE invoice_design_templates SET is_default = 1, updated_at = DATETIME(\'now\') WHERE id = ?',
        [id]
      );
    };

    await databaseService.executeTransaction(operations);
    return true;
  }
}

// Export singleton instance
export const templateService = new TemplateService();