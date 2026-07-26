/**
 * Invoice-number settings persistence tests.
 *
 * `getInvoiceNumberSettings` read the settings service off a `window.sqliteService`
 * global that nothing ever assigns, so it always fell through to the defaults —
 * a prefix saved in Settings silently reverted on the next load, even though
 * `saveInvoiceNumberSettings` (in the same file) wrote it correctly through the
 * imported service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSetting, setSetting, isReady } = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  isReady: vi.fn(() => true)
}));

vi.mock('@/services/sqlite.svc', () => ({
  sqliteService: { getSetting, setSetting, isReady }
}));

import {
  getInvoiceNumberSettings,
  saveInvoiceNumberSettings
} from '@/utils/business/numbering.util';
import { DEFAULT_INVOICE_NUMBER_SETTINGS } from '@/types';

describe('getInvoiceNumberSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isReady.mockReturnValue(true);
    // Prove the function does not depend on a global that is never assigned.
    delete (window as unknown as { sqliteService?: unknown }).sqliteService;
  });

  it('returns the saved prefix from the settings service', async () => {
    getSetting.mockResolvedValue({ prefix: 'ACME-' });

    await expect(getInvoiceNumberSettings()).resolves.toEqual({ prefix: 'ACME-' });
    expect(getSetting).toHaveBeenCalledWith('invoice_number_settings');
  });

  it('falls back to the default prefix when nothing is stored', async () => {
    getSetting.mockResolvedValue(null);

    await expect(getInvoiceNumberSettings()).resolves.toEqual(DEFAULT_INVOICE_NUMBER_SETTINGS);
  });

  it('falls back to the default prefix when the stored record has none', async () => {
    getSetting.mockResolvedValue({});

    await expect(getInvoiceNumberSettings()).resolves.toEqual(DEFAULT_INVOICE_NUMBER_SETTINGS);
  });

  it('returns the default when the settings service is unavailable', async () => {
    isReady.mockReturnValue(false);

    await expect(getInvoiceNumberSettings()).resolves.toEqual(DEFAULT_INVOICE_NUMBER_SETTINGS);
  });

  it('returns the default rather than throwing when the lookup fails', async () => {
    getSetting.mockRejectedValue(new Error('database offline'));

    await expect(getInvoiceNumberSettings()).resolves.toEqual(DEFAULT_INVOICE_NUMBER_SETTINGS);
  });
});

describe('saveInvoiceNumberSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isReady.mockReturnValue(true);
  });

  it('round-trips a saved prefix back out of the settings service', async () => {
    await saveInvoiceNumberSettings({ prefix: 'ACME-' });
    expect(setSetting).toHaveBeenCalledWith('invoice_number_settings', { prefix: 'ACME-' }, 'invoice');

    getSetting.mockResolvedValue({ prefix: 'ACME-' });
    await expect(getInvoiceNumberSettings()).resolves.toEqual({ prefix: 'ACME-' });
  });
});
