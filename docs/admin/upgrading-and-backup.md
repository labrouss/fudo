# Upgrading and backup

## Upgrade

1. Read the [changelog](../../CHANGELOG.md) for the versions in between.
2. Back up the database (below).
3. Get the new version and rebuild:

```bash
git pull                    # or unpack the new release over the old folder, keeping .env
docker compose up -d --build
```

Migrations run automatically at start-up (in order, one transaction each, recorded in
`schema_migrations`). `/api/health` shows the new version.

## Back up

Superadmins manage backups under **Settings › Backups**:

- **Create backup** writes a backup of the current state; download it from the list. Tick
  *Include check history* to add the raw check results (response-time charts of the past); they
  can make the file much larger. Everything else (configuration, users, incidents, availability
  and status history, reports, audit log) is always included.
- **Scheduled backups** run daily or weekly at a chosen time and keep the newest N; manual
  backups are never deleted automatically.
- Each backup is **encrypted with a passphrase** (AES-256-GCM, key derived with scrypt). Keep the
  passphrase somewhere safe, apart from the backups: without it a backup cannot be restored.

Backups are written to `BACKUP_DIR` (in Docker the `backups` volume, mounted at `/backups` in the
`api` and `worker` containers). **Copy them off the server** as well (another disk, a NAS, cloud
storage): a backup on the same disk does not survive a disk failure.

A backup does **not** depend on `APP_SECRET`: secrets inside it (2FA keys, SMTP and monitor
passwords, channel settings) are protected by the passphrase and re-encrypted for the server you
restore on. That is what lets you move Fudo to a new server.

### From the command line

The database can also be dumped directly (keep `APP_SECRET` with such dumps: secrets in them are
encrypted with it):

```bash
docker compose exec db pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > fudo-$(date +%F).dump
```

Configuration can also be kept as YAML (see
[Configuration as code](../guide/configuration-as-code.md)), but that is not a backup: it has no
history, incidents or secrets.

## Restore

**Settings › Backups › Restore…** on a backup in the list (use **Upload backup** for a file from
elsewhere):

1. enter the passphrase: Fudo checks it and shows what the backup contains,
2. type the organization name of this server to confirm,
3. Fudo first saves a backup of the current state (*Before restore*, same passphrase), then
   replaces all data in one transaction. Checks pause meanwhile; everyone is signed out and signs
   in again with the accounts from the backup.

A wrong passphrase, a damaged or altered file, or a backup from a newer Fudo version changes
nothing. Backups from older Fudo versions can be restored on newer ones, not the other way round.

### Moving to a new server

Install Fudo on the new server (see [Installation](installation.md)), complete the setup wizard
with a temporary administrator, upload the backup under **Settings › Backups** and restore it.
The new server can have a different `APP_SECRET`.

### From a command-line dump

Into an empty database, with the same `APP_SECRET` as when the dump was made:

```bash
docker compose up -d db
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < fudo-2026-10-01.dump
docker compose up -d
```
