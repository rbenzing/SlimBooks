/**
 * TemplateService tests (invoice DESIGN templates, `/api/templates`).
 *
 * This service and RecurringInvoiceTemplateService share an id space over two
 * different tables, so every statement here is asserted to name
 * `invoice_design_templates` — reading the wrong table returns a real row for
 * the wrong entity, which is worse than an error.
 *
 * The statements are also prepared against a real in-memory SQLite so a
 * malformed one fails here rather than at runtime.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { sqliteDialect } from '../database/dialects/sqlite.dialect.js';
import { createDatabaseMock, flattenSql } from './databaseMock.test-helper.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const { templateService } = await import('./TemplateService.js');

/** A schema matching the live tables, used only to parse generated SQL. */
const sqlite = new Database(':memory:');
sqlite.exec(`
  CREATE TABLE invoice_design_templates (
    id INTEGER PRIMARY KEY, name TEXT, content TEXT, is_default INTEGER,
    variables TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE TABLE invoices (id INTEGER PRIMARY KEY, design_template_id INTEGER);
`);

/** Fails if SQLite cannot parse the statement the service built. */
const expectPreparable = (sql: string) => {
  expect(() => sqlite.prepare(sql)).not.toThrow();
};

beforeEach(() => db.reset());

describe('createTemplate', () => {
  const template = { name: 'Modern Blue', content: '<html></html>' };

  it('builds a statement SQLite can actually run', async () => {
    await templateService.createTemplate(template);

    expectPreparable(db.queries[0].sql);
  });

  it('writes to the design-template table', async () => {
    await templateService.createTemplate(template);

    expect(flattenSql(db.queries[0].sql)).toMatch(/INSERT INTO invoice_design_templates/);
  });

  it('binds one parameter per placeholder', async () => {
    await templateService.createTemplate(template);

    const { sql, params } = db.queries[0];
    const placeholders = (flattenSql(sql).match(/\?/g) ?? []).length;
    expect(params).toHaveLength(placeholders);
  });

  it('creates a non-default template without disturbing the existing default', async () => {
    await templateService.createTemplate(template);

    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].params[2]).toBe(0);
  });

  it('clears the previous default before creating a new default', async () => {
    await templateService.createTemplate({ ...template, is_default: true });

    expect(flattenSql(db.queries[0].sql)).toMatch(/SET is_default = 0 WHERE is_default = 1/);
    expect(db.queries[1].params[2]).toBe(1);
  });

  it('rejects a template with no name or content', async () => {
    await expect(templateService.createTemplate({ name: '', content: 'x' })).rejects.toThrow(/name/i);
    await expect(templateService.createTemplate({ name: 'x', content: '' })).rejects.toThrow(/content/i);
    expect(db.queries).toHaveLength(0);
  });
});

describe('updateTemplate', () => {
  beforeEach(() => db.getOne.mockReturnValue({ id: 1, name: 'Modern Blue' }));

  it('builds a statement SQLite can actually run', async () => {
    await templateService.updateTemplate(1, { name: 'Renamed' });

    expectPreparable(db.queries[0].sql);
  });

  it('sets only the fields that were supplied', async () => {
    await templateService.updateTemplate(1, { name: 'Renamed' });

    const sql = flattenSql(db.queries[0].sql);
    // Built from the dialect rather than pinned to the SQLite spelling: an
    // assertion on the literal text passes whether or not the statement would
    // run on any other backend, which is how ten of these survived a sweep.
    expect(sql).toContain(`SET name = ?, updated_at = ${sqliteDialect.now()} WHERE id = ?`);
    expect(db.queries[0].params).toEqual(['Renamed', 1]);
  });

  it('always stamps updated_at', async () => {
    await templateService.updateTemplate(1, { content: '<p></p>' });

    expect(flattenSql(db.queries[0].sql)).toContain(`updated_at = ${sqliteDialect.now()}`);
  });

  it('converts is_default to the 0/1 SQLite stores', async () => {
    await templateService.updateTemplate(1, { is_default: false });

    expect(db.queries[0].params).toEqual([0, 1]);
  });

  it('demotes the other default when promoting this one', async () => {
    await templateService.updateTemplate(1, { is_default: true });

    expect(flattenSql(db.queries[0].sql)).toMatch(/SET is_default = 0 WHERE is_default = 1 AND id != \?/);
    expect(db.queries[0].params).toEqual([1]);
  });

  it('rejects an update to a template that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(templateService.updateTemplate(1, { name: 'x' })).rejects.toThrow(/not found/i);
  });

  it('rejects an empty payload', async () => {
    await expect(templateService.updateTemplate(1, {})).rejects.toThrow(/data is required/i);
  });

  it('rejects an invalid id', async () => {
    await expect(templateService.updateTemplate(0, { name: 'x' })).rejects.toThrow(/id/i);
  });
});

