import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { authenticatedFetch } from '@/utils/api';

/**
 * The import panel is meant to explain an import where every row failed —
 * counts, and the per-row reasons the API returns. It cannot, if the response
 * carrying that explanation arrives as a thrown error.
 *
 * `authenticatedFetch` rejects on any non-ok status, and builds its message by
 * consuming the body first (`http.util.ts:27-34,76`), so the payload is gone by
 * the time a caller could reach for it. An all-failed import was briefly given
 * a 422 for semantic tidiness; the panel would have shown "Failed to import
 * expenses" and nothing else — hiding exactly the row errors the user needs.
 *
 * These two tests pin the coupling from both ends.
 */

const ROUTES = [
  'server/routes/expenseRoutes.ts',
  'server/routes/paymentRoutes.ts',
  'server/routes/clientRoutes.ts'
];

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('authenticatedFetch turns a non-ok status into a rejection', () => {
  it('rejects rather than returning the body a caller might want to read', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, data: { imported: 0, failed: 3 } }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' }
      })
    ) as unknown as typeof globalThis.fetch;

    await expect(authenticatedFetch('/api/expenses/bulk-import', { method: 'POST' }))
      .rejects.toThrow();
  });
});

describe('bulk-import answers 2xx so its body reaches the panel', () => {
  it.each(ROUTES)('%s sends the outcome with a plain res.json', (file) => {
    const source = readFileSync(file, 'utf8');

    // The outcome response only — not the 400 that rejects a malformed body,
    // which is a genuine transport error and correctly throws.
    const fromResult = source.slice(source.indexOf('const data: BulkImportResult'));
    const outcomeResponse = fromResult.slice(0, fromResult.indexOf('});') + 3);

    expect(outcomeResponse).toMatch(/res\.json\(\{/);
    expect(outcomeResponse).not.toMatch(/res\.status\(/);
  });

  it.each(ROUTES)('%s still reports the verdict through `success`', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).toMatch(/success:\s*successCount\s*>\s*0/);
  });
});
