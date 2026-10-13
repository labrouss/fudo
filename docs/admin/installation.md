# Installation

Fudo runs as four containers with Docker Compose: `db` (PostgreSQL 17 + TimescaleDB), `api`,
`worker` (checks, alerts, reports) and `web` (nginx serving the interface).

## Requirements

- Docker with the Compose plugin, on Linux (x86-64 or arm64)
- as a starting point, a VM with 2 CPU cores and 2 GB of memory (not a measured limit: watch the
  `worker` and `db` containers as you add monitors), and disk for the database volume
- network access from the Docker host to everything you want to monitor (checks run from the
  `worker` container)

## Install

```bash
git clone https://github.com/<you>/fudo.git && cd fudo
cp .env.example .env
```

Edit `.env` (no quotes, no spaces around `=`):

| Setting | What to put |
|---|---|
| `POSTGRES_PASSWORD` | a new password, **letters and digits only** (it becomes part of a connection URL) |
| `APP_SECRET` | at least 32 characters: `openssl rand -base64 48`. **Back it up**: it encrypts 2FA secrets and stored passwords |
| `PUBLIC_URL` | the address people open, e.g. `https://fudo.corp.local` (used in invitation and push links) |
| `WEB_PORT` | port on the host for the interface, default `8080` |

Then:

```bash
docker compose up -d --build
docker compose ps          # all services "running", db "healthy"
```

Open `http://<host>:8080` and follow the setup wizard (see [Getting started](../guide/getting-started.md)).
Database migrations run automatically when the API and worker start.

## HTTPS

Fudo can serve HTTPS with HTTP/2 itself, or sit behind your reverse proxy. Either way, set
`PUBLIC_URL=https://…` (links in emails and on-call messages) and keep `COOKIE_SECURE=auto`: session
cookies are then marked *Secure* whenever the browser uses HTTPS. **Settings › Connection** shows how
your browser reaches Fudo.

### Built-in (FUDO_TLS)

Browsers use HTTP/2 only over HTTPS, so the built-in web server needs a certificate:

| `FUDO_TLS` | |
|---|---|
| `off` (default) | plain HTTP on `WEB_PORT`; use this behind your own reverse proxy |
| `files` | your certificate: `fullchain.pem` (certificate followed by its chain) and `privkey.pem` in `FUDO_TLS_DIR`. Without them the container does not start (it never falls back to unencrypted HTTP) |
| `self-signed` | a certificate for `FUDO_TLS_HOSTNAME`, generated once and kept in the `tls` volume, so the exception you accept in the browser stays valid. For tests and labs |

```bash
# .env: your company CA's certificate for fudo.acme.local
FUDO_TLS=files
FUDO_TLS_DIR=./tls          # contains fullchain.pem and privkey.pem
WEB_TLS_PORT=443
WEB_PORT=80
PUBLIC_URL=https://fudo.acme.local
```

HTTPS is published on `WEB_TLS_PORT` (default `8443`); plain HTTP on `WEB_PORT` redirects there, except
push heartbeats (`/api/push/…`) and `/api/health`, which scripts and load balancers call over HTTP.
TLS 1.2 and 1.3 only. `FUDO_HSTS=true` adds a Strict-Transport-Security header; use it only with a
certificate browsers trust. The container's log warns when the certificate expires within 30 days;
to renew it, replace the two files and restart the `web` container.

### Behind your reverse proxy

Put Fudo behind your reverse proxy (nginx, Traefik, HAProxy, IIS ARR) and let it terminate TLS:

- proxy everything to `http://<host>:8080`,
- allow long-lived responses for `/api/live` (Server-Sent Events; disable response buffering),
- allow large uploads to `/api/backups/upload` and `/api/config/import/kuma/upload` (nginx:
  `client_max_body_size` of at least 1g and `proxy_request_buffering off;` for those locations), and
  up to 10 MB for the rest of `/api/`,
- set `PUBLIC_URL=https://…` and keep `COOKIE_SECURE=auto`, so session cookies are marked
  *Secure* whenever the browser uses HTTPS.
- enable HTTP/2 on the proxy if it supports it: browsers then use one connection for everything,
  instead of at most 6 per server over HTTP/1.1. (Fudo already shares one live-updates connection
  between the tabs of a browser, so it also works without.)

## Optional

- **Docker container monitors**: mount the Docker socket into the `worker` container and add its
  group (see the commented lines in `docker-compose.yml`).
- **SNMP traps**: the worker receives them on UDP `162` of the host (`TRAP_PORT` in `.env` to use
  another port). Open it in the host firewall for your devices. Fudo needs to see each device's
  own address: if every trap shows the Docker gateway address instead (some Docker setups NAT
  UDP), run the worker with `network_mode: host` or relay traps through a host that adds
  `snmpTrapAddress`. With several workers, set `TRAP_ENABLED=false` on all but one.
- **Extra languages or themes without rebuilding**: mount folders and set `LOCALES_DIR` /
  `THEMES_DIR` (see [Configuration](configuration.md)).

## Check the installation

`http://<host>:8080/api/health` reports the version, the database connection and whether
tenant isolation (row-level security) is enforced. The same information is on the Overview page
under **System status**.

## Update

`scripts/deploy-zip.sh` installs a release zip with minimal downtime and a way back:

```bash
sudo /docker-data/fudo/scripts/deploy-zip.sh                    # newest fudo-v*.zip in ~hpadmin
sudo /docker-data/fudo/scripts/deploy-zip.sh ~/fudo-v0.40.0.zip # a given zip
sudo /docker-data/fudo/scripts/deploy-zip.sh --rollback         # back to the previous version
```

1. It extracts the zip into a fresh folder, so files removed in the new version don't linger, and
   carries over your `.env`, `docker-compose.override.yml` and `tls/`.
2. It **builds the new images while the current version keeps running**. If the build fails,
   nothing changes.
3. It backs up the database (`pg_dump`, to `/docker-data/fudo-backups/`), then switches.
4. It waits until `/api/health` reports the new version as healthy; if it doesn't, it shows the
   logs and the rollback command.

The previous release, its images (tagged with its version) and the database backup are kept, so
`--rollback` needs no rebuild. A rollback restores the database **as it was before the upgrade**:
changes made since then are lost. The newest zip is chosen by version number, not file date. It
lists settings that are new in the release. Only one deployment runs at a time.

Settings: `BASE` (default `/docker-data`), `ZIP_DIR` (default the home of `hpadmin`),
`HEALTH_TIMEOUT` (seconds, default 180), `KEEP_BACKUPS` (default 5), `YES=1` (no questions).
