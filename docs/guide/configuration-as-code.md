# Configuration as code

**Configuration** exports the current scope (assets, monitors, applications and their
dependencies) as YAML and imports it back. Keep it in git, clone a tenant's setup into another
tenant, or automate it through the API.

```yaml
assets:
  - name: FIN-APPLIANCE-01
    kind: other
    dependsOn: [Core-SW-01]          # shared assets are referenced by name
monitors:
  - name: ERP web
    type: http
    config: { url: https://erp.corp.local/health, acceptedStatus: 200-299 }
    asset: FIN-APPLIANCE-01          # the asset this monitor checks
    tags: [prod]
applications:
  - name: ERP Production
    criticality: high
    slaTarget: 99.9
    members: [ERP web, { monitor: ERP SQL, required: false }]
    notify: [ERP team]               # notification channels, by name
```

## How import works

- **Preview first**: it lists what will be created or changed, field by field, and reports
  mistakes with their line numbers. **Apply** is all-or-nothing.
- **Partial files are safe**: an item in the file is authoritative for that item; items not in
  the file are left as they are.
- **Not included**: notification channels and credentials (they hold secrets) and maintenance
  windows. Imported push monitors get new URLs. Applications list their channels by name in
  `notify`; leaving `notify` out keeps an application's current channels.
- **Shared credentials**: a monitor names the one it uses (`credential: iLO read-only`). The
  credential itself is not exported and must already exist in the target scope.

## Through the API

```bash
curl -fsS -X POST https://fudo.corp.local/api/config/import \
  -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" \
  -H "Content-Type: application/json" -d '{"yaml": "…", "dryRun": true}'
```

Needs an API token with the **manage** permission (see [Users and access](users-and-access.md)).

## Import from Uptime Kuma

**Configuration › Import from Uptime Kuma** reads the JSON backup of Uptime Kuma 1.x (*Settings › Backup › Export*) or the database file `kuma.db` of 1.x and 2.x (in Kuma's data folder). You see a preview first; nothing changes until you import.

HTTP, keyword and simple JSON checks, TCP port, ping, DNS and push monitors are imported with their intervals, retries, tags and paused state; HTTPS certificate expiry becomes a separate certificate monitor, and groups become applications. Notifications become channels with the same settings (email ones use the mail server set in Settings) and start disabled unless you choose otherwise. Items whose name already exists are left alone, so importing again is safe. Everything that cannot be imported faithfully (for example Docker or database monitors, or upside-down mode) is listed with the reason.
