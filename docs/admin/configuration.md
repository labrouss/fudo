# Configuration

Settings come from environment variables (the `.env` file with Docker Compose). Write values
without quotes (`PUBLIC_URL=https://fudo.example.com`). If a value is invalid, the `api` and
`worker` containers stop at start-up and print the exact value they received
(`docker compose logs api`); `docker compose config | grep PUBLIC_URL` shows what Compose passes in.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string (set by `docker-compose.yml` from the `POSTGRES_*` values) |
| `APP_SECRET` | yes | at least 32 characters; signs sessions and encrypts stored secrets. **Back it up; never change it** on a running installation |
| `PUBLIC_URL` | recommended | the address users open; used in invitation, push and notification links |
| `API_PORT` | no | default `3000` |
| `SESSION_TTL_HOURS` | no | session lifetime, default `12` |
| `COOKIE_SECURE` | no | `auto` (default: Secure over HTTPS), `true`, `false` |
| `LOG_LEVEL` | no | `info` (default), `debug`, `warn`, … |
| `CHECK_CONCURRENCY` | no | checks the worker runs in parallel, default `50` |
| `TRAP_PORT` | no | host UDP port for SNMP traps (docker-compose), default `162` |
| `TRAP_ENABLED` | no | `false` turns the worker's trap receiver off (e.g. on extra workers) |
| `BACKUP_DIR` | recommended | folder for backups made in Settings and by the schedule, shared by `api` and `worker` (Docker: `/backups`, volume `backups`). Without it, a temporary folder is used |
| `LOCALES_DIR` | no | folder with extra or corrected language files |
| `THEMES_DIR` | no | folder with extra themes |
| `MIGRATIONS_DIR` | no | override the migrations location (set automatically in Docker) |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Compose | database container credentials; use letters and digits in the password |
| `WEB_PORT` | Compose | published port of the interface, default `8080` |
| `WEB_TLS_PORT` | Compose | published HTTPS port when `FUDO_TLS` is on, default `8443` |
| `FUDO_TLS` | web | `off` (default), `files` or `self-signed`: HTTPS with HTTP/2 in the built-in web server (see Installation › HTTPS) |
| `FUDO_TLS_DIR` | Compose | folder with `fullchain.pem` and `privkey.pem` for `FUDO_TLS=files` (default: the `tls` volume) |
| `FUDO_TLS_HOSTNAME` | web | name in a self-signed certificate, default the container's host name |
| `FUDO_HSTS` | web | `true` adds Strict-Transport-Security (only with a trusted certificate) |

## Languages and themes without rebuilding

Mount folders into the `api` container and point the variables at them:

```yaml
    environment:
      LOCALES_DIR: /locales-extra
      THEMES_DIR: /themes-extra
    volumes:
      - ./locales-extra:/locales-extra:ro
      - ./themes-extra:/themes-extra:ro
```

Files there are picked up without a restart. A file with the same name as a built-in one is
merged over it (to correct a few translations or re-brand a theme). See `locales/README.md` and
`themes/README.md`.

## Organization settings

Everything else (email server, notification language, users, tenants) is configured in the web
interface; see [Settings](../guide/settings.md).
