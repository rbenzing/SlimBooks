// Absolute path resolution for the runtime composition root.
//
// Every path derives from the project root — the directory holding
// package.json — rather than from `__dirname` arithmetic. That is deliberate:
// `join(__dirname, '..', 'dist')` means `<root>/dist` under tsx and
// `server/dist/dist` once compiled, and the same drift split the database in
// two and made uploaded logos unreachable.
//
// `moduleDir` is a parameter rather than an ambient `__dirname` read so the
// equivalence of the source and compiled layouts is directly testable.
//
// This module imports nothing from the project, so it loads standalone.

import { dirname, isAbsolute, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { PathEnv, RuntimePaths } from './types.js';

/** How far up the tree to look before giving up. */
const MAX_ASCENT = 8;

/**
 * The project root, found by walking up to the directory holding package.json.
 *
 * Works for both layouts: `<root>/server/runtime` ascends one level short of
 * the root, and `<root>/dist/server/runtime` ascends three.
 */
export const findProjectRoot = (startDir: string): string => {
  let directory = resolve(startDir);

  for (let level = 0; level < MAX_ASCENT; level += 1) {
    if (existsSync(join(directory, 'package.json'))) {
      return directory;
    }

    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }

  throw new Error(
    `Could not locate package.json above ${startDir}. The runtime cannot resolve the project root.`
  );
};

/** Blank strings are operator mistakes, not requests for an empty path. */
const cleaned = (value: string | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/** Resolves `value` against `base` unless it is already absolute. */
const against = (base: string, value: string | null, fallback: string): string => {
  if (value === null) return fallback;
  return isAbsolute(value) ? resolve(value) : resolve(base, value);
};

/**
 * Resolve every filesystem location the application needs.
 *
 * @param env      Path-related environment overrides.
 * @param moduleDir Directory of the calling module, used to locate the root.
 */
export const resolvePaths = (env: PathEnv, moduleDir: string): RuntimePaths => {
  const root = findProjectRoot(moduleDir);

  const dataDir = against(root, cleaned(env.DATA_DIR), join(root, 'data'));
  const uploadsDir = against(root, cleaned(env.UPLOAD_DIR), join(root, 'uploads'));
  const staticDir = against(root, cleaned(env.STATIC_DIR), join(root, 'dist', 'client'));

  // DB_PATH is relative to the data directory, not the root: an operator who
  // moves the data directory expects the database to move with it.
  const dbFile = against(dataDir, cleaned(env.DB_PATH), join(dataDir, 'slimbooks.db'));

  return { root, dataDir, uploadsDir, staticDir, dbFile };
};
