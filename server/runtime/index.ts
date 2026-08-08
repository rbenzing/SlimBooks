// The runtime composition root.
//
// Every host-dependent fact is resolved here, exactly once, and frozen. Below
// this module nothing reads process.env and nothing derives a path from
// __dirname — that invariant is what removes the defect class where the same
// expression meant different things under tsx and compiled output.
//
// Resolution is driven entirely by environment. There is no host detection:
// IIS differs from Docker only in the variables its web.config sets, so
// development and production run identical code paths.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoRemovedVars, readRequired, type RawEnv } from './env.js';
import { resolveFeatures, type FeatureProbes } from './features.js';
import { resolveListener } from './listener.js';
import { resolvePaths } from './paths.js';
import { LocalDiskStorage } from './storage.js';
import type { Runtime, RuntimePaths } from './types.js';

/** Where broken path resolution wrote the database before this refactor. */
const LEGACY_DB_SUBPATHS = [
  join('server', 'data', 'slimbooks.db'),
  join('server', 'dist', 'data', 'slimbooks.db')
] as const;

/**
 * Where logos were written and served before this refactor.
 *
 * These disagreed with each other, so an install may have files in either.
 */
const LEGACY_UPLOAD_SUBPATHS = [
  join('public', 'uploads', 'logos'),
  join('server', 'public', 'uploads', 'logos')
] as const;

/**
 * Refuse to start when a legacy database exists and the resolved one does not.
 *
 * Broken path resolution wrote production data to `server/data/slimbooks.db`
 * while development used `data/slimbooks.db`. Picking one silently could mean
 * invoicing customers from stale books, and seeding a fresh database silently
 * would look like total data loss. Neither is acceptable, so the operator is
 * told exactly what to move.
 *
 * @param fileExists Injectable for testing; defaults to a real filesystem check.
 */
export const assertNoLegacyData = (
  paths: RuntimePaths,
  fileExists: (candidate: string) => boolean = existsSync
): void => {
  if (!fileExists(paths.dbFile)) {
    const stranded = LEGACY_DB_SUBPATHS.map(sub => join(paths.root, sub)).filter(fileExists);

    if (stranded.length > 0) {
      throw new Error(
        `A database exists at a legacy location but not at the configured one.\n` +
          `  configured: ${paths.dbFile}\n` +
          stranded.map(path => `  legacy:     ${path}\n`).join('') +
          `Move the legacy file to the configured path (or set DB_PATH to point at it) ` +
          `and start again. Refusing to seed an empty database over existing books.`
      );
    }
  }

  // Same rule for uploads. Logos were written to one directory and served from
  // another, so an install may have files in either; picking one silently would
  // make a company's logo vanish from its invoices with no error anywhere.
  if (!fileExists(join(paths.uploadsDir, 'logos'))) {
    const strandedUploads = LEGACY_UPLOAD_SUBPATHS
      .map(sub => join(paths.root, sub))
      .filter(fileExists);

    if (strandedUploads.length > 0) {
      throw new Error(
        `Uploaded files exist at a legacy location but not at the configured one.\n` +
          `  configured: ${join(paths.uploadsDir, 'logos')}\n` +
          strandedUploads.map(path => `  legacy:     ${path}\n`).join('') +
          `Move the legacy directory's contents to the configured path and start again.`
      );
    }
  }
};

/** Probe each feature's dependency on this host. */
const probeFeatures = (env: RawEnv, overrides: Partial<FeatureProbes>): FeatureProbes => {
  const defaults: FeatureProbes = {
    // PDF availability is decided in Task 7, when the provider can be loaded.
    // Until then the toggle alone governs it.
    pdf: true,
    email: Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),
    stripe: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PUBLISHABLE_KEY),
    oauth: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    scheduler: true,
    uploads: true,
    dbAdmin: true,
    signup: true,
    debug: false
  };

  return { ...defaults, ...overrides };
};

export const describeRuntime = (runtime: Runtime): string => {
  const { paths, listener, features, urls } = runtime;

  const target = typeof listener.target === 'number'
    ? `${listener.host ?? '0.0.0.0'}:${listener.target}`
    : `pipe ${listener.target}`;

  const enabled = Object.entries(features)
    .filter(([, on]) => on)
    .map(([name]) => name)
    .join(', ');

  return [
    `root      ${paths.root}`,
    `data      ${paths.dataDir}`,
    `uploads   ${paths.uploadsDir}`,
    `static    ${paths.staticDir}`,
    `database  ${paths.dbFile}`,
    `public    ${urls.publicUrl}`,
    `listen    ${target} (tls: ${listener.tls}, trust proxy: ${listener.trustProxyHops})`,
    `features  ${enabled.length > 0 ? enabled : 'none'}`
  ].join('\n');
};

/**
 * Resolve the complete runtime.
 *
 * @param env       Raw environment, normally `process.env`.
 * @param moduleDir Directory of the calling module, used to find the root.
 * @param probes    Feature dependency overrides, for tests and for probes that
 *                  can only run after a provider has been loaded.
 */
export const resolveRuntime = (
  env: RawEnv,
  moduleDir: string,
  probes: Partial<FeatureProbes> = {}
): Runtime => {
  // Removed variables are checked first: an operator with a stale ENABLE_HTTPS
  // should hear about it before any other failure confuses the diagnosis.
  assertNoRemovedVars(env);

  const paths = resolvePaths(env, moduleDir);
  const listener = resolveListener(env, paths.root);
  const features = resolveFeatures(env, probeFeatures(env, probes));

  const publicUrl = readRequired(env, 'CLIENT_URL').replace(/\/+$/, '');

  const runtime: Runtime = {
    paths,
    urls: { publicUrl },
    listener,
    features,
    storage: new LocalDiskStorage(paths.uploadsDir),
    pdf: null,
    scheduler: null,
    describe(): string {
      return describeRuntime(this);
    }
  };

  return Object.freeze(runtime);
};
