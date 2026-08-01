/**
 * PDF service (client) tests.
 *
 * This is the download path the user actually clicks. Two failures matter:
 * handing the browser something that is not a PDF but is named `.pdf` (the
 * server returns JSON or HTML on several error paths), and leaking the object
 * URL that the download link is built from.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn(() => 'test-token') }));

vi.mock('@/lib/env-config', () => ({ envConfig: { API_URL: 'http://api.test' } }));
vi.mock('@/utils/api', () => ({ getToken }));

import { pdfService } from '@/services/pdf.svc';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

/** A response carrying a real PDF body. */
const pdfResponse = (bytes = 'a-pdf') => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: { get: (name: string) => (name === 'content-type' ? 'application/pdf' : null) },
  blob: async () => new Blob([bytes], { type: 'application/pdf' }),
  json: async () => ({})
}) as unknown as Response;

const errorResponse = (body: unknown, status = 500, statusText = 'Internal Server Error') => ({
  ok: false,
  status,
  statusText,
  headers: { get: () => 'application/json' },
  json: async () => body,
  blob: async () => new Blob([])
}) as unknown as Response;

const lastCall = () => fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined];
const headersOf = () => ((lastCall()[1]?.headers ?? {}) as Record<string, string>);

beforeEach(() => {
  vi.clearAllMocks();
  getToken.mockReturnValue('test-token');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchMock.mockResolvedValue(pdfResponse());
});

afterEach(() => vi.restoreAllMocks());

describe('generateInvoicePDF', () => {
  it('requests the authenticated download route', async () => {
    await pdfService.generateInvoicePDF(7);

    expect(lastCall()[0]).toBe('http://api.test/api/pdf/invoice/7/download');
    expect(headersOf()).toMatchObject({ Authorization: 'Bearer test-token' });
  });

  it('returns the document', async () => {
    const blob = await pdfService.generateInvoicePDF(7);

    expect(blob.size).toBeGreaterThan(0);
  });

  it('refuses a response that is not a PDF', async () => {
    // The server answers with JSON on several failures; naming that invoice.pdf
    // gives the user a file no reader will open.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      blob: async () => new Blob(['{"error":"nope"}']),
      json: async () => ({})
    } as unknown as Response);

    await expect(pdfService.generateInvoicePDF(7)).rejects.toThrow(/did not return a PDF/i);
  });

  it('refuses an empty document', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/pdf' },
      blob: async () => new Blob([]),
      json: async () => ({})
    } as unknown as Response);

    await expect(pdfService.generateInvoicePDF(7)).rejects.toThrow(/empty PDF/i);
  });

  it('surfaces the server explanation for a failure', async () => {
    fetchMock.mockResolvedValue(errorResponse({ message: 'Invoice not found' }, 404, 'Not Found'));

    await expect(pdfService.generateInvoicePDF(7)).rejects.toThrow('Invoice not found');
  });

  it('accepts the error field when there is no message', async () => {
    fetchMock.mockResolvedValue(errorResponse({ error: 'Browser unavailable' }));

    await expect(pdfService.generateInvoicePDF(7)).rejects.toThrow('Browser unavailable');
  });

  it('falls back to the status when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      headers: { get: () => 'text/html' },
      json: async () => { throw new Error('not json'); }
    } as unknown as Response);

    await expect(pdfService.generateInvoicePDF(7)).rejects.toThrow(/HTTP 502/);
  });
});

describe('generatePublicInvoicePDF', () => {
  it('passes the share token in the query string and sends no credentials', async () => {
    // The public route is reached by people who are not signed in.
    await pdfService.generatePublicInvoicePDF(7, 'share-token');

    expect(lastCall()[0]).toBe('http://api.test/api/pdf/invoice/7?token=share-token');
    expect(headersOf()).not.toHaveProperty('Authorization');
  });

  it('refuses a response that is not a PDF', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      blob: async () => new Blob(['<html>']),
      json: async () => ({})
    } as unknown as Response);

    await expect(pdfService.generatePublicInvoicePDF(7, 'tok'))
      .rejects.toThrow(/did not return a PDF/i);
  });

  it('refuses an empty document', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/pdf' },
      blob: async () => new Blob([]),
      json: async () => ({})
    } as unknown as Response);

    await expect(pdfService.generatePublicInvoicePDF(7, 'tok')).rejects.toThrow(/empty PDF/i);
  });

  it('surfaces an expired share link', async () => {
    fetchMock.mockResolvedValue(
      errorResponse({ message: 'Invalid or expired invoice link' }, 401, 'Unauthorized')
    );

    await expect(pdfService.generatePublicInvoicePDF(7, 'stale'))
      .rejects.toThrow(/invalid or expired/i);
  });
});

describe('generatePagePDF', () => {
  it('posts the target url and filename', async () => {
    await pdfService.generatePagePDF('http://app.test/reports/pl', 'Profit-Loss.pdf');

    const [url, init] = lastCall();
    expect(url).toBe('http://api.test/api/pdf/page');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string))
      .toMatchObject({ url: 'http://app.test/reports/pl', filename: 'Profit-Loss.pdf' });
  });

  it('authorises the request', async () => {
    await pdfService.generatePagePDF('http://app.test/reports/pl');

    expect(headersOf()).toMatchObject({ Authorization: 'Bearer test-token' });
  });

  it('surfaces the server explanation for a failure', async () => {
    fetchMock.mockResolvedValue(errorResponse({ message: 'Render timed out' }));

    await expect(pdfService.generatePagePDF('http://app.test/reports/pl'))
      .rejects.toThrow('Render timed out');
  });

  it('raises a usable message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => { throw new Error('not json'); }
    } as unknown as Response);

    await expect(pdfService.generatePagePDF('http://app.test/x'))
      .rejects.toThrow(/failed to generate pdf/i);
  });
});

