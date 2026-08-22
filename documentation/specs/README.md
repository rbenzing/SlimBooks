# Specifications

What each subsystem guarantees, and to whom.

A specification here describes a **contract**: the interface, the invariants
that hold across it, and the failure modes callers must handle. It is not a
design discussion and not a work plan — those are drafted separately and stay
out of the repository.

Where a spec records *why* a contract is shaped the way it is, it links to the
[decision record](../adr/) rather than restating it.

## Index

| # | Subsystem | Status |
|---|---|---|
| [001](001-portable-runtime.md) | Portable runtime | Shipped in 2.0.0 |
| [002](002-deployment-artifacts.md) | Per-host deployment artifacts | Designed, not implemented |
| [003](003-database-adapter.md) | Database adapter | Shipped in 2.1.0 |
| [004](004-invoice-rendering.md) | Server-side invoice rendering | Proposed |
| [005](005-timestamp-storage.md) | Timestamp storage | Shipped in 2.2.0 |

Numbers are stable and are not reused. A spec that is superseded says so at the
top and points forward.

## Status vocabulary

| Status | Means |
|---|---|
| Proposed | The problem is agreed. The contract is not. |
| Designed | The contract is settled and reviewed. No code yet. |
| Shipped in X | Implemented and released. The document describes what runs. |
| Superseded by NNN | Kept for history. Read the successor. |

A spec is written before the work and corrected after it. If the implementation
diverged, the spec is wrong and gets fixed — it describes what runs, not what
was hoped for.
