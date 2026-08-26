# Getting started

## Requirements

- **Node 24.** `package.json` declares `engines: { node: ">=24 <25" }` and
  `.nvmrc` pins 24.
- npm
- Git

Nothing else. SQLite is embedded, and there is no external service to run.

## Setup

```bash
git clone https://github.com/rbenzing/SlimBooks.git
cd slimbooks

npm install

cp .env.example .env
```

Set `CLIENT_URL` in `.env` — it is the one variable with no default and the
server will not start without it. For local work, `http://localhost:8080`.

For anything beyond local work, generate real secrets:
[secrets](../operations/secrets.md).

## The daily loop

```bash
npm run dev
```

Two processes, via `concurrently`:

| | |
|---|---|
| Frontend | `http://localhost:8080` (Vite, hot-reloads) |
| API | `http://localhost:3002` |

Vite proxies `/api` to the API server. Migrations run automatically at boot.

> **Restart the server after backend changes.** Stop the process and run
> `npm run dev` again. The frontend hot-reloads; the backend does not do so
> reliably.

The database is created at `data/slimbooks.db` on first boot.

## Before every commit

```bash
npm run lint     # ESLint (0/0) + typecheck
npm test
npm run build
```

Run `npm run typecheck` and `npm run lint` after every file change, not only at
the end. Details and the reasoning behind the bar: [testing](testing.md).

## Conventions

### Filenames

camelCase, with a suffix naming the kind:

| Suffix | Kind |
|---|---|
| `.svc.ts` | service |
| `.types.ts` | types |
| `.util.ts` | utility |
| `.hook.ts` | hook |
| `.cpt.ts` | component |

`camelCase` for functions, `PascalCase` for classes.

### Code

- **Enhance existing code rather than adding parallel code.** Don't deprecate a
  function — improve it or remove it.
- **No backwards-compatibility shims.** Removed configuration is rejected with
  a message naming its replacement, not silently aliased.
- **Don't rename values in transit.** Use the names from the interfaces.
- **Never `any`.** `unknown` or a real interface.
- **Honour the settings objects** in anything user-facing: currency, number and
  date formatting, language.
- **No debug code left behind.**

### Frontend

- Check `src/components/ui/` before building a component. It holds only the
  components in use; 2.3.0 removed the forty shadcn/ui files nothing imported,
  so reach for `npx shadcn@latest add <name>` rather than hand-rolling one.
- Colour and surface come from `themeClasses`
  ([theme system](theme-system.md)).
- All date display goes through `src/utils/formatting/date.util.ts`.
- React Query owns API state.
- Controllers stay thin; logic lives in services.

### Types

Three declarations are maintained by hand and must stay in sync — see the
[schema change checklist](architecture.md#schema-change-checklist). A
half-updated schema compiles and fails at runtime.

## Working with the database

```bash
npm run db:export -- dump.json    # dialect-neutral dump
npm run db:import -- dump.json    # into an empty database
```

To inspect a SQLite database without the `sqlite3` CLI:

```bash
node -e "const db=require('better-sqlite3')('data/slimbooks.db');console.log(db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\'').all())"
```

Testing against MySQL locally is in [testing](testing.md#both-engines).

## Where to look next

| Question | Document |
|---|---|
| How does this fit together? | [architecture](architecture.md) |
| Why is it like this? | [decisions](../adr/) |
| What does this endpoint do? | [API reference](api-reference.md) |
| How do I deploy it? | [deployment](../operations/deployment.md) |
| How do I contribute a change? | [CONTRIBUTING](../../CONTRIBUTING.md) |
