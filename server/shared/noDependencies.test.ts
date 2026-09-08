/**
 * Everything under `server/shared/` is bundled into the browser via the
 * `@shared/*` alias (`vite.config.ts`), so a file here that imports anything
 * server-only — a database driver, `fs`, an Express type — would either
 * break the client build or silently drag Node-only code into it. This
 * checks the actual file contents, not a convention someone has to remember.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('server/shared stays dependency-free', () => {
  it('has no import or require statements in any of its files', () => {
    const dir = join(import.meta.dirname, '.');
    const files = readdirSync(dir).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'));

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const contents = readFileSync(join(dir, file), 'utf-8');
      const hasImport = /^\s*import\s/m.test(contents) || /\brequire\s*\(/.test(contents);
      expect(hasImport, `${file} must not import anything — server/shared/ is bundled into the browser`).toBe(false);
    }
  });
});
