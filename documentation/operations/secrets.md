# Secrets

Slimbooks signs sessions with three secrets. **Left blank, it signs them with
values published in this repository, which means anyone can mint a valid
session for your install.**

| Variable | Signs |
|---|---|
| `JWT_SECRET` | Access tokens |
| `JWT_REFRESH_SECRET` | Refresh tokens |
| `SESSION_SECRET` | Sessions |

Generate them before exposing the install to any network.

## Generating them

Each script creates `.env` from `.env.example` and fills in all three secrets,
taking a **timestamped backup** of any existing `.env` first.

```
scripts/
├── generate-secrets.sh       # Unix, Linux, macOS
├── Generate-Secrets.ps1      # PowerShell, cross-platform
└── generate-secrets.bat      # Windows wrapper for the above
```

### Linux, macOS, Docker hosts

```bash
./scripts/generate-secrets.sh
```

Requires `openssl`.

### Windows

```powershell
.\scripts\Generate-Secrets.ps1
```

Uses the .NET cryptographic RNG. It also runs on macOS and Linux under
PowerShell Core.

| Parameter | Effect |
|---|---|
| `-Force` | Overwrite an existing `.env` without prompting |
| `-SecretLength <n>` | Secret length in characters (default 64) |

`.\scripts\generate-secrets.bat` is a wrapper that calls the PowerShell script
and handles the execution-policy prompt.

## Order matters

The scripts **write** `.env`, replacing what is there. Run one *instead of*
`cp .env.example .env`, or before you edit anything else — otherwise your edits
are backed up and replaced.

## Doing it by hand

```bash
openssl rand -base64 64 | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-64
```

Run it three times and paste each result into a different variable.

**`tr -dc 'A-Za-z0-9'` is not optional.** `openssl rand -base64` wraps its
output, and a secret containing a line break spans two lines in `.env` — which
truncates the value and breaks any script that sources the file.

## Where the values come from

`.env.example` is the single source for which variables exist. The generator
copies it rather than emitting its own list: it used to emit a hardcoded list,
which made it a third copy to keep in step, and it had already drifted —
omitting nine variables the application reads.

The generator rewrites the **whole line, including the variable name**. An
earlier documented approach, `sed 's/PLACEHOLDER.*/$SECRET/'`, could leave a
bare secret on a line with no variable attached.

## Handling

- **Never commit `.env`.** It is gitignored; keep it that way.
- Backups written by the scripts are timestamped and sit next to `.env` — they
  contain secrets too, so treat them the same way.
- Review every value in `.env` before a production deployment, not just the
  three secrets.

## Rotating

Replace the values and restart. All existing sessions become invalid
immediately, and every user signs in again — which is the intended effect if
you are rotating because something leaked.

Under Docker, `.env` is passed in at run time through `env_file` rather than
baked into the image, so a key is rotated by restarting the container rather
than rebuilding it.

## Troubleshooting

**PowerShell refuses to run the script.** Use the `.bat` wrapper, or bypass the
policy for this one invocation:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Generate-Secrets.ps1
```

To change it for your user instead (rather than per invocation):

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**No PowerShell.** It ships with Windows 10 and 11. On older Windows, or on
Linux and macOS, install
[PowerShell Core](https://github.com/PowerShell/PowerShell).

**No `openssl`.** Use the PowerShell script, or generate the values with Node:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

Strip any line breaks before pasting.

## Related

- [Configuration reference](configuration.md) — every variable, including the
  token lifetimes these secrets sign
- [TLS certificates](deployment.md#tls) — `scripts/generate-certificates.sh`,
  a different thing with a similar name
