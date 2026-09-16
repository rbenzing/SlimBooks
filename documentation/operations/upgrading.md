# Upgrading

## The general procedure

```bash
# 1. Back up. Every time.
sqlite3 data/slimbooks.db ".backup 'pre-upgrade.db'"
tar -czf pre-upgrade-uploads.tar.gz uploads/

# 2. Update
git pull
npm ci
npm run build

# 3. Restart the process
```

Migrations run automatically at boot. There is no separate migration command
and no maintenance mode.

If a migration fails, **the process does not start.** That is the intended
behaviour: a half-migrated database serving requests is worse than one that is
plainly down. The error names what failed; restore the backup, and read
[troubleshooting](troubleshooting.md).

Check `/api/health` afterwards and confirm the version and the resolved
features are what you expect.

## Version-specific notes

### To 3.0.0

**Set your three signing secrets before you restart, or the process will not
start.**

This is the whole reason 3.0.0 is a major. Every other change in it is a fix or
an addition.

```bash
./scripts/generate-secrets.sh     # fills the three values in .env
```

`JWT_SECRET`, `JWT_REFRESH_SECRET` and `SESSION_SECRET` must not be blank and
must not be the placeholder values published in this repository. The boot now
refuses either, **in every environment** — a 2.5.0 install that has been running
happily on a blank `JWT_SECRET` will exit with a message naming the variable.

The check existed before and did not work. It collected the offending variable
and then filtered its own list by "is this variable absent", so a secret
explicitly set to the published placeholder passed the test that existed to
catch it — and it only ran under `NODE_ENV=production`, while `.env.example`
ships `development`. If your install starts on 3.0.0 without you changing
anything, it was already configured correctly.

**Rotating `JWT_SECRET` signs everyone out.** Existing sessions were signed with
the old value and stop verifying. That is one login, once, and it is the point:
if the secret was the published default, anyone could mint a session for your
install, and any token issued under it should be treated as compromised.

**Check your recurring invoices.** Invoices generated from a recurring template
between 2.2.0 and 3.0.0 were overcharged by their own tax plus shipping — the
generator added both a second time to a template amount that already included
them. Nothing is altered automatically. An affected invoice has a `total_amount`
greater than its template's `amount`:

```sql
SELECT i.id, i.invoice_number, i.total_amount, t.amount AS template_amount,
       i.total_amount - t.amount AS overcharged
FROM invoices i
JOIN recurring_invoice_templates t ON t.id = i.recurring_template_id
WHERE i.total_amount > t.amount;
```

That comparison assumes the template has not been edited since the invoice was
raised; if it has, compare against `amount + tax_amount + shipping_amount` on
the invoice itself, which should equal its `total_amount`.

What to do about an invoice already sent or paid is a decision about your
relationship with that client, not a database operation, which is why nothing
here does it for you.

**If your administrator account is `admin@slimbooks.app`, rotate its password**
— `GET /api/users/email/admin@slimbooks.app` answered without a token before
3.0.0 and returned that account's bcrypt hash to anyone who asked.

Two endpoints changed shape, which matters only to callers outside the bundled
UI:

- **`POST /api/pdf/page` accepts only URLs on this installation's own origin.**
- **`POST /api/email/send` delivers only to an address the install holds** — a
  client that is not soft-deleted, or a user.

