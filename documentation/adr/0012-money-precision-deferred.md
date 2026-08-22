# ADR-0012: Money stays `REAL`/`DOUBLE` until both backends change together

**Status:** Deferred
**Date:** 2026-08-12

## Context

Monetary amounts are stored in `REAL` columns, which map to `DOUBLE` in MySQL.
Binary floating point is the wrong representation for money: `DECIMAL` is the
right one, and MySQL has it.

The obvious improvement is to map `REAL` to `DECIMAL` on MySQL. It is also
wrong.

SQLite has no `DECIMAL`. Mapping only MySQL would mean the same invoice, with
the same line items, totals to a different number depending on which backend
the install happens to use. A rounding difference between two of your own
deployments is worse than a rounding weakness both share, because it is
invisible until someone reconciles two systems and finds a penny.

## Decision

`REAL` maps to `DOUBLE`, never `DECIMAL`. Currency precision is not fixed
piecemeal.

It gets fixed for both backends together, in its own change, with its own
migration and its own tests.

## Consequences

- Amounts carry double-precision rounding behaviour today. For invoice-scale
  numbers this is tolerable; it is not correct.
- The two backends agree with each other, which is the property being
  protected.
- The retyping machinery built for
  [ADR-0009](0009-instants-as-epoch-milliseconds.md)
  (`server/database/retype.util.ts`) is generic, so the eventual change has a
  path that does not start from nothing.
- Anyone tempted to "just fix MySQL" should read this file first. That is what
  it is for.
