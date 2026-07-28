/**
 * PdfService settings-retrieval tests.
 *
 * `settingsService.getSettingByKey()` JSON-parses the stored value and returns
 * the result. PdfService treated that result as a raw row and read `.value` off
 * it, then parsed a second time — so the guard was always false and every
 * method silently fell through to its default. A saved PDF format or company
 * branding was discarded.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSettingByKey } = vi.hoisted(() => ({ getSettingByKey: vi.fn() }));

vi.mock('./SettingsService.js', () => ({
  settingsService: { getSettingByKey }
}));

vi.mock('../core/DatabaseService.js', () => ({
  databaseService: { getOne: vi.fn(), getMany: vi.fn(), executeQuery: vi.fn() }
}));

// PdfService imports puppeteer at module scope; it is never launched here.
vi.mock('puppeteer', () => ({ default: { launch: vi.fn() } }));

import { pdfService } from './PdfService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPDFFormat', () => {
  it('honours a stored PDF format', async () => {
    // What getSettingByKey actually returns: already parsed.
    getSettingByKey.mockResolvedValue({ format: 'Letter' });

    await expect(pdfService.getPDFFormat()).resolves.toBe('Letter');
  });

  it('falls back to A4 when nothing is stored', async () => {
    getSettingByKey.mockResolvedValue(null);

    await expect(pdfService.getPDFFormat()).resolves.toBe('A4');
  });

  it('falls back to A4 when the stored object has no format', async () => {
    getSettingByKey.mockResolvedValue({});

    await expect(pdfService.getPDFFormat()).resolves.toBe('A4');
  });

  it('accepts a bare string setting', async () => {
    getSettingByKey.mockResolvedValue('Legal');

    await expect(pdfService.getPDFFormat()).resolves.toBe('Legal');
  });
});

describe('getPDFOptionsFromSettings', () => {
  it('uses the stored format in the generated options', async () => {
    getSettingByKey.mockImplementation(async (key: string) =>
      key === 'pdf_format' ? { format: 'Letter' } : null
    );

    const options = await pdfService.getPDFOptionsFromSettings();

    expect(options.format).toBe('Letter');
    expect(options.printBackground).toBe(true);
    expect(options.margin).toMatchObject({ top: expect.any(String) });
  });

  it('defaults to A4 when no format is stored', async () => {
    getSettingByKey.mockResolvedValue(null);

    const options = await pdfService.getPDFOptionsFromSettings();

    expect(options.format).toBe('A4');
  });
});

describe('getCompanySettingsForPDF', () => {
  it('returns the stored company settings object', async () => {
    getSettingByKey.mockResolvedValue({ companyName: 'Acme Corporation', city: 'Business City' });

    await expect(pdfService.getCompanySettingsForPDF()).resolves.toEqual({
      companyName: 'Acme Corporation',
      city: 'Business City'
    });
  });

  it('returns null when nothing is stored', async () => {
    getSettingByKey.mockResolvedValue(null);

    await expect(pdfService.getCompanySettingsForPDF()).resolves.toBeNull();
  });
});
