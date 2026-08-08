/**
 * Path resolution tests.
 *
 * The application previously computed paths as `__dirname` arithmetic, so the
 * same expression meant the project root under tsx and the `server` directory
 * once compiled. That is why a phantom `server/data/slimbooks.db` exists beside
 * the real one, why the built server served its own JavaScript instead of the
 * SPA, and why uploaded logos were written to one directory and served from
 * another.
 *
 * The load-bearing test is `resolves identically from source and compiled
 * layouts`. If it ever fails, the defect class is back.
 */

import { describe, it, expect } from 'vitest';
import { join, isAbsolute } from 'node:path';
import { findProjectRoot, resolvePaths } from './paths.js';

const REPO_ROOT = findProjectRoot(join(process.cwd(), 'server', 'runtime'));

const SOURCE_LAYOUT = join(REPO_ROOT, 'server', 'runtime');
const COMPILED_LAYOUT = join(REPO_ROOT, 'dist', 'server', 'runtime');

describe('findProjectRoot', () => {
  it('walks up to the directory holding package.json', () => {
    expect(findProjectRoot(SOURCE_LAYOUT)).toBe(REPO_ROOT);
  });

  it('finds the same root from a deeper compiled layout', () => {
    expect(findProjectRoot(COMPILED_LAYOUT)).toBe(REPO_ROOT);
  });

  it('throws when no package.json exists above the start directory', () => {
    expect(() => findProjectRoot('/nonexistent-abcdef')).toThrow(/package\.json/);
  });
});

describe('resolvePaths', () => {
  it('resolves identically from source and compiled layouts', () => {
    const fromSource = resolvePaths({}, SOURCE_LAYOUT);
    const fromCompiled = resolvePaths({}, COMPILED_LAYOUT);

    expect(fromCompiled).toEqual(fromSource);
  });

  it('defaults every path under the project root', () => {
    const paths = resolvePaths({}, SOURCE_LAYOUT);

    expect(paths.root).toBe(REPO_ROOT);
    expect(paths.dataDir).toBe(join(REPO_ROOT, 'data'));
    expect(paths.uploadsDir).toBe(join(REPO_ROOT, 'uploads'));
    expect(paths.staticDir).toBe(join(REPO_ROOT, 'dist', 'client'));
    expect(paths.dbFile).toBe(join(REPO_ROOT, 'data', 'slimbooks.db'));
  });

  it('returns absolute paths for every entry', () => {
    const paths = resolvePaths({ DATA_DIR: 'var/db', DB_PATH: 'books.db' }, SOURCE_LAYOUT);

    for (const value of Object.values(paths)) {
      expect(isAbsolute(value)).toBe(true);
    }
  });

  it('resolves a relative DATA_DIR against the project root', () => {
    const paths = resolvePaths({ DATA_DIR: 'var/db' }, SOURCE_LAYOUT);

    expect(paths.dataDir).toBe(join(REPO_ROOT, 'var', 'db'));
    expect(paths.dbFile).toBe(join(REPO_ROOT, 'var', 'db', 'slimbooks.db'));
  });

  it('honours an absolute DATA_DIR unchanged', () => {
    const absolute = join(REPO_ROOT, 'elsewhere');
    const paths = resolvePaths({ DATA_DIR: absolute }, SOURCE_LAYOUT);

    expect(paths.dataDir).toBe(absolute);
  });

  it('resolves a relative DB_PATH inside the data directory', () => {
    const paths = resolvePaths({ DATA_DIR: 'var/db', DB_PATH: 'books.db' }, SOURCE_LAYOUT);

    expect(paths.dbFile).toBe(join(REPO_ROOT, 'var', 'db', 'books.db'));
  });

  it('honours an absolute DB_PATH regardless of the data directory', () => {
    const absolute = join(REPO_ROOT, 'mnt', 'books.db');
    const paths = resolvePaths({ DATA_DIR: 'var/db', DB_PATH: absolute }, SOURCE_LAYOUT);

    expect(paths.dbFile).toBe(absolute);
  });

  it('treats blank overrides as absent rather than as empty paths', () => {
    const paths = resolvePaths({ DATA_DIR: '  ', UPLOAD_DIR: '' }, SOURCE_LAYOUT);

    expect(paths.dataDir).toBe(join(REPO_ROOT, 'data'));
    expect(paths.uploadsDir).toBe(join(REPO_ROOT, 'uploads'));
  });
});
