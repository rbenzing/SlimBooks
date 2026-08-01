/**
 * PdfService generation and lifecycle tests.
 *
 * Puppeteer is stubbed: the point is not to render a PDF but to pin the
 * contract around it. A page that is not closed on every path leaks a browser
 * tab per download until the process runs out of them, and a failed load must
 * raise rather than hand the user a blank or truncated file.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));
const { getSettingByKey, updateFormatSettings } = vi.hoisted(() => ({
  getSettingByKey: vi.fn(),
  updateFormatSettings: vi.fn()
}));
const { getOne, exists, tableExists, executeQuery } = vi.hoisted(() => ({
  getOne: vi.fn(),
  exists: vi.fn(),
  tableExists: vi.fn(),
  executeQuery: vi.fn()
}));

vi.mock('puppeteer', () => ({ default: { launch } }));
vi.mock('./SettingsService.js', () => ({
  settingsService: { getSettingByKey, updateFormatSettings }
}));
vi.mock('../core/DatabaseService.js', () => ({
  databaseService: { getOne, exists, tableExists, executeQuery, getMany: vi.fn() }
}));

const { pdfService } = await import('./PdfService.js');

const A_PDF = Buffer.from('%PDF-1.7 rest of the file');

/** A stubbed puppeteer page that reports a successful load and a valid PDF. */
const makePage = (over: Record<string, unknown> = {}) => ({
  setViewport: vi.fn().mockResolvedValue(undefined),
  goto: vi.fn().mockResolvedValue({ ok: () => true, status: () => 200 }),
  waitForSelector: vi.fn().mockResolvedValue(undefined),
  addStyleTag: vi.fn().mockResolvedValue(undefined),
  content: vi.fn().mockResolvedValue('<html></html>'),
  pdf: vi.fn().mockResolvedValue(A_PDF),
  close: vi.fn().mockResolvedValue(undefined),
  ...over
});

const makeBrowser = (page: ReturnType<typeof makePage>) => ({
  newPage: vi.fn().mockResolvedValue(page),
  close: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true)
});

/** Puts the service in an initialised state over the given page. */
const withPage = async (page: ReturnType<typeof makePage>) => {
  const browser = makeBrowser(page);
  launch.mockResolvedValue(browser);
  await pdfService.initialize();
  return browser;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getSettingByKey.mockResolvedValue(null);
});

afterEach(async () => {
  await pdfService.close();
  vi.restoreAllMocks();
});

