/**
 * Email provider preset tests.
 *
 * The presets exist so that host, port and encryption are always chosen
 * together — a right port with the wrong encryption fails at connect time in a
 * way that reads like a bad password. So the tests care about the three values
 * agreeing, and about detection not claiming a provider it does not match.
 */

import { describe, it, expect } from 'vitest';
import {
  EMAIL_PROVIDERS,
  CUSTOM_PROVIDER_ID,
  findProvider,
  detectProvider
} from '@/utils/emailProviders.util';

describe('the preset list', () => {
  it('offers a useful number of providers', () => {
    expect(EMAIL_PROVIDERS.length).toBeGreaterThanOrEqual(10);
  });

  it('gives every provider a complete, usable configuration', () => {
    for (const provider of EMAIL_PROVIDERS) {
      expect(provider.host).toMatch(/\./);
      expect(provider.port).toBeGreaterThan(0);
      expect(['ssl', 'tls', 'none']).toContain(provider.security);
    }
  });

  it('pairs each port with the encryption that port expects', () => {
    // 465 is SSL-on-connect and 587 is STARTTLS. A preset that mixes them up
    // would be worse than no preset at all.
    for (const provider of EMAIL_PROVIDERS) {
      if (provider.port === 465) expect(provider.security).toBe('ssl');
      if (provider.port === 587) expect(provider.security).toBe('tls');
    }
  });

  it('uses ids that are unique and never collide with the custom option', () => {
    const ids = EMAIL_PROVIDERS.map(p => p.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(CUSTOM_PROVIDER_ID);
  });

  it('warns about the providers that reject an account password', () => {
    // Gmail and SendGrid are where people get stuck, in different ways.
    expect(findProvider('gmail')?.hint).toMatch(/app password/i);
    expect(findProvider('sendgrid')?.hint).toMatch(/apikey/i);
  });
});

describe('findProvider', () => {
  it('finds a known provider', () => {
    expect(findProvider('gmail')).toMatchObject({ host: 'smtp.gmail.com', port: 587 });
  });

  it('returns nothing for the custom option, which has no preset', () => {
    expect(findProvider(CUSTOM_PROVIDER_ID)).toBeUndefined();
  });

  it('returns nothing for an unknown id', () => {
    expect(findProvider('carrier-pigeon')).toBeUndefined();
  });
});

describe('detectProvider', () => {
  it('recognises a stored configuration that matches a preset exactly', () => {
    expect(detectProvider('smtp.gmail.com', 587, 'tls')).toBe('gmail');
  });

  it('ignores host casing', () => {
    expect(detectProvider('SMTP.GMAIL.COM', 587, 'tls')).toBe('gmail');
  });

  it('calls a matching host on a different port custom', () => {
    // Claiming this as Gmail would let re-selecting the provider silently
    // overwrite a port someone chose deliberately.
    expect(detectProvider('smtp.gmail.com', 2525, 'tls')).toBe(CUSTOM_PROVIDER_ID);
  });

  it('calls a matching host with different encryption custom', () => {
    expect(detectProvider('smtp.gmail.com', 587, 'ssl')).toBe(CUSTOM_PROVIDER_ID);
  });

  it('calls an unknown host custom', () => {
    expect(detectProvider('mail.mycompany.com', 587, 'tls')).toBe(CUSTOM_PROVIDER_ID);
  });

  it('selects nothing at all when no host has been entered', () => {
    // An empty configuration is not "custom" — nothing has been chosen yet.
    expect(detectProvider('', 587, 'tls')).toBe('');
  });

  it('round-trips every preset back to itself', () => {
    for (const provider of EMAIL_PROVIDERS) {
      expect(detectProvider(provider.host, provider.port, provider.security)).toBe(provider.id);
    }
  });
});