Five unauthenticated user routes are gone; see the
[API reference](../development/api-reference.md#users--apiusers).

`/api/health` and `/api/health/detailed` now answer **503** when the database is
unreachable instead of 200. If you monitor them by status code, this is the
first release where that check means anything.

A migration runs on first boot to add the `audit_log` table. No action needed.

### To 2.3.0

**No operator action.** No migration runs, no environment variable changed and
the dump format is unchanged.

One thing that affects anything outside the bundled UI: **`PUT /api/users/:id`
no longer accepts `password_hash`** and returns **400** if it is sent. It was
previously in that endpoint's allowed-field list, so a caller could write a
hash straight into the column and bypass the password-strength check and the
bcrypt cost applied everywhere else. Use `POST /api/users/:id/password`, which
takes plaintext and hashes it server-side.

If you deploy with Docker, rebuild the image rather than reusing a cached one:
the build previously depended on a `certs/` directory that a fresh clone does
not have, and the compose health check called a `curl` the image does not
contain.

### To 2.2.0

**Instants are now stored as epoch milliseconds** rather than text
([ADR-0009](../adr/0009-instants-as-epoch-milliseconds.md)). Existing rows are
converted on the first boot after the upgrade. The conversion is idempotent and
resumes correctly if interrupted.

**Back up first.** As with any schema change.

Two things that affect anything outside the bundled UI:

- **The API sends these fields as JSON numbers**, not strings. The bundled UI
  is updated. Any other consumer of the API needs the same change.
- **A dump taken with 2.1.x will not import.** `TRANSFER_VERSION` is 2; export
  again with 2.2.0.

SQLite tables also become `STRICT`
([ADR-0011](../adr/0011-strict-sqlite-tables.md)), so a column's declared type
is now enforced by the engine.

### To 2.1.1

Timestamps were normalised to a single UTC text format, and twelve
SQLite-only statements that the portability sweep had missed were corrected.
No operator action.

### To 2.1.0

**MySQL and MariaDB became available** as an alternative backend
([ADR-0007](../adr/0007-two-backends-one-schema.md)). Existing installs need
change nothing — `DB_DRIVER` defaults to `sqlite` and keeps the behaviour they
already have.

Uploaded files can now live in the database (`STORAGE_DRIVER=database`), which
is what makes an ephemeral-filesystem host viable.

Moving an existing install to MySQL is an explicit export/import — see
[database backends](database-backends.md#moving-an-existing-install-to-mysql).

### To 2.0.0

The largest break. Read this before upgrading from 1.x.

**Four environment variables were removed and are now rejected at boot.** An
environment still carrying one fails to start, with a message naming the
replacement:

| Removed | Replacement |
|---|---|
| `ENABLE_HTTPS` | `TLS_MODE` (`off` \| `self` \| `proxy`) |
| `SSL_KEY_PATH` | `TLS_KEY_PATH` |
| `SSL_CERT_PATH` | `TLS_CERT_PATH` |
| `ENABLE_DEBUG_ENDPOINTS` | `FEATURE_DEBUG` (`auto` \| `on` \| `off`) |

They are rejected rather than aliased on purpose: `ENABLE_HTTPS` was read by
nothing, so an install that asked for HTTPS quietly served plain HTTP. Silently
ignoring it would have preserved exactly that failure.

**`CLIENT_URL` is now required.** The boot fails without it.

**The build tree changed** to `dist/client` + `dist/server`, and `server/dist/`
no longer exists. Production is one process: `node dist/server/index.js`, which
serves the API and the SPA together. If your deployment ran `vite preview`,
stop it — it is not a production server and is no longer part of the design
([ADR-0004](../adr/0004-one-build-tree-one-process.md)).

**Check where your database actually is.** Broken path resolution in earlier
versions could write production data to `server/data/slimbooks.db` while
development used `data/slimbooks.db`. If a database exists at a legacy location
and not at the configured one, 2.0.0 **refuses to start** and names both paths.
Move the file to the configured path, or point `DB_PATH` at it. The same rule
applies to stranded upload directories.

**Recurring invoices moved in-process.** Remove any crontab entry or external
scheduler calling `/api/cron` — the endpoint is only mounted when
`FEATURE_SCHEDULER=off`, and then requires admin authentication
([ADR-0006](../adr/0006-in-process-scheduler.md)).

**There is one environment file.** `.env.production` is gone; `.env` is read in
development and production alike. The Docker image no longer bakes one in —
previously it copied a template of placeholder values, so every container ran
with the published default signing secret unless something overrode it, and
nothing did. **Rotate your secrets as part of this upgrade** if you ran a
Docker deployment of 1.x: see [secrets](secrets.md).

## Downgrading

Not supported. Migrations move forward only.

Restore the backup you took, and run the older version against it.

## Related

- [Backup and restore](backup-and-restore.md)
- [Configuration reference](configuration.md#removed-variables)
- [CHANGELOG](../../CHANGELOG.md)
