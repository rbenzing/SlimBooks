/**
 * PDF provider tests.
 *
 * puppeteer was a runtime dependency imported at module scope, so every PaaS
 * deploy downloaded ~300MB of Chromium and any host without it could not even
 * load the module. Availability must be a question the runtime can ask without
 * the answer being fatal.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPdfProvider, isChromiumAvailable } from './pdf.js';

beforeEach(() => {
  vi.resetModules();
});

describe('isChromiumAvailable', () => {
  it('reports availability without throwing when puppeteer is absent', async () => {
    await expect(isChromiumAvailable(async () => { throw new Error('not installed'); }))
      .resolves.toBe(false);
  });

  it('reports available when the module loads and resolves an executable', async () => {
    const loader = async () => ({ executablePath: () => '/usr/bin/chromium' });

    await expect(isChromiumAvailable(loader)).resolves.toBe(true);
  });

  it('reports unavailable when the module loads but resolves no executable', async () => {
    const loader = async () => ({ executablePath: () => '' });

    await expect(isChromiumAvailable(loader)).resolves.toBe(false);
  });

  it('reports unavailable when resolving the executable throws', async () => {
    const loader = async () => ({
      executablePath: () => { throw new Error('no browser'); }
    });

    await expect(isChromiumAvailable(loader)).resolves.toBe(false);
  });
});

describe('createPdfProvider', () => {
  it('returns null when the feature is disabled, without loading puppeteer', async () => {
    const loader = vi.fn(async () => ({ executablePath: () => '/usr/bin/chromium' }));

    expect(await createPdfProvider(false, loader)).toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });

  it('returns null when the feature is enabled but Chromium is unavailable', async () => {
    const loader = async () => { throw new Error('not installed'); };

    expect(await createPdfProvider(true, loader)).toBeNull();
  });

  it('returns a named provider when Chromium is available', async () => {
    const loader = async () => ({ executablePath: () => '/usr/bin/chromium' });
    const provider = await createPdfProvider(true, loader);

    expect(provider?.name).toBe('chromium');
  });
});
