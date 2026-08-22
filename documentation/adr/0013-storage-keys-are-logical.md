# ADR-0013: Uploaded files are addressed by logical key, never by path

**Status:** Accepted
**Date:** 2026-08-08 (shipped in 2.0.0)

## Context

Company logos are uploaded by users. Two problems follow.

The first is placement. On a host whose filesystem is wiped on redeploy, a
logo written to disk is gone on the next deploy — the same class of failure as
a SQLite database on such a host ([ADR-0007](0007-two-backends-one-schema.md)).

The second is that a user-influenced value was reaching `path.resolve`. Any
call site that does `path.resolve(uploadsDir, userValue)` can be walked out of
the directory, and `join('/root', '../x')` is not an error — it is a different
directory.

## Decision

Files are addressed by **logical key** — `logos/abc.png` — through a
`StorageProvider` interface: `put`, `get`, `delete`, `exists`, `publicUrl`.

Call sites never see a filesystem path and never call `path.resolve` on a
user-influenced value. `runtime.storage` is the only way in.

`STORAGE_DRIVER` selects the implementation: `disk` (default) or `database`.

Every key is validated by `assertSafeKey()` **before** it touches `join()`. A
key is rejected if it is empty, contains a NUL byte, contains a backslash, is
absolute, is drive-qualified (`C:`), or contains a `..` segment.

## Consequences

- The same call site works on a host with a durable disk and on one without.
- On an ephemeral filesystem, `STORAGE_DRIVER=database` makes objects travel
  with the database backup instead of being a separate thing to remember and
  forget.
- Path traversal is rejected structurally rather than sanitised, and rejected
  before any path arithmetic happens rather than after.
- `/` is the only separator in a key, on every platform, including Windows.
- `publicUrl(key)` means the URL shape is the provider's decision, so switching
  drivers does not rewrite templates.
