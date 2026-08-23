# Releasing

## What a version number means here

Slimbooks is an application someone installs and runs, not a library someone
imports. So the contract a version number makes is with the **operator** — the
person upgrading a running install — and the question each release answers is
"what will this do to my install?"

| Change | Bump |
|---|---|
| An upgrade needs a manual step, or an environment that booted before now refuses to | major |
| A removed or renamed environment variable; a dump the previous version cannot import | major |
| A new feature or endpoint; a migration that runs itself on first boot | minor |
| A fix, a dependency bump, documentation; no new surface | patch |

That is why 2.0.0 was a major — it rejects removed variables like
`ENABLE_HTTPS` at boot, so an untouched `.env` stops the server — while 2.2.0
was a minor despite rewriting every timestamp column, because migration 015
converts existing rows without anyone being asked to do anything.

**The HTTP API is treated as internal to the bundled UI.** A breaking change to
a request or response shape does not on its own force a major, but it must
appear under `### Changed` in the changelog, in bold, naming what a caller
should use instead. 2.3.0 removing `password_hash` from `PUT /api/users/:id` is
the worked example.

If a change sits between two rows, take the higher one. A major nobody needed
costs a paragraph of explanation; a minor that breaks a boot costs somebody
their evening.

## Where the version lives

`package.json` is the single source of truth. Nothing else states it:

- `server/config/index.ts` reads it at startup into `APP_VERSION`, which is
  what `/api/health` and `/api/config` report, and what the running server
  believes it is.
- `initial.seed.ts` writes it to the `app_version` setting at install. That row
  records **the version that created the database** and is never updated
  afterwards, so it is install provenance, not a live version — read
  `/api/health` for what is running now.
- `package-lock.json` carries a copy in two places. `npm version` keeps them in
  step; a hand-edit does not.
- `.github/workflows/release.yml` refuses to publish a tag that disagrees with
  `package.json`, so the three can never ship apart.

## Cutting a release

1. **Confirm `main` is green against both engines**, not just SQLite. A run
   that skipped the MySQL suites is not a green run — see
   [testing.md](testing.md).

2. **Pick the number** from the table above.

3. **Bump with npm, never by hand:**

   ```bash
   npm version 2.3.0 --no-git-tag-version
   ```

   This writes `package.json` and both `package-lock.json` entries together.
   `--no-git-tag-version` is deliberate: the tag is created later, annotated,
   with real notes on it.

4. **Cut the changelog.** Rename `## [Unreleased]` to `## [X.Y.Z] — YYYY-MM-DD`,
   open a fresh empty `## [Unreleased]` above it, and add the link definition
   at the foot of the file.

5. **Commit:**

   ```bash
   git commit -am "Release X.Y.Z"
   ```

6. **Tag, annotated, with the notes.** The tag message *is* the GitHub release
   body — the workflow reads it back with `git tag -l --format='%(contents)'`
   and falls back to a bare "Release vX.Y.Z" if it is empty. Write it for an
   operator deciding whether to upgrade: what changed, what it costs them, what
   they must do.

   ```bash
   git tag -a v2.3.0 -F <notes file>
   ```

7. **Push the branch, then the tag:**

   ```bash
   git push origin main
   git push origin v2.3.0
   ```

   **The tag push is the release.** Pushing `main` alone publishes nothing.

## What happens then

`.github/workflows/release.yml` fires on any pushed `v*` tag and does two
things before publishing anything:

- **Refuses a tag that disagrees with `package.json`.** A `v1.2.0` tag on a
  tree that says `1.1.0` would produce a release whose contents report a
  different version than its name.
- **Runs the full gate** — `npm ci`, lint, typecheck, tests, build. A tag is
  not a promise that anyone ran the tests.

Publishing is a separate job depending on that one, so a failure anywhere
earlier leaves no release behind. It attaches
`slimbooks-X.Y.Z.tar.gz` — `dist`, `package.json`, `package-lock.json` and
`.env.example`, ready to drop onto a host alongside `npm ci --omit=dev`.

## What has gone wrong before

- **2.2.0 was tagged locally and never pushed.** The commits went to `main`,
  so the work was live, but GitHub's latest release stayed 2.1.1 for eleven
  days. Nothing warns you: pushing a branch and pushing a tag are separate
  commands, and only the second one releases.
- **The same release hand-edited `package.json` and left `package-lock.json`
  saying 2.1.1.** Two files disagreed for two releases, and the artifact the
  release workflow ships contains both. `npm version` exists precisely so this
  cannot happen — use it.