describe('deleteTemplate', () => {
  it('refuses to delete a template an invoice still points at', async () => {
    // Deleting it would leave invoices rendering against a missing design.
    db.getOne.mockReturnValue({ count: 2 });

    await expect(templateService.deleteTemplate(1)).rejects.toThrow(/in use/i);
    expect(db.queries).toHaveLength(0);
  });

  it('checks usage against design_template_id, not the recurring column', async () => {
    db.getOne.mockReturnValue({ count: 0 });

    await templateService.deleteTemplate(1);

    const usageSql = flattenSql(db.getOne.mock.calls[0][0] as string);
    expect(usageSql).toMatch(/design_template_id/);
    expect(usageSql).not.toMatch(/recurring_template_id/);
  });

  it('deletes an unused template', async () => {
    db.getOne.mockReturnValue({ count: 0 });

    await expect(templateService.deleteTemplate(1)).resolves.toBe(true);
    expect(flattenSql(db.queries[0].sql)).toMatch(/DELETE FROM invoice_design_templates WHERE id = \?/);
  });

  it('reports false when nothing was deleted', async () => {
    db.getOne.mockReturnValue({ count: 0 });
    db.executeQuery.mockReturnValue({ changes: 0, lastInsertRowid: 0 });

    await expect(templateService.deleteTemplate(1)).resolves.toBe(false);
  });

  it('rejects an invalid id', async () => {
    await expect(templateService.deleteTemplate(0)).rejects.toThrow(/id/i);
  });
});

describe('default template', () => {
  it('reads at most one default', async () => {
    db.getOne.mockReturnValue({ id: 1, is_default: 1 });

    await templateService.getDefaultTemplate();

    expect(flattenSql(db.getOne.mock.calls[0][0] as string))
      .toMatch(/WHERE is_default = 1 LIMIT 1/);
  });

  it('demotes and promotes inside one transaction', async () => {
    // Two statements outside a transaction could leave no default at all.
    db.getOne.mockReturnValue({ id: 1 });

    await templateService.setDefaultTemplate(1);

    expect(db.executeTransaction).toHaveBeenCalledTimes(1);
    expect(flattenSql(db.queries[0].sql)).toMatch(/SET is_default = 0/);
    expect(flattenSql(db.queries[1].sql)).toMatch(/SET is_default = 1/);
    expect(db.queries[1].params).toEqual([1]);
  });

  it('refuses to promote a template that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(templateService.setDefaultTemplate(1)).rejects.toThrow(/not found/i);
    expect(db.executeTransaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid id', async () => {
    await expect(templateService.setDefaultTemplate(0)).rejects.toThrow(/id/i);
    await expect(templateService.getTemplateById(0)).rejects.toThrow(/id/i);
  });
});

describe('reads', () => {
  it('lists design templates by name', async () => {
    await templateService.getAllTemplates();

    expect(flattenSql(db.getMany.mock.calls[0][0] as string))
      .toBe('SELECT * FROM invoice_design_templates ORDER BY name ASC');
  });

  it('reads one design template by id', async () => {
    db.getOne.mockReturnValue({ id: 1 });

    await templateService.getTemplateById(1);

    expect(flattenSql(db.getOne.mock.calls[0][0] as string))
      .toMatch(/FROM invoice_design_templates WHERE id = \?/);
    expect(db.getOne.mock.calls[0][1]).toEqual([1]);
  });

  it('never touches the recurring-template table', async () => {
    db.getOne.mockReturnValue({ id: 1 });
    await templateService.getAllTemplates();
    await templateService.getTemplateById(1);
    await templateService.getDefaultTemplate();

    const allSql = [...db.getMany.mock.calls, ...db.getOne.mock.calls]
      .map(call => call[0] as string)
      .join(' ');
    expect(allSql).not.toMatch(/recurring_invoice_templates/);
  });
});
