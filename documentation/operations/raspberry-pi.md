# Raspberry Pi

One host, walked through end to end. This is a worked example of the Docker
target from the [deployment guide](deployment.md), not a separate way of
running Slimbooks — a Pi runs the same artifact as everything else.

## Prerequisites

- A Raspberry Pi running Raspberry Pi OS
- SSH access
- An internet connection

## Automated setup

```bash
curl -fsSL https://raw.githubusercontent.com/rbenzing/slimbooks/main/scripts/setup-raspberry-pi.sh | bash
sudo reboot
```

`scripts/setup-raspberry-pi.sh` installs Docker and Docker Compose and Node.js,
creates `/opt/slimbooks`, configures the `ufw` firewall if it is present, adds
a systemd unit, sets up logrotate, installs a backup script at
`/usr/local/bin/slimbooks-backup`, and schedules it daily at 02:00 via cron.

> **Known issue: the script installs Node 18.** Slimbooks requires Node 24
> (`package.json` declares `engines: { node: ">=24 <25" }`, and `.nvmrc` pins
> 24). Install Node 24 yourself:
>
> ```bash
> curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
> sudo apt install -y nodejs
> ```
>
> This only matters if you run Slimbooks directly with `npm start`. Under
> Docker the image supplies its own Node 24 and the host's version is
> irrelevant. Repair of the deployment scripts is part of
> [spec 002](../specs/002-deployment-artifacts.md).

Then:

```bash
cd /opt/slimbooks
git clone https://github.com/rbenzing/slimbooks.git .

./scripts/generate-secrets.sh
nano .env                                            # review CLIENT_URL, CORS_ORIGIN

cd scripts && ./generate-certificates.sh && cd ..     # compose sets TLS_MODE=self

./scripts/deploy.sh
```

The application is then reachable at `https://your-pi-ip:8080`.

> `scripts/deploy.sh` hardcodes `PORT=8080` and a `logs` directory the runtime
> does not use. It works, but it does not reflect the current runtime; see
> [spec 002](../specs/002-deployment-artifacts.md).

## Manual setup

If you would rather not run the script.

### 1. System preparation

```bash
sudo apt update && sudo apt upgrade -y

# Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker $USER

# Node.js 24 — required by package.json
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

Modern Docker includes Compose as `docker compose`; no separate install is
needed.

### 2. Application

```bash
sudo mkdir -p /opt/slimbooks
sudo chown $USER:$USER /opt/slimbooks
cd /opt/slimbooks

git clone https://github.com/rbenzing/slimbooks.git .
```

### 3. Secrets

**Do this before exposing the Pi to any network.** Left blank, the application
signs tokens with a value published in this repository.

```bash
./scripts/generate-secrets.sh
```

This creates `.env` from `.env.example` with all three secrets filled in,
backing up any existing `.env` first. Full detail, including doing it by hand,
is in [secrets](secrets.md).

### 4. Build and run

```bash
npm ci
npm run build

docker compose up -d
```

`npm ci --omit=dev` is the production install; the full `npm ci` above is
needed because `npm run build` uses dev dependencies. The Docker image does
both stages itself, so building on the host is only necessary if you intend to
run `npm start` directly.

## Firewall

```bash
sudo ufw enable
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 8080/tcp    # Slimbooks
```

## Monitoring

```bash
curl -k https://localhost:8080/api/health   # -k because the cert is self-signed
docker compose logs -f
docker compose ps
```

Container logs are capped by the json-file driver at 3 files × 10 MB.

## Backups

The setup script installs `/usr/local/bin/slimbooks-backup` and runs it daily
at 02:00.

```bash
/usr/local/bin/slimbooks-backup      # run one now
ls -la /opt/slimbooks-backups/
```

It uses `sqlite3 .backup` when available — which is safe against a running
server, unlike copying a WAL database — and falls back to `cp` otherwise. It
also archives `uploads/`, and deletes both kinds of artifact after 7 days.

If no database is found it warns and backs up nothing rather than silently
archiving an empty directory. See [backup and restore](backup-and-restore.md).

## Troubleshooting

**The container will not start.**

```bash
docker compose logs
docker compose config
```

**Port already in use.**

```bash
sudo netstat -tulpn | grep 8080
```

Change the host side of the mapping in `docker-compose.yml`.

**Data directory permissions.** The container runs as UID 1001; `./data` and
`./uploads` must be writable by it.

General boot failures and their causes are in
[troubleshooting](troubleshooting.md).

## Updating

```bash
cd /opt/slimbooks
git pull
./scripts/deploy.sh
```

Migrations run automatically at boot. Back up first — see
[upgrading](upgrading.md).
