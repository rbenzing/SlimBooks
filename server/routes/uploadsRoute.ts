// Serves uploaded files through the storage provider.
//
// Replaces `express.static(runtime.paths.uploadsDir)`, which reads straight off
// disk and so cannot serve a database-backed provider at all. Streaming from
// runtime.storage works for both, since LocalDiskStorage.get() already returns
// a Readable.
//
// publicUrl() still returns /uploads/<key>, so logo URLs already saved in
// settings keep resolving and no stored value needs migrating.

import { Router, type Request } from 'express';
import type { Runtime } from '../runtime/types.js';

/**
 * Content types for the formats the upload filter admits.
 *
 * Derived from the key rather than stored alongside the object, so the disk
 * provider — which records no metadata — behaves the same as the database one.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon'
});

const contentTypeFor = (key: string): string => {
  const extension = key.split('.').pop()?.toLowerCase() ?? '';

  return CONTENT_TYPES[extension] ?? 'application/octet-stream';
};

export const createUploadsRoute = (runtime: Runtime): Router => {
  const router = Router();

  router.get('/*', async (req: Request<Record<string, string>>, res) => {
    // Express has already percent-decoded the parameter, and answers 400 itself
    // on a malformed escape. Decoding again here would be a double-decode:
    // `%252e%252e%252f` arrives as `%2e%2e%2f` and a second pass turns it into
    // `../`, which is the standard way a traversal check gets walked past.
    const key = req.params['0'] ?? '';

    let stream;

    try {
      stream = await runtime.storage.get(key);
    } catch {
      // An unsafe key is a not-found, not a server error. Distinguishing the
      // two would tell a prober which keys are merely absent and which are
      // rejected, and a 500 would carry a stack trace into the response.
      res.status(404).end();
      return;
    }

    if (stream === null) {
      res.status(404).end();
      return;
    }

    // Filenames are UUIDs and are never reused, so an immutable year is safe —
    // and it matters more than it did under express.static, because every
    // uncached request against the database provider is now a database read.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', contentTypeFor(key));

    // An SVG is a script host. It is served as a download rather than rendered
    // in the origin, so a logo upload cannot become stored XSS against the app.
    res.setHeader('X-Content-Type-Options', 'nosniff');

    stream.on('error', () => {
      if (!res.headersSent) res.status(404).end();
      else res.end();
    });

    stream.pipe(res);
  });

  return router;
};
