/**
 * Feature toggle tests.
 *
 * The point of the third state is the `on` case: a production Docker deploy
 * wants the process to refuse to start when Chromium is missing, while a
 * Hostinger deploy wants the same binary to start without it. A boolean cannot
 * express that difference, so silently-degraded production was reachable.
 */

import { describe, it, expect } from 'vitest';
import { ConfigError } from './env.js';
import { FEATURE_ENV_KEYS, resolveFeature, resolveFeatures } from './features.js';

describe('resolveFeature', () => {
  it('enables an auto feature whose dependency resolved', () => {
    expect(resolveFeature('auto', true, 'pdf')).toBe(true);
  });

  it('disables an auto feature whose dependency is missing', () => {
    expect(resolveFeature('auto', false, 'pdf')).toBe(false);
  });

  it('enables an on feature whose dependency resolved', () => {
    expect(resolveFeature('on', true, 'pdf')).toBe(true);
  });

  it('throws for an on feature whose dependency is missing', () => {
    expect(() => resolveFeature('on', false, 'pdf')).toThrow(ConfigError);
  });

  it('names the feature and its variable in the failure', () => {
    expect(() => resolveFeature('on', false, 'pdf')).toThrow(/FEATURE_PDF/);
  });

  it('disables an off feature even when its dependency resolved', () => {
    expect(resolveFeature('off', true, 'pdf')).toBe(false);
  });
});

describe('FEATURE_ENV_KEYS', () => {
  it('maps every feature to a FEATURE_-prefixed variable', () => {
    for (const [feature, key] of Object.entries(FEATURE_ENV_KEYS)) {
      expect(key).toMatch(/^FEATURE_[A-Z_]+$/);
      expect(feature.length).toBeGreaterThan(0);
    }
  });

  it('uses distinct variables for distinct features', () => {
    const keys = Object.values(FEATURE_ENV_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('resolveFeatures', () => {
  const allAvailable = {
    pdf: true, email: true, stripe: true, oauth: true, scheduler: true,
    uploads: true, dbAdmin: true, signup: true, debug: true
  };

  it('returns a decision for every known feature', () => {
    const features = resolveFeatures({}, allAvailable);

    expect(Object.keys(features).sort()).toEqual(Object.keys(FEATURE_ENV_KEYS).sort());
  });

  it('enables everything available when nothing is configured', () => {
    expect(resolveFeatures({}, allAvailable).pdf).toBe(true);
  });

  it('honours an explicit off for one feature without affecting others', () => {
    const features = resolveFeatures({ FEATURE_PDF: 'off' }, allAvailable);

    expect(features.pdf).toBe(false);
    expect(features.email).toBe(true);
  });

  it('fails the boot when a required feature is unavailable', () => {
    const probes = { ...allAvailable, pdf: false };

    expect(() => resolveFeatures({ FEATURE_PDF: 'on' }, probes)).toThrow(ConfigError);
  });

  it('degrades quietly when an auto feature is unavailable', () => {
    const probes = { ...allAvailable, pdf: false };

    expect(resolveFeatures({}, probes).pdf).toBe(false);
  });
});