describe('downloadPDF', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
  });

  it('triggers a download with the given filename', () => {
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this); });

    pdfService.downloadPDF(new Blob(['pdf']), 'Invoice-INV-001.pdf');

    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('Invoice-INV-001.pdf');
    expect(clicked[0].href).toContain('blob:mock-url');
  });

  it('releases the object URL and removes the link', () => {
    // Leaving either behind leaks memory on every download.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    pdfService.downloadPDF(new Blob(['pdf']), 'x.pdf');

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });
});

describe('downloadInvoicePDF', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn()
    }));
  });

  it('names the file after the invoice number', async () => {
    const download = vi.spyOn(pdfService, 'downloadPDF').mockImplementation(() => {});

    await pdfService.downloadInvoicePDF(7, 'INV-007');

    expect(download.mock.calls[0][1]).toBe('Invoice-INV-007.pdf');
  });

  it('falls back to the id when there is no invoice number', async () => {
    const download = vi.spyOn(pdfService, 'downloadPDF').mockImplementation(() => {});

    await pdfService.downloadInvoicePDF(7);

    expect(download.mock.calls[0][1]).toBe('Invoice-7.pdf');
  });

  it('does not offer a download when generation failed', async () => {
    // Saving a failed response would produce a corrupt file named invoice.pdf.
    const download = vi.spyOn(pdfService, 'downloadPDF').mockImplementation(() => {});
    fetchMock.mockResolvedValue(errorResponse({ message: 'Invoice not found' }, 404));

    await expect(pdfService.downloadInvoicePDF(7)).rejects.toThrow();
    expect(download).not.toHaveBeenCalled();
  });
});

describe('downloadPublicInvoicePDF', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn()
    }));
  });

  it('uses the token it was given without minting another', async () => {
    vi.spyOn(pdfService, 'downloadPDF').mockImplementation(() => {});
    const mint = vi.spyOn(pdfService, 'generatePublicInvoiceToken');

    await pdfService.downloadPublicInvoicePDF(7, 'given-token', 'INV-007');

    expect(mint).not.toHaveBeenCalled();
    expect(lastCall()[0]).toContain('token=given-token');
  });

  it('mints a token when none is supplied', async () => {
    vi.spyOn(pdfService, 'downloadPDF').mockImplementation(() => {});
    vi.spyOn(pdfService, 'generatePublicInvoiceToken').mockResolvedValue('minted-token');

    await pdfService.downloadPublicInvoicePDF(7, undefined, 'INV-007');

    expect(lastCall()[0]).toContain('token=minted-token');
  });

  it('does not offer a download when the token cannot be minted', async () => {
    const download = vi.spyOn(pdfService, 'downloadPDF').mockImplementation(() => {});
    vi.spyOn(pdfService, 'generatePublicInvoiceToken').mockRejectedValue(new Error('forbidden'));

    await expect(pdfService.downloadPublicInvoicePDF(7)).rejects.toThrow('forbidden');
    expect(download).not.toHaveBeenCalled();
  });
});

describe('downloadReportPDF', () => {
  it('names the file after the report', async () => {
    const download = vi.spyOn(pdfService, 'downloadPDF').mockImplementation(() => {});

    await pdfService.downloadReportPDF('http://app.test/reports/pl', 'Profit-and-Loss');

    expect(download.mock.calls[0][1]).toBe('Profit-and-Loss.pdf');
  });

  it('does not offer a download when rendering failed', async () => {
    const download = vi.spyOn(pdfService, 'downloadPDF').mockImplementation(() => {});
    fetchMock.mockResolvedValue(errorResponse({ message: 'Render timed out' }));

    await expect(pdfService.downloadReportPDF('http://app.test/x', 'R')).rejects.toThrow();
    expect(download).not.toHaveBeenCalled();
  });
});

describe('generatePublicInvoiceToken', () => {
  it('asks the invoice route, not the pdf route', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ data: { token: 'minted' } })
    } as unknown as Response);

    await expect(pdfService.generatePublicInvoiceToken(7)).resolves.toBe('minted');
    expect(lastCall()[0]).toBe('http://api.test/api/invoices/7/public-token');
    expect(lastCall()[1]?.method).toBe('POST');
  });

  it('raises when the server refuses to mint a token', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) } as unknown as Response);

    await expect(pdfService.generatePublicInvoiceToken(7)).rejects.toThrow(/failed to generate public token/i);
  });
});

describe('getServiceStatus', () => {
  it('reports the status the server gives', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ status: 'ready' })
    } as unknown as Response);

    await expect(pdfService.getServiceStatus()).resolves.toMatchObject({ status: 'ready' });
    expect(lastCall()[0]).toBe('http://api.test/api/pdf/status');
  });

  it('raises when the status endpoint fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } as unknown as Response);

    await expect(pdfService.getServiceStatus()).rejects.toThrow(/failed to get pdf service status/i);
  });
});
