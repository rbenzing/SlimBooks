import { type Request } from 'express';

/**
 * Reads a single route parameter as a string.
 *
 * Express 5 added wildcard segments (`/files/*splat`), so `req.params[name]`
 * is typed `string | string[]` — correct, because a wildcard really does
 * produce an array. Every named `:param` route in this codebase yields a
 * single string at runtime, but the widened type is right and the narrowing
 * belongs in one place rather than repeated at fifty call sites.
 *
 * An array takes its first segment rather than being stringified: `String(['a',
 * 'b'])` is `'a,b'`, which `parseInt` reads as NaN and a lookup reads as a key
 * that cannot exist. `uploadsRoute.ts` handles its own wildcard directly,
 * because there the whole path — not the first segment — is the value.
 */
export const routeParam = (req: Request, name: string): string | undefined => {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
};