describe('lifecycle', () => {
  it('launches a browser on first use', async () => {
    await withPage(makePage());

    expect(launch).toHaveBeenCalledTimes(1);
    expect(pdfService.getStatus()).toEqual({ initialized: true, browserConnected: true });
  });

  it('does not relaunch an already-initialised browser', async () => {
    await withPage(makePage());
    await pdfService.initialize();

    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('launches headless with a sandbox-safe argument set', async () => {
    await withPage(makePage());

    const [config] = launch.mock.calls[0];
    expect(config.headless).toBe(true);
    expect(config.args).toContain('--no-sandbox');
  });

  it('surfaces a launch failure rather than reporting itself ready', async () => {
    launch.mockRejectedValue(new Error('chrome not found'));

    await expect(pdfService.initialize()).rejects.toThrow(/chrome not found/);
    expect(pdfService.getStatus().initialized).toBe(false);
  });

  it('reports a disconnected browser', async () => {
    const browser = await withPage(makePage());
    browser.isConnected.mockReturnValue(false);

    expect(pdfService.getStatus()).toEqual({ initialized: true, browserConnected: false });
  });

  it('closing releases the browser and resets the status', async () => {
    const browser = await withPage(makePage());

    await pdfService.close();

    expect(browser.close).toHaveBeenCalled();
    expect(pdfService.getStatus()).toEqual({ initialized: false, browserConnected: false });
  });

  it('closing twice is harmless', async () => {
    const browser = await withPage(makePage());

    await pdfService.close();
    await pdfService.close();

    expect(browser.close).toHaveBeenCalledTimes(1);
  });
});

describe('generateInvoicePDF', () => {
  it('initialises on demand', async () => {
    const page = makePage();
    launch.mockResolvedValue(makeBrowser(page));

    await pdfService.generateInvoicePDF(7, 'tok');

    expect(launch).toHaveBeenCalled();
  });

  it('returns the rendered document', async () => {
    const page = makePage();
    await withPage(page);

    await expect(pdfService.generateInvoicePDF(7, 'tok')).resolves.toEqual(A_PDF);
  });

  it('renders the public invoice URL carrying the access token', async () => {
    const page = makePage();
    await withPage(page);

    await pdfService.generateInvoicePDF(7, 'tok-123');

    const [url] = page.goto.mock.calls[0];
    expect(url).toMatch(/\/invoice\/7\?token=tok-123$/);
  });

  it('waits for the invoice body before printing', async () => {
    // Printing early yields a blank page that still looks like a valid PDF.
    const page = makePage();
    await withPage(page);

    await pdfService.generateInvoicePDF(7, 'tok');

    expect(page.waitForSelector).toHaveBeenCalledWith('.bg-card', expect.anything());
    expect(page.waitForSelector.mock.invocationCallOrder[0])
      .toBeLessThan(page.pdf.mock.invocationCallOrder[0]);
  });

  it('closes the page after a successful render', async () => {
    const page = makePage();
    await withPage(page);

    await pdfService.generateInvoicePDF(7, 'tok');

    expect(page.close).toHaveBeenCalledTimes(1);
  });

  it('closes the page when the render fails', async () => {
    // A leaked page per failed download exhausts the browser.
    const page = makePage({ pdf: vi.fn().mockRejectedValue(new Error('render crashed')) });
    await withPage(page);

    await expect(pdfService.generateInvoicePDF(7, 'tok')).rejects.toThrow(/render crashed/);
    expect(page.close).toHaveBeenCalledTimes(1);
  });

  it('raises when the invoice page does not load', async () => {
    const page = makePage({
      goto: vi.fn().mockResolvedValue({ ok: () => false, status: () => 404 })
    });
    await withPage(page);

    await expect(pdfService.generateInvoicePDF(7, 'tok')).rejects.toThrow(/HTTP 404/);
    expect(page.pdf).not.toHaveBeenCalled();
    expect(page.close).toHaveBeenCalled();
  });

  it('raises when the invoice content never appears', async () => {
    const page = makePage({
      waitForSelector: vi.fn().mockRejectedValue(new Error('timeout'))
    });
    await withPage(page);

    await expect(pdfService.generateInvoicePDF(7, 'tok')).rejects.toThrow(/content not found/i);
    expect(page.pdf).not.toHaveBeenCalled();
  });

  it('rejects an empty document instead of returning a zero-byte file', async () => {
    const page = makePage({ pdf: vi.fn().mockResolvedValue(Buffer.alloc(0)) });
    await withPage(page);

    await expect(pdfService.generateInvoicePDF(7, 'tok')).rejects.toThrow(/empty/i);
  });

  it('rejects a document that is not actually a PDF', async () => {
    // Puppeteer returns HTML on some failures; that must not reach the user
    // named invoice.pdf.
    const page = makePage({ pdf: vi.fn().mockResolvedValue(Buffer.from('<!DOCTYPE html>')) });
    await withPage(page);

    await expect(pdfService.generateInvoicePDF(7, 'tok')).rejects.toThrow(/not a valid PDF/i);
  });

  it('applies the stored paper format', async () => {
    getSettingByKey.mockImplementation(async (key: string) =>
      key === 'pdf_format' ? { format: 'Letter' } : null
    );
    const page = makePage();
    await withPage(page);

    await pdfService.generateInvoicePDF(7, 'tok');

    expect(page.pdf.mock.calls[0][0]).toMatchObject({ format: 'Letter' });
  });

  it('lets an explicit option override the stored setting', async () => {
    getSettingByKey.mockImplementation(async (key: string) =>
      key === 'pdf_format' ? { format: 'Letter' } : null
    );
    const page = makePage();
    await withPage(page);

    await pdfService.generateInvoicePDF(7, 'tok', { format: 'A3' });

    expect(page.pdf.mock.calls[0][0]).toMatchObject({ format: 'A3' });
  });
});

describe('generatePagePDF', () => {
  it('renders the requested URL', async () => {
    const page = makePage();
    await withPage(page);

    await expect(pdfService.generatePagePDF('http://localhost:8080/reports')).resolves.toEqual(A_PDF);
    expect(page.goto.mock.calls[0][0]).toBe('http://localhost:8080/reports');
  });

  it('defaults to A4 with printed backgrounds', async () => {
    const page = makePage();
    await withPage(page);

    await pdfService.generatePagePDF('http://localhost:8080/reports');

    expect(page.pdf.mock.calls[0][0]).toMatchObject({ format: 'A4', printBackground: true });
  });

  it('honours caller options', async () => {
    const page = makePage();
    await withPage(page);

    await pdfService.generatePagePDF('http://localhost:8080/reports', { landscape: true });

    expect(page.pdf.mock.calls[0][0]).toMatchObject({ landscape: true });
  });

  it('closes the page even when the render fails', async () => {
    const page = makePage({ goto: vi.fn().mockRejectedValue(new Error('unreachable')) });
    await withPage(page);

    await expect(pdfService.generatePagePDF('http://x')).rejects.toThrow(/unreachable/);
    expect(page.close).toHaveBeenCalledTimes(1);
  });
});

describe('invoice lookups', () => {
  it('joins the client so the PDF can address it', async () => {
    getOne.mockReturnValue({ id: 7 });

    await pdfService.getInvoiceForPDF(7);

    expect(getOne.mock.calls[0][0]).toMatch(/LEFT JOIN clients/);
    expect(getOne.mock.calls[0][1]).toEqual([7]);
  });

  it('returns the invoice when access is validated', async () => {
    getOne.mockReturnValue({ id: 7, invoice_number: 'INV-007' });

    await expect(pdfService.validateInvoiceAccess(7)).resolves.toMatchObject({ id: 7 });
  });

  it('refuses to render an invoice that does not exist', async () => {
    getOne.mockReturnValue(undefined);

    await expect(pdfService.validateInvoiceAccess(7)).rejects.toThrow(/not found/i);
  });

  it('reads basic info without joining the client', async () => {
    getOne.mockReturnValue({ id: 7 });

    await pdfService.getInvoiceBasicInfo(7);

    expect(getOne.mock.calls[0][0]).not.toMatch(/JOIN/);
  });

  it('rejects an invalid id', async () => {
    await expect(pdfService.getInvoiceForPDF(0)).rejects.toThrow(/id/i);
    await expect(pdfService.validateInvoiceAccess(0)).rejects.toThrow(/id/i);
    await expect(pdfService.getInvoiceBasicInfo(0)).rejects.toThrow(/id/i);
  });

  it('answers false for an invalid id rather than querying', async () => {
    await expect(pdfService.invoiceExists(0)).resolves.toBe(false);
    expect(exists).not.toHaveBeenCalled();
  });
});

describe('logPDFActivity', () => {
  it('writes a log row when the table is present', async () => {
    tableExists.mockReturnValue(true);

    await expect(pdfService.logPDFActivity(7, 'download', { size: 1024 })).resolves.toBe(true);

    const [, params] = executeQuery.mock.calls[0];
    expect(params[0]).toBe(7);
    expect(params[1]).toBe('download');
    expect(params[2]).toBe('{"size":1024}');
  });

  it('skips logging when the table is absent', async () => {
    tableExists.mockReturnValue(false);

    await expect(pdfService.logPDFActivity(7, 'download')).resolves.toBe(true);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('never lets a logging failure fail the download', async () => {
    tableExists.mockReturnValue(true);
    executeQuery.mockImplementation(() => { throw new Error('log table locked'); });

    await expect(pdfService.logPDFActivity(7, 'download')).resolves.toBe(false);
  });
});

describe('updatePDFFormat', () => {
  it('stores a supported format', async () => {
    await pdfService.updatePDFFormat('Letter');

    expect(updateFormatSettings).toHaveBeenCalledWith({ pdf_format: { format: 'Letter' } });
  });

  it('accepts every supported paper size', async () => {
    for (const format of ['A4', 'Letter', 'Legal', 'A3', 'A5']) {
      await expect(pdfService.updatePDFFormat(format)).resolves.toBeUndefined();
    }
  });

  it('refuses an unsupported format rather than storing an unusable one', async () => {
    await expect(pdfService.updatePDFFormat('Tabloid')).rejects.toThrow(/invalid pdf format/i);
    expect(updateFormatSettings).not.toHaveBeenCalled();
  });
});
