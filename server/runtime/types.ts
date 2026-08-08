// Shared runtime types for the composition root.
//
// These describe facts that vary by host. Everything here is resolved once at
// boot and then frozen; nothing downstream re-derives any of it.

export type TlsMode = 'off' | 'self' | 'proxy';

export type ToggleState = 'auto' | 'on' | 'off';

export type FeatureName =
  | 'pdf'
  | 'email'
  | 'stripe'
  | 'oauth'
  | 'scheduler'
  | 'uploads'
  | 'dbAdmin'
  | 'signup'
  | 'debug';

export type FeatureSet = Readonly<Record<FeatureName, boolean>>;

export interface RuntimePaths {
  /** Project root — the directory holding package.json. */
  root: string;
  /** Directory holding the database file and backups. */
  dataDir: string;
  /** Directory holding uploaded files. */
  uploadsDir: string;
  /** Directory holding the built SPA (index.html and assets). */
  staticDir: string;
  /** Absolute path to the SQLite database file. */
  dbFile: string;
}

export interface ListenerConfig {
  /** A TCP port, or a named pipe path when the host supplies one (iisnode). */
  target: number | string;
  /** Interface to bind. Null when listening on a named pipe. */
  host: string | null;
  tls: TlsMode;
  /** Proxy hop count for Express `trust proxy`. Zero when not behind a proxy. */
  trustProxyHops: number;
  /** Absolute paths to the certificate pair. Present only when tls is 'self'. */
  tlsKeyPath: string | null;
  tlsCertPath: string | null;
}

/** The subset of environment variables path resolution needs. */
export interface PathEnv {
  DATA_DIR?: string | undefined;
  UPLOAD_DIR?: string | undefined;
  STATIC_DIR?: string | undefined;
  DB_PATH?: string | undefined;
}

import type { StorageProvider } from './storage.js';
import type { PdfProvider } from './pdf.js';
import type { Scheduler } from './scheduler.js';

export interface Runtime {
  paths: RuntimePaths;
  urls: { publicUrl: string };
  listener: ListenerConfig;
  features: FeatureSet;
  storage: StorageProvider;
  /** Null when the PDF feature is disabled or Chromium is unavailable. */
  pdf: PdfProvider | null;
  /** Null when the scheduler feature is disabled. */
  scheduler: Scheduler | null;
  describe(): string;
}
