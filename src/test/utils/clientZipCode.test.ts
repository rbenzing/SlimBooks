/**
 * Postal-code field consistency tests.
 *
 * The client postal code had three spellings: the `zip` database column, the
 * `zipCode` name used by the API/types/UI, and a `zip_code` alias on the type.
 * Migration 006 then added a second real column, so `zip` and `zipCode` both
 * existed holding duplicate values. `zipCode` is now the single name end to end.
 */

import { describe, it, expect } from 'vitest';
import { parseClientCSV } from '@/utils/data';
import { formatClientAddress, formatClientAddressSingleLine } from '@/utils/formatting';
import type { Client } from '@/types';

const client: Client = {
  id: 1,
  name: 'Acme Corporation',
  email: 'contact@acme.com',
  address: '123 Business St',
  city: 'Business City',
  state: 'CA',
  zipCode: '90210',
  country: 'US',
  created_at: Date.parse('2026-07-25'),
  updated_at: Date.parse('2026-07-25')
};

describe('client postal code', () => {
  it('renders zipCode in the multi-line address', () => {
    expect(formatClientAddress(client)).toContain('90210');
  });

  it('renders zipCode in the single-line address', () => {
    expect(formatClientAddressSingleLine(client)).toContain('90210');
  });

  it('omits the postal code cleanly when absent', () => {
    const withoutZip: Client = { ...client, zipCode: undefined };
    expect(formatClientAddressSingleLine(withoutZip)).not.toContain('undefined');
  });
});

describe('parseClientCSV', () => {
  it('maps a zipCode column onto zipCode', () => {
    const [row] = parseClientCSV('name,email,zipCode\nAcme,a@b.com,90210');
    expect(row.zipCode).toBe('90210');
  });

  it('accepts the "Zip Code" header spelling', () => {
    const [row] = parseClientCSV('name,email,Zip Code\nAcme,a@b.com,90210');
    expect(row.zipCode).toBe('90210');
  });

  it('accepts a legacy zip header and normalises it to zipCode', () => {
    const [row] = parseClientCSV('name,email,zip\nAcme,a@b.com,90210');
    expect(row.zipCode).toBe('90210');
    expect(row).not.toHaveProperty('zip');
  });
});
