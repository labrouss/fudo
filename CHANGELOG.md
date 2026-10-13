# Changelog

All notable changes per delivered version. Feature IDs (F-…) in older entries refer to the feature table of the original development README; the current documentation is in [docs/](docs/README.md).

## [0.40.1] - 2026-10-13
Project website.

### Added
- **Website** in `site/` for GitHub Pages: what Fudo does, an animation of a core switch failing (one incident instead of a page per check), a tour of the interface with screenshots of a demo data center, the list of checks, and the three install commands. Static HTML with self-hosted IBM Plex fonts: no build step, no third-party requests. Works on phones, with keyboard navigation and reduced motion respected.
- `.github/workflows/pages.yml` publishes `site/` whenever it changes (enable once under *Settings › Pages › Source: GitHub Actions*). Repository links are worked out from the Pages address.

### Changed
- README: the overview screenshot shows the current interface.
- The repository is https://github.com/labrouss/fudo: README, installation guide, the website and *Help › Source code* in the interface point to it.
- CI and website workflows: pnpm version taken only from `packageManager` in package.json (fixes "Multiple versions of pnpm specified"); actions updated to their Node 24 releases (checkout v6, setup-node v6, pnpm/action-setup v5, configure-pages v6, upload-pages-artifact v5, deploy-pages v5); runners pinned to `ubuntu-24.04`.

## [0.40.0] - 2026-10-12
Search in the application members picker.

### Changed
- Application page, **Add monitors**: a search box, as in an asset's *Add existing*. Every word must match the monitor's name, type, asset or a tag (`core ping`); ticked monitors stay ticked while you filter, so you can search for several in turn and add them together. Each monitor now shows its type and asset.
- Dialogs focus their search box when they open (application members, asset *Add existing*).

## [0.39.0] - 2026-10-12
Tabbed Profile page.

### Changed
- **Profile** on tabs: *Your details*, *Password*, *Two-factor authentication*, *Sessions* and *On-call* (your on-call shifts, contact methods and notification steps together, since the steps use the contact methods).
- Same behaviour as Settings: the open tab is kept in the address (`/profile#sessions`), links open it, arrow keys/Home/End move between tabs; the sidebar link returns to the first tab. Settings and Profile now share one tab component, which also follows in-app links and back/forward.
- Help: *Users and access* lists the Profile tabs, in all 13 languages.

## [0.38.0] - 2026-10-12
Tabbed Settings page.

### Changed
- **Settings** shows one section at a time, on tabs: *Preferences*, then for superadmins (after a separator) *Notification language*, *Email (SMTP)*, *Connection*, *Data retention*, *Telegram bot*, *Backups*. Everyone else sees only their preferences, without tabs.
- The open tab is kept in the address (`/settings#retention`): reloading stays on it, and links and bookmarks open it directly. Keyboard: arrow keys, Home and End move between tabs (mirrored in right-to-left languages); the tab bar scrolls on its own on narrow screens.
- Help: *Settings* mentions the tabs, in all 13 languages.

## [0.37.0] - 2026-10-12
Existing monitors on assets.

### Added
- Asset page, *Checks on this asset*: **Add existing** next to **New monitor**. Picks monitors of the current scope, grouped *Not on an asset* / *On another asset* (with the asset they are on), with a search; a monitor on another asset moves to this one (the dialog says how many).
- **Remove** per monitor takes it off the asset; the monitor stays.
- A tenant can put its own monitors on a shared Global asset (also with *New monitor*), without being able to edit the asset itself. The Global scope only uses Global monitors.
- API: `POST /assets/{id}/monitors` (`monitorIds`), `DELETE /assets/{id}/monitors/{monitorId}`. Audited: `asset.monitors_added` (with where a monitor moved from), `asset.monitor_removed`.
- Help: *Concepts* explains both buttons, in all 13 languages.

## [0.36.0] - 2026-10-12
Discovery.

### Added
- **Discovery** page (menu *Discovery*, Global infrastructure scope, superadmins and infrastructure admins): finds devices and suggests an asset and monitors for each. Runs on demand in the worker, with live progress; a running discovery can be stopped, finished ones deleted.
- Four sources:
  - **Subnet scan**: networks (`10.0.12.0/24`), ranges (`10.0.20.10-60`), addresses or host names, at most 4096 addresses. Each address gets a ping, a few TCP ports, SNMP with the chosen credentials (first one that answers), and over HTTPS Redfish (iLO, iDRAC) and the vSphere API (ESXi or vCenter). Name from SNMP, reverse DNS or the certificate.
  - **vCenter inventory**: the vCenter, its ESXi hosts (tagged `cluster:<name>`) and VMs with address and OS from VMware Tools (optionally powered-off VMs); each VM depends on its host.
  - **Switch neighbours (LLDP/CDP)**: who is connected to which switch port; servers, hosts and storage behind a port depend on that switch, links between switches are listed. Up to 512 switches.
  - **HPE OneView**: Synergy frames, compute modules with their iLO address and interconnects; each depends on its frame.
- Recognition: vendor from the SNMP enterprise number, kind from the description (switch, FC switch, firewall, router, storage array, UPS, Windows, Linux…), Redfish = management controller, open ports as a last hint. Each kind suggests a monitor template and asset kind.
- **Review, then create**: per device an editable name, what it looks like, the suggested template (or *Ping only*, *Asset only*). Devices already known in any scope (asset with that address or name, or monitors on that address) are hidden by default and show where they are. Tick devices, choose **Create in** (Global or a tenant) and tags, **Preview** (the configuration import preview), **Create**. Dependencies come along when both devices are created, or when the one depended on already exists in that scope or Global.
- Credentials are shared credentials of the Global scope (SNMP for subnet/LLDP, account and password for vCenter/OneView), read by the worker only.
- API: `GET/POST /discovery/runs`, `GET/DELETE /discovery/runs/{id}`, `POST /discovery/runs/{id}/cancel`. Audited: `discovery.started`, `discovery.deleted`.
- Help: *Discovery* guide page in all 13 languages.

### Security
- Discovery is limited to the Global scope with manage rights; results are protected by row-level security. Run parameters never contain secrets.

## [0.35.0] - 2026-10-12
SNMP traps.

### Added
- **Trap receiver** in the worker (SNMP v1 and v2c, UDP; docker-compose publishes host port `162`, `TRAP_PORT` in `.env` to change it). v1 traps are converted to their v2 form (RFC 3584); a relay's `snmpTrapAddress` names the real device.
- **SNMP traps** monitor (passive): takes the traps of the devices in *From* (addresses, host names, IPv4 ranges), optionally only those carrying a *Community* (or a shared SNMP community credential). Problem traps: the standard ones (link down, cold/warm start, authentication failure), only listed traps (names or OIDs, an OID covering its whole subtree, e.g. a vendor's enterprise prefix) or any trap; optionally only when a field contains a text. Down (or Degraded) while a problem is open — within a second of the trap, with incidents, notifications and on-call paging as for any check.
- Problems per trap and interface: **link up** ends the link down of the same interface; listed *clearing traps* end problems too.
- **Clearing**: automatically when no new trap arrives for a while (default 30 minutes), or only by hand — **Clear** / **Clear all** on the monitor page, until the next matching trap (audited).
- **Traps** page (menu *Traps*): receiver state (receiving on UDP 162, or why not), counts for the last hour and day, every trap with its fields, sender, asset and what its monitor did (problem, cleared, not a problem); sortable, filterable, "only traps without a monitor". **Create monitor** fills in a trap monitor for a trap's device.
- Traps no monitor takes are kept under the tenant of the asset with that address, else in the Global infrastructure scope.
- Monitor page of a trap monitor: open traps (with when they clear) and the traps it received.
- **Data retention**: *SNMP traps*, 30 days by default. Traps are part of backups only with history, like raw check results.
- API: `GET /traps`, `GET /traps/status`, `GET /monitors/{id}/trap-problems`, `POST /monitors/{id}/traps/clear`.
- Help: *SNMP traps* on the *Monitors* page in all 13 languages; installation and configuration notes for the port.

### Security
- Communities are checked but never stored (a relay's copy in the trap is dropped too). Traps belong to the scope of the monitor or asset that matched them (row-level security); receiver-wide numbers only in the Global scope.
- A sender that floods traps is rate-limited (50 per second, bursts of 500); dropped traps are counted.

## [0.34.0] - 2026-10-12
Network interface traffic over SNMP.

### Added
- **Network interface (SNMP)** monitor: one port of a switch, router or firewall. Link state, traffic in and out in bit/s and % of the link speed, and errors per minute. Down when the link is down; Degraded when testing/dormant, when the busier direction reaches *Degraded from utilisation* (default 80 %) or when errors exceed the limit; optional *Down from utilisation*. A port disabled on purpose is reported Up (or Down, if chosen). *Link speed* overrides a wrongly reported speed.
- **Find interfaces…** in the monitor form lists the device's interfaces (name, description/alias, speed, state; sortable, filterable, "only up"). Choose one, or tick several when adding: each becomes a monitor named after the interface, with the form's settings (including a shared credential).
- Interfaces are kept by **name** (ifName, ifDescr or ifAlias; an index also works), so a device that renumbers its interfaces after a restart keeps being watched correctly.
- Rates from **64-bit counters** (32-bit on SNMP v1, with wrap-around handled). The first check and *Test now* read twice, two seconds apart; later checks use the reading kept from the previous check, so they cost one request. After a device restart the pair is skipped: no false spikes.
- **Traffic chart** on the monitor page: in and out, link speed, Degraded and Down lines.
- **SNMP** monitor: *Compare: its change per second* for any counter (SAN port frames, firewall sessions, UPS events…).
- Shared SNMP community and SNMPv3 credentials work with the new monitor type; import/export as usual.
- API: `POST /monitors/snmp-interfaces` (the interface list); results carry `inBps`, `outBps`, `inPct`, `outPct`, `errPerMin`, `speedMbps`.
- Help: *Network interfaces* on the *Monitors* page, in all 13 languages.

## [0.33.0] - 2026-10-12
Shared credentials.

### Added
- **Credentials** page (menu *Credentials*): one account, SNMP community or SSH key for many monitors. Kinds: *Account and password* (iLO/Redfish health and temperature, vCenter VM, MySQL, PostgreSQL, SQL Server, Redis, MongoDB, LDAP sign-in, SSH), *SSH key*, *SNMP community (v1, v2c)* and *SNMPv3 user*. When a password changes, edit the credential once: every monitor using it checks again immediately with the new value.
- **Monitor form**: types that sign in offer *Enter it here* or *Use a shared credential*; with a credential, its fields leave the form and are not stored with the monitor. *Test now* uses the credential. The monitor page shows which credential a monitor uses.
- **Same account in several monitors**: the page lists monitors that already store the same account and password (compared on the server by a keyed hash) and turns each group into a shared credential in one step. The password is copied on the server; nobody needs to know it.
- **Use for…** points more monitors at a credential; their own account and secret are removed.
- **Bulk add** of inlet temperature checks can use a shared credential instead of a user and password.
- **Configuration as code**: monitors name their credential (`credential: iLO read-only`, any case); import checks that it exists in the scope and fits the monitor type. Credentials themselves are not exported.
- API: `GET/POST /credentials`, `PUT/DELETE /credentials/{id}`, `POST /credentials/{id}/attach`, `GET /credentials/suggestions`, `POST /credentials/from-monitors`; monitors accept and return `credentialId` (and `credentialName`).
- Help: *Shared credentials* on the *Monitors* page and a note in *Configuration as code*, in all 13 languages.

### Security
- Secrets of a credential are write-only, like a monitor's own: AES-256-GCM at rest with their own key derived from `APP_SECRET`, never returned, shown or exported. Lists show the account and which monitors use it.
- Credentials belong to one scope: a tenant's monitors can only use that tenant's credentials, Global infrastructure monitors only global ones (enforced by the API, the worker and row-level security).
- A credential in use cannot be deleted, and its kind cannot change. A monitor that stops using a credential must get its own secret again.
- Audit log entries for created, changed, attached and deleted credentials; a change lists the names of the secrets that changed, never their values.
- Backups carry credentials; restoring with another `APP_SECRET` re-encrypts them like monitor secrets. A credential that cannot be decrypted turns its monitors Down with a clear message.

## [0.32.0] - 2026-10-12
Sortable, filterable lists; applications and assets on the monitor list.

### Added
- **Sort any long list by any column**: click a column header to sort, again to reverse, a third time for the default order. Statuses and severities sort worst first, dates newest first, names naturally (`srv-2` before `srv-10`) in the interface language; empty values always last. The sort is remembered per list in your browser.
- **Filter box** on every long list: searches every column (plus tags, descriptions, e-mail addresses…), ignores case and accents (`βαση` finds `Βάση`), needs every word to match, and shows how many rows match, with a way to clear it.
- Covers monitors, assets, incidents, users, tenants, the audit log, notification channels, maintenance windows and recurring maintenance, API tokens, backups, status pages, scheduled reports, the report preview and the temperature page. The applications page gets the filter and a *Sort by* choice.
- **Monitor list: Asset and Applications columns**, both links; an optional membership has a dashed outline. The filter also finds monitors by asset and application. The monitor API returns each monitor's `applications` (with `required`).
- Help: *The list* on the *Monitors* page, in all 13 languages.

### Changed
- Resolved incidents are listed most recently resolved first, so the list's limit of 200 keeps the newest (before, it kept the most severe of all time). When a list reaches the limit, it says so and points to the search.
- The audit log's sorting and filtering apply to the events loaded so far; the page says so when it matters.

## [0.31.2] - 2026-10-11
Safer updates.

### Added
- **`scripts/deploy-zip.sh`**: installs a release zip with minimal downtime and a way back. It builds the new images while the current version keeps running (a failed build changes nothing), backs up the database before switching, waits until `/api/health` reports the new version healthy, and keeps the previous release, its images and the backup for **`--rollback`**. Extracts into a fresh folder (no leftover files from older versions), carries over `.env`, `docker-compose.override.yml` and `tls/`, picks the newest zip by version number, lists new settings, and allows one deployment at a time. Installation guide: *Update*.

## [0.31.1] - 2026-10-04
Fixes the Docker image build of 0.30.0 and 0.31.0.

### Fixed
- **Building the `api` and `worker` images failed** at `pnpm deploy` with `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC: No catalog entry 'vite'`. The LDAP library `ldapts` 8.2.0 (added in 0.30.0) was published with unresolved `catalog:` versions in its manifest; every later release has the same problem. `ldapts` is now pinned to 8.1.8, the last release without it. The LDAP monitor behaves identically (checked against a real OpenLDAP server: LDAPS, StartTLS, sign-in, searches, certificate checks).

### Added
- `pnpm check:deploy`: the production install of the Docker images without Docker, starting clean (no `node_modules`, empty pnpm store and cache), so dependency problems that only appear in an image build are caught before release. CI runs it on every push.

## [0.31.0] - 2026-10-04
Data center temperature.

### Added
- **Temperature** page (menu *Temperature*): every inlet temperature sensor, grouped by its `room:<name>` tag and sorted hottest first, with rack (`rack:<name>`), current value coloured by its thresholds, a 6-hour sparkline with the Degraded line, change over 15 minutes, 24-hour range and status; tiles for sensors reporting, average, warmest, hot and rising fast. Tenants also see shared (global) sensors.
- **Rate of rise**: an inlet sensor turns Degraded when its temperature rises fast (default 3 °C within 15 minutes), even below its thresholds; the message says by how much.
- **Room temperature** monitor (*Create room alert* on the page): all inlet sensors of a room together. Down when several are hot, each by its own Degraded temperature (default 3: a cooling problem rather than one hot server); Degraded when one is hot or several rise fast. Readings older than 10 minutes are ignored, and a room without recent readings is not reported as fine. It opens incidents like any monitor, so ownership, on-call and status pages work for it.
- **Add sensors**: bulk add for inlet temperature with one shared read-only account (and Degraded/Down temperatures) for a list of BMC addresses; bulk add supports shared settings for single-check types.
- API: `GET /api/temperature`. Checks that need recent data get it from the scheduler (and from *Test*).
- Help: *Data center temperature* in the *Monitors* guide, in all 13 languages.

## [0.30.0] - 2026-10-04
LDAP / Active Directory monitor, inlet temperature monitor.

### Added
- **LDAP / Active Directory** monitor: LDAPS, StartTLS or plain; *Directory answers* reads the root DSE without an account (Active Directory: Degraded while the domain controller is not synchronized, `isSynchronized`); *Sign in with an account* binds as a service account, optionally with a search that must find at least N entries. Active Directory's reasons are named: locked out, password expired or must be changed, account disabled or expired, time or workstation restrictions. The password is stored encrypted like other monitor secrets.
- **Inlet temperature (iLO / Redfish)** monitor: the air temperature entering a server, read from its BMC, i.e. the temperature in front of its rack. Finds the intake sensor automatically (Redfish `PhysicalContext: Intake`, e.g. HPE `01-Inlet Ambient`, Dell `System Board Inlet Temp`), or a named sensor; reads `Chassis/…/Thermal` and falls back to `ThermalSubsystem/ThermalMetrics` (newer Redfish). Degraded from 27 °C (top of ASHRAE's recommended range), Down from 32 °C (class A1 allowable limit), both adjustable. An absent sensor is reported as such, never as a reading.
- The monitor page charts the inlet temperature (average and maximum, with the Degraded and Down thresholds as lines) instead of response time. API: `GET /api/monitors/:id/metric?key=temperatureC&range=…`.
- The version is shown next to *Fudo* at the top of the sidebar.
- Help: both monitor types in the *Monitors* guide, in all 13 languages.

### Fixed
- The sidebar could not be scrolled: when zoomed in or in a short window, its lower part (Profile, Settings, the user) was cut off. It now scrolls on its own.
- Validation messages of the SNMP, SSH, Docker, vCenter, domain-expiry and database monitors were never translated (the translation catalogue did not read their definitions). All 19 are now translated.

### Changed
- Both Redfish monitors share one Redfish client (authentication, certificates, error handling).
- New dependency: `ldapts`.

## [0.29.0] - 2026-10-04
HTTPS with HTTP/2 in the built-in web server.

### Added
- **`FUDO_TLS`** for the `web` container: `off` (default, unchanged), `files` (your certificate: `fullchain.pem` and `privkey.pem`) or `self-signed` (generated once, kept across restarts). With TLS, the interface and API are served over HTTPS with **HTTP/2** (TLS 1.2 and 1.3 only), so browsers use one connection for everything; session cookies become *Secure* automatically.
- Plain HTTP redirects to HTTPS (with the published port), except push heartbeats and `/api/health`, which scripts and load balancers call over HTTP. Optional HSTS (`FUDO_HSTS=true`).
- Safe by design: `files` without a certificate stops the container instead of falling back to unencrypted HTTP; the log warns 30 days before the certificate expires.
- **Settings › Connection** (superadmins): how this browser reaches Fudo (HTTPS with HTTP/2, HTTP/1.1, or a warning for unencrypted HTTP).
- Compose: `WEB_TLS_PORT` (default 8443), `FUDO_TLS`, `FUDO_TLS_DIR`, `FUDO_TLS_HOSTNAME`, `FUDO_HSTS`, and a `tls` volume. Installation guide: *HTTPS › Built-in*.

### Changed
- The web container's nginx configuration is written at start (`docker/nginx/40-fudo.sh`) from shared locations (`docker/nginx/locations.conf`); `docker/nginx.conf` is gone. It adapts to nginx before and after 1.25.1 (`http2 on`).

## [0.28.0] - 2026-10-04
Import from Uptime Kuma.

### Added
- **Configuration › Import from Uptime Kuma**: reads the JSON backup of Kuma 1.x or the database file `kuma.db` of 1.x and 2.x (read in place, so a large heartbeat history is never loaded into memory; up to 1 GB). Preview first, then import.
- Imported: HTTP, keyword and simple JSON-path checks (status codes, headers, basic authentication, body, redirects, TLS), TCP port, ping, DNS and push monitors, with intervals, retries, timeouts, tags and paused state; HTTPS certificate expiry as a separate certificate monitor; **groups as applications** (with their monitors as members).
- **Notifications become channels** with the same settings (Fudo runs Kuma's own notification providers); Kuma email notifications become Fudo email channels. Channels are linked to the applications of the groups that used them, and start **disabled** unless chosen otherwise.
- Nothing is dropped silently: whatever cannot be imported faithfully is listed with the reason (other monitor types, upside-down mode, JSONata expressions, unsupported methods or authentication…), and every adjustment as a warning (intervals fitted to Fudo's limits, credentials moved into a header, new push addresses…).
- Safe to repeat: items whose name already exists are never changed. The upload is deleted from disk at once; the parsed data is kept 30 minutes for the same user and scope only.
- API: `PUT /api/config/import/kuma/upload`, `POST /api/config/import/kuma/:id`. New package `@fudo/kuma-import`.
- Help: *Import from Uptime Kuma* section in all 13 languages.

### Changed
- Requires Node.js 22.13 or later (built-in SQLite). The built-in nginx accepts Kuma database uploads up to 1 GB.

### Fixed
- Bundles kept stripping the `node:` prefix from built-in imports; modules that exist only with it (`node:sqlite`) failed to load.

## [0.27.0] - 2026-10-04
Data retention.

### Added
- **Settings › Data retention** (superadmins): how long to keep raw check results, hourly and daily summaries, status history, resolved incidents, the notification log, the audit log and finished maintenance windows (days, or *keep forever* where sensible), with the space each uses and the last cleanup.
- Check results and summaries follow TimescaleDB retention policies, updated on save; everything else is removed by the worker's hourly cleanup in small batches (each in its own short transaction, capped per run).
- Safe by design: minimums protect 90-day charts, availability reports and status pages; the **last status change before the cutoff is always kept**, so availability over any period stays exact; open incidents and queued notifications are never removed; summaries are never kept shorter than raw results.
- API: `GET/PUT /api/settings/retention`. Migration `0023` (indexes for cleanup).
- Help: *Data retention* section in all 13 languages.

### Changed
- Without TimescaleDB, raw check results follow the retention setting instead of a fixed 30 days.

## [0.26.0] - 2026-10-04
Acknowledge from the alert.

### Added
- On-call messages include **Acknowledge** and **Open in Fudo** links (buttons in Teams, links in email and Telegram). Acknowledge opens a page that works **without signing in**, also on a phone; one tap acknowledges the incident **as the paged person**, stops escalation for everyone, writes the timeline (*via link*) and audit log, and sends the usual acknowledged notifications.
- Safe by design: opening the link only shows the incident, so link previews and email scanners cannot acknowledge by accident; a separate token per message, stored only as a hash, single-use, valid 24 hours and only while the incident is open; the person's role must allow acknowledging (viewers cannot); the page removes the token from the address bar and history; rate-limited, never cached.
- API: `GET/POST /api/ack/:token`. Migration `0022`.
- Help: acknowledge links in the *On-call* section, in all 13 languages.

### Fixed
- "Already acknowledged" (when acknowledging an incident twice) was shown in English in every language.

### Changed
- Acknowledging in the interface and through a link share one implementation.

## [0.25.0] - 2026-10-04
On-call rotations and escalation.

### Added
- **On-call per team** (*Teams › On-call*): members in rotation order; shifts of one day, one week, two weeks or any number of days, handing over at a local time in a chosen time zone (stays correct across daylight-saving changes); the first shift's date.
- **Escalation steps**, counted from when an incident opens: the person on call, the next person in the rotation, the team's leads or the whole team, for incidents of items the team owns at or above a chosen severity.
- **Overrides**: someone else covers a period (swap, holiday, sick leave); overrides win over the rotation.
- **Paging**: every paged person is reached through their own notification steps (email, Teams, Telegram), or by email at their sign-in address if they set none. Paging stops when someone acknowledges and pauses while the incident is snoozed. Each person is paged once per incident, each step is sent once, also with several workers.
- **Visibility**: *on call now* on team cards and in the on-call dialog with the next 8 shifts; *Paged* on the incident page (who, why, what was sent and whether it arrived); *Your on-call shifts* on the profile. Warning for rotation members without personal notification steps.
- On-call messages in the recipient's language, with a link to the incident.
- API: `GET/PUT /api/teams/:id/oncall`, `POST/DELETE /api/teams/:id/oncall/overrides`, `GET /api/profile/oncall`; team and incident responses include on-call information. Migration `0021`; on-call data is tenant-isolated and included in backups.
- Help: *On-call* section in all 13 languages.

## [0.24.0] - 2026-10-04
Teams and ownership.

### Added
- **Teams** (menu *Teams*): group the people responsible for applications and infrastructure, per tenant (e.g. *Database Group*) or in the Global infrastructure scope (e.g. *Storage team*). Members are *members* or *leads*; only people with access to the team's scope can be added, so a team never widens access.
- **Owner team** on application and asset pages. Tenant items are owned by the tenant's teams, shared infrastructure by global teams.
- **Every incident shows its owner and leads**, also for monitors (through their asset, else an application they belong to), and so do post-incident reports.
- API: `GET/POST /api/teams`, `PUT/DELETE /api/teams/:id`, `GET /api/teams/candidates`, `GET/PUT /api/ownership/:type/:id`; incident details include `owner`. Migration `0020`; teams are tenant-isolated and included in backups.
- Help: *Teams and ownership* section in all 13 languages.

## [0.23.0] - 2026-10-04
Your profile: the first step towards on-call.

### Added
- **Profile** (bottom of the sidebar; your name links there too): change your name and password, **move two-factor authentication to a new phone** (the old one keeps working until the new one is confirmed), get new recovery codes, and see your **sessions** (browser, IP address, times) to end one or all others. Changing the password or the phone signs out your other sessions.
- **Contact methods**: email, a **Microsoft Teams workflow** that posts to your own chat, or **Telegram**. Each is confirmed with a 6-digit code (valid 15 minutes, 5 attempts) before Fudo relies on it; *Send test* shows how you will be reached. Targets are stored encrypted. Codes and test messages are in the person's own language.
- **Your notification steps**: which contact methods to use and when (e.g. email at once, Telegram after 5 minutes). They will be followed by on-call escalation (next step).
- **Settings › Telegram bot** (superadmins): connect your organisation's bot; the token is checked with Telegram and stored encrypted.
- Teams workflow addresses are limited to Microsoft's domains, so signed-in users cannot make the server call internal addresses (server-side request forgery); redirects are refused.
- API: `/api/profile` (with `/password`, `/2fa/start`, `/2fa/confirm`, `/recovery-codes`, `/sessions`, `/contacts`, `/notification-steps`) and `/api/settings/telegram`. Migration `0019`. Backups re-encrypt the new secrets when moved to another server.
- Help: *Your profile* section in all 13 languages.

## [0.22.0] - 2026-10-03
Status pages.

### Added
- **Status pages** (menu *Status pages*): choose applications, assets and monitors (tenant pages may include shared infrastructure), give each a **display name** and a group, and publish them at `/status/<address>` with the overall status, 90 days of availability per item, current incidents and maintenance (running and in the next 7 days).
  - **Public** pages work without signing in and show only display names and plain statuses (*Operational, Degraded, Outage, Maintenance*): never internal names, causes, incident titles, maintenance names, tenant names or ids. Responses are cached for 30 seconds and rate-limited.
  - **Internal** pages need a session with access to the page's tenant (or a superadmin or infrastructure admin) and also show incident titles and maintenance names; visitors without a session get the sign-in form in place.
  - Pages refresh every minute, follow the visitor's language (right to left in Arabic) and light or dark mode. *Copy link* on each page.
- API: `GET/POST /api/status-pages`, `PUT/DELETE /api/status-pages/:id`, `GET /api/status/:slug`. Migration `0018`. Status pages are tenant-isolated and included in backups.
- Help: *Status pages* section in all 13 languages.

### Fixed
- Error messages added in 0.19–0.22 (backups, recurring maintenance, status pages) were not in the translation catalogue and appeared in English in every language. All 14 are now translated.
- Greek: ownership error messages contained a stray colon ("Αυτή η εφαρμογή: ανήκει…").

## [0.21.0] - 2026-10-03
Post-incident reports.

### Added
- **Post-incident report** on every incident, as **PDF** or **Markdown** (for a wiki or a ticket): summary (status, severity, affected item, root cause, opened / acknowledged / resolved with who and how long), impacted incidents, resolution and actions taken, the full timeline, notifications sent and similar past incidents. In the reader's language and time zone; Arabic PDFs are laid out right to left. Available to everyone who can see the incident, also while it is open.
- API: `GET /api/incidents/:id/report?format=pdf|md&tz=<time zone>`.
- Help: *Post-incident reports* section in all 13 languages.

### Changed
- The PDF layout (header band, tables, right-to-left text, page footers) is shared by availability reports and post-incident reports. Availability reports render exactly as before (checked in English, Greek, Polish and Arabic).

### Fixed
- The worker sent several queries at once over one database connection when loading the dependency graph and when reconciling incidents. The driver tolerated this with a deprecation warning, but the next major version of the PostgreSQL driver rejects it. The queries now run one after another, and the dependency graph is read from one consistent snapshot.

## [0.20.0] - 2026-10-03
Recurring maintenance windows.

### Added
- **Recurring maintenance**: *Repeat* when scheduling: every day, every week on chosen days, or every month on a day (day 31 falls on the last day of shorter months) or on a weekday of a week (*Tuesday of the second week* = Microsoft's Patch Tuesday). Times follow the chosen time zone (02:00 stays 02:00 across daylight-saving changes); an end before the start means the next day; optional last day.
- Fudo creates the windows of the next 60 days (the API right away, the worker keeps the horizon moving), marked *Repeats*, so alerts, availability and *Impacted by maintenance* work as for any window. **Skip** removes one occurrence; editing one window detaches it from the series; editing a series replaces its future windows; deleting it keeps past and running windows.
- *Recurring maintenance* card listing each series with a readable rule, its next occurrence and targets.
- API: `GET/POST /api/maintenance/series`, `PUT/DELETE /api/maintenance/series/:id`. Migration `0017`. Series are tenant-isolated like windows and included in backups.
- Help: *Recurring maintenance* section in all 13 languages.

## [0.19.0] - 2026-10-03
Backup and restore from the browser.

### Added
- **Settings › Backups** (superadmins): create a backup on demand, with or without the raw check history; download, upload, delete; restore with a preview of the contents. Backups are **encrypted with a passphrase** (AES-256-GCM, scrypt) and do not depend on `APP_SECRET`: secrets inside them (2FA keys, SMTP and monitor passwords, channel settings) are re-encrypted for the server you restore on, so a backup also **moves Fudo to a new server**.
- **Scheduled backups**: daily or weekly at a chosen time and time zone, keeping the newest N; the worker writes them and catches up once after downtime. The last run's result is shown in Settings.
- **Safe restore**: confirmed by typing the organization name; a backup of the current state is saved first (*Before restore*); everything is replaced in one transaction that commits only after the whole file is authenticated, so a wrong passphrase, a damaged or altered file, or a backup from a newer version changes nothing. Notifications queued at backup time are not sent again; incident numbering continues after the restored ones; everyone signs in again.
- New package `@fudo/backup`; `BACKUP_DIR` setting; Docker volume `backups` shared by `api` and `worker`.
- Backup, restore, upload, deletion and schedule changes are recorded in the audit log.

### Fixed
- The built-in nginx limited request bodies to 1 MB (its default): uploads of any real backup, and YAML imports over 1 MB, would have failed in Docker. Backup uploads are now unlimited and streamed; other API requests allow 10 MB.

### Changed
- `docs/admin/upgrading-and-backup.md` describes backups in the browser first; `pg_dump` remains as an alternative.

## [0.18.9] - 2026-10-03
The help is now available in all 13 languages.

### Added
- **Arabic help**: all 11 pages of the user guide (`docs/guide/ar/`), laid out right to left, using the interface's terms, Arabic punctuation and quotation marks. Tables mirror, while code, commands and YAML stay left to right.

### Fixed
- Arabic: the menu items *Configuration* and *Settings* had the same name ("الإعدادات"). Configuration is now "التكوين"; a check of every language's menu found no other duplicate names.

## [0.18.8] - 2026-10-03
### Added
- **Bulgarian and Turkish help**: all 11 pages of the user guide (`docs/guide/bg/`, `docs/guide/tr/`), using the same terms as each language's interface.

### Fixed
- Bulgarian: error messages and notifications called monitors "наблюдение" instead of "монитор", and resolved incidents "решен" instead of "разрешен", as the interface does. They now match the interface, including the "last time this was resolved by" hint in alerts.

## [0.18.7] - 2026-10-03
### Added
- **Polish and Romanian help**: all 11 pages of the user guide (`docs/guide/pl/`, `docs/guide/ro/`), using the same terms as each language's interface.

### Fixed
- Polish: notifications, reports and check results called the Down status "awaria" (failure) instead of "niedostępny", as the interface does.
- Romanian: they used "căzut" instead of "indisponibil" for the Down status, and "activ" instead of "resursă" for assets. All now match the interface.

## [0.18.6] - 2026-10-03
### Added
- **Portuguese (Brazil) and Dutch help**: all 11 pages of the user guide (`docs/guide/pt-BR/`, `docs/guide/nl/`), using the same terms as each language's interface.

### Fixed
- Portuguese: notifications, reports and error messages used different words than the interface for acknowledging ("confirmar" instead of "reconhecer") and for the Down status ("fora do ar" instead of "inativo"). They now match the interface.

## [0.18.5] - 2026-10-03
### Fixed
- **Fudo became slow or unresponsive with several tabs open**: each tab kept its own live-updates connection, and browsers allow only 6 connections per server over HTTP/1.1. With a few tabs open, every other request (loading a page, saving a setting, switching the language) waited for a free connection, which looked like the language switch needing several attempts. The tabs of a browser now share one live-updates connection per tenant: one tab holds it and passes updates to the others; when it closes, another takes over within moments and every tab refreshes once to catch up. Browsers without the needed features close the connection of hidden tabs instead.

### Changed
- Installation guide: enabling HTTP/2 on the reverse proxy is recommended.

## [0.18.4] - 2026-10-03
### Added
- **Spanish and Italian help**: all 11 pages of the user guide (`docs/guide/es/`, `docs/guide/it/`), using the same terms as each language's interface.

### Fixed
- Spanish and Italian: notifications, reports and error messages used different words than the interface for acknowledging (Spanish "reconocer" instead of "confirmar"; Italian "prendere in carico" instead of "confermare") and, in Italian, for assets ("asset" instead of "risorsa"). They now match the interface.

## [0.18.3] - 2026-10-03
### Fixed
- **Fudo did not start when the browser blocks site storage** (strict privacy settings, some private modes): the page stayed blank. Storage is now optional everywhere; with it blocked, Fudo works normally and only forgets the selected tenant between visits.
- **Changing the language did nothing when browser storage is blocked**: the switch stopped before saving or reloading. It now saves the choice to the profile and reloads in the new language either way.
- Configuration export and report downloads read the selected tenant from browser storage instead of from the interface.

### Changed
- Settings: the two language choices are easy to tell apart. *Interface language* (yours, under Preferences) and *Default language* for notifications, emails and scheduled reports (System settings), which now says it does not change the interface. The help page describes them the same way, in every translated language.

## [0.18.2] - 2026-10-02
### Added
- **German and French help**: all 11 pages of the user guide (`docs/guide/de/`, `docs/guide/fr/`), using the same terms as each language's interface.

### Fixed
- French: error messages, notifications and reports used different words than the French interface for monitors, assets and acknowledging ("moniteur", "actif", "pris en compte" instead of "sonde", "ressource", "acquitter"). They now match the interface, with the gender agreement that goes with them.

## [0.18.1] - 2026-10-02
### Added
- **Greek help**: all 11 pages of the user guide translated (`docs/guide/el/`), using the same terms as the Greek interface, so names of screens, buttons and messages match what users see. Greek users see the help in Greek, with the English original one click away.

## [0.18.0] - 2026-10-02
Translations of the help, page by page.

### Added
- **Translated help pages** in `docs/guide/<lang>/<page>.md`. Help shows a page in the interface language when it is translated, otherwise in English with a note, so a language can be translated one page at a time. Translated pages offer the English original; Arabic pages are right to left (code stays left to right). Links between guide pages work on GitHub and in the app whether or not the target is translated yet, and search finds pages by their translated and English words.
- **Outdated translations are detected**: each translation's first line records which version of the English page it was made from (an invisible HTML comment with a fingerprint). When the English page changes, the app marks the translation as possibly outdated, with a link to the English original.
- `pnpm docs:check` (also in CI): validates translation folders, pages, stamps and links, and shows coverage per language; `--new <lang> <page>` starts a translation, `--stamp <file>` marks an updated translation as current.
- Instructions for translators in `locales/README.md` (*Translating the help*).

### Changed
- The note on untranslated pages now says the page is not translated yet (instead of "This help is written in English").

## [0.17.1] - 2026-10-02
### Added
- **License: GNU Affero General Public License v3.0 or later** (`LICENSE`, GitHub's canonical text). `license` fields in every package; the packages that bundle Uptime Kuma providers (MIT) and the DejaVu fonts declare both licenses. All production dependencies use permissive licenses compatible with the AGPL.
- **Help** ends with the version and links to the license and the source code (from `version` and `repository` in the root `package.json`), so anyone running Fudo, including a modified version, can point users to its source.
- README, CONTRIBUTING (contributions under the same license) and `docs/development.md` describe the license.

## [0.17.0] - 2026-10-02
Documentation and help, ready for publishing.

### Added
- **Help** in the interface (sidebar, for everyone): the user guide with a topic list and search, and a **?** next to page titles that opens the matching topic. The guide is English; other languages show a short note, and the text stays left to right in Arabic.
- **Documentation** in `docs/`, the same files the Help page shows: a user guide (getting started, concepts, monitors, incidents, notifications, maintenance, dashboards and reports, configuration as code, users and access, settings, troubleshooting), administration (installation, upgrading and backup, configuration, security) and development.
- `CONTRIBUTING.md`, `SECURITY.md` (private vulnerability reporting) and a GitHub Actions workflow (type-check, tests, translation and theme checks, build, Docker images).

### Changed
- The README is now a short project overview with a screenshot, quick start and links to the documentation; the development history is in this changelog and `docs/development.md`.

## [0.16.3] - 2026-10-01
### Fixed
- Telegram, SMS and the other Uptime Kuma-based channels dropped the root cause line when the channel language was not English (since 0.16.0): the sender looked the fact up by its English title. Facts now carry a stable key.

### Changed
- Chat messages from those channels start with "[Fudo]", like email subjects, so Fudo alerts are easy to tell apart from other tools posting to the same chat.

## [0.16.2] - 2026-09-30
API error messages in every language.

### Added
- **Translated error messages**: validation messages, "not found", permission, sign-in and SMTP errors now appear in the interface language (153 messages in all 13 languages). The web interface sends its language in the `x-fudo-lang` header; requests without it (scripts, integrations) still get English, and the machine-readable `error` codes are unchanged.
- `pnpm i18n:sync` finds error messages in the API and the validation schemas itself and writes them to `en.json` (`api.*`), so new messages cannot be forgotten. Messages with live values are templates (host, port, system error, counts); sentences built from a noun are expanded per noun, so adjectives agree in gendered languages.

### Changed
- Generic validation errors read like the rest of the interface ("Required", "At least 3 characters", "Enter a valid email address") instead of the validation library's technical defaults ("Invalid input: expected string, received undefined"), also in English. This applies to channel and monitor settings, YAML import and passwords as well.
- Rate-limit responses use the error code `rate_limited` (previously `bad_request`).
- A few messages were reworded so they translate fully: "X is still failing" instead of "X is still down/degraded", "Try again in N min." instead of an English-only plural.

## [0.16.1] - 2026-09-29
PDF reports in every language, including right-to-left.

### Added
- **Report language per schedule** (schedule form › *Language*; default: the organisation's notification language). Downloaded reports use the downloader's language. The PDF (titles, KPIs, tables, incident titles, severities, criticality, durations, footer), the period label ("Αύγουστος 2026", "KW 35, …", "sierpień 2026") and the report email are translated: 65 texts in all 13 languages. Migration `0016`.
- **Right-to-left PDFs** (Arabic): the header, KPI boxes and tables are mirrored, and text is laid out word by word following the Unicode bidirectional rules, so Latin names and numbers read correctly inside Arabic sentences. Greek, Cyrillic, Polish, Romanian and Turkish use the embedded DejaVu font as before.
- Dates and numbers in reports use the language's format (decimal comma where usual, Western digits for Arabic) and the 24-hour clock in every language.

### Changed
- British English month abbreviation in labels follows current Intl data ("Sept").
- CSV exports keep English column names on purpose (spreadsheets and scripts depend on them).

### Fixed
- Short-lived processes that load translations (scripts, CLI tools) no longer hang: the language-file watcher no longer keeps the process alive.

## [0.16.0] - 2026-09-29
Notifications and emails in the recipient's language.

### Added
- **Language per notification channel** (channel form › *Language of messages*), defaulting to the new organisation-wide **notification language** (Settings › System settings). A Teams channel for one site and an email channel for another can use different languages. Applies to email, Microsoft Teams, Slack and all Uptime Kuma providers (Telegram, SMS, …): subject, headline, incident title, facts, durations, the "last time this was resolved by" hint, "Open in Fudo" and the footer. Dates are written the language's way, in UTC.
- **Emails**: invitations use the language chosen in the invite dialog (also saved as the new user's language for their first sign-in); 2FA-reset emails use the user's language; the SMTP test email uses the sender's.
- 37 notification and email texts in all 13 languages (`notify.*` keys, generated from `packages/notify/src/texts.ts` by `pnpm i18n:sync`).
- Server-side translations read the same language files as the web interface, including `LOCALES_DIR` drop-ins, and pick up changes without a restart.
- API: channel `locale`; `GET/PUT /api/settings/notify-locale` (superadmins), read-only `GET /api/notify-locale`; user creation accepts `locale`. Migration `0015`.

### Changed
- Notification dates read like "Sep 29, 2026, 06:54 UTC" (in the channel's language) instead of "2026-09-29 06:54 UTC".
- Arabic durations agree with the number ("ساعتان" for two hours), in notifications and in the interface.
- The webhook JSON payload stays in English on purpose (a stable format for integrations); it now also carries the incident's `titleParts`.

## [0.15.0] - 2026-09-29
Server-generated text in every language.

### Added
- **Translated server messages**: check results (all 16 monitor types), incident titles, incident timeline entries and resolve reasons, application and asset summaries, status changes and similar-incident reasons now appear in the interface language: 139 messages in all 13 languages, with correct plural forms (Polish, Romanian, Arabic included).
- These texts are stored as **message codes with parameters** (e.g. `["tcp.open", {"port": 3000}]`) in new `*_parts` columns (migration `0014`), so history re-translates when a user changes language. The English text columns stay for logs, API clients and older rows; rows written before 0.15 keep showing their stored English.
- Text from the monitored device itself (SMTP banners, server models, Docker health output) is shown verbatim.
- API: optional `lastMessageParts`, `messageParts`, `summaryParts`, `titleParts`, `bodyParts`, `reasonParts` fields, and `resolutionMin` on chart series.
- Contributor notes for `msg.*` keys in `locales/README.md`; `pnpm i18n:sync` generates them from `packages/shared/src/messages.ts`.

### Changed
- The message formatter is shared by the web app and the server (plurals, placeholders). Numbers keep the language's decimal separator but are no longer digit-grouped, so ports and ids stay as they are (3000, not 3.000).
- Chart resolution ("5 min") is shown in the interface language.
- Docker's exit code and a few similar details are now separate message parts ("… · exit code 1").

### Fixed
- `pnpm i18n:sync` no longer drops the Uptime Kuma channel description key.

## [0.14.0] - 2026-09-29
Themes.

### Added
- **Themes**: Light, Dark and Monokai, plus **System** (follows the operating system's light/dark setting and switches live). Each user chooses under Settings; the choice is saved to the profile and follows them to other browsers. The last theme is applied before the first render, so dark themes do not flash light on load (sign-in page included).
- **Extendable like languages**: every `themes/<id>.json` is a theme; drop a file into `themes/` or into the new `THEMES_DIR` folder and it appears without a restart. A theme sets any of 70 named colours and can `extends` another theme to change only a few; a drop-in file with the id of a built-in theme is merged over it (one line re-brands Dark). Guide with the full colour table: `themes/README.md`.
- **Safe by construction**: theme values must be plain colours (`#hex`, `rgb[a]()`, `hsl[a]()`); `url()`, `var()` and anything that could load resources or break out of the value is ignored and logged.
- `pnpm themes:check [folder]`: validates themes (file names, unknown colours, invalid values, `extends` loops) and warns about WCAG contrast below 4.5:1 for text and 3:1 for status colours.
- API: `GET /api/themes`, `GET /api/themes/:id` (public), `PUT /api/auth/me/theme`; profile field `theme`. Migration `0013`.

### Changed
- **Settings is available to every user**: *Preferences* (language, theme) for everyone, *System settings* (email) for superadmins. The sidebar's language picker moved there; the sidebar has a Settings entry for everyone; `/admin/settings` still works.
- The stylesheet uses theme colours everywhere (about 100 hard-coded colours replaced); the light theme looks as before.
- Light theme: *Degraded* and *Impacted* status colours slightly darker to reach 3:1 contrast on white.
- Links use the theme's link colour instead of the browser default blue.

### Fixed
- Inputs without their own style (incident comment box, tags) now use theme colours instead of the browser's default field colour.

## [0.13.0] - 2026-09-28
Notifications per application, user deletion, SMTP with self-signed certificates.

### Added
- **Notification routing per application**: a channel sends either all incidents of its tenant (default) or only incidents of selected applications; an application can have any number of such channels (e.g. its team channel plus an escalation step). Set it in the channel form ("Send") or on the application page (*Notifications* card, which warns when incidents reach no channel). Opened/acknowledged/resolved events, reminders and escalations all follow the routing. Migration `0012` (`notification_channels.routing`, `application_channels` with row-level security).
- YAML export/import: applications carry `notify: [channel names]`; unknown or ambiguous channel names are reported with their line; files without `notify` (e.g. bulk add) leave the links unchanged.
- API: `GET/PUT /api/applications/:id/channels`; channels have `routing` and `applicationIds`.
- **Delete user** (superadmins): removes the account with its sessions, roles, recovery codes and invitations; past actions stay (incident notes and acknowledgements keep the history, the audit log shows "name@example (deleted)"). You cannot delete yourself or the last active superadmin.
- **SMTP: accept self-signed certificates** for local mail servers (Settings › Email), used by test emails, notifications and scheduled reports. The connection stays encrypted; only the certificate check is skipped.

### Changed
- SMTP errors explain the cause: untrusted certificate (with the setting to use), wrong user name or password, cannot connect, TLS mode mismatch ("the port probably expects STARTTLS"). Previously every failure read "The SMTP server rejected the message".

### Fixed
- Creating a channel with an invalid application list no longer leaves a half-created channel.

## [0.12.5] - 2026-09-28
Turkish, Arabic and right-to-left layout.

### Added
- **Türkçe** and **العربية**: complete translations of the web interface (1,095 texts each). Arabic uses all six plural forms (zero, one, two, few, many, other). Notification provider forms use Uptime Kuma's Turkish and Arabic translations.
- **Right-to-left layout**: the stylesheet now uses CSS logical properties (inline-start/end instead of left/right), so right-to-left languages get a mirrored interface (sidebar, spacing, borders, active markers, status arrows), while charts, heartbeat strips, the dependency map, host names, URLs and code stay left to right.
- Duration units are translated (min / h / d) with the language's decimal separator.

### Fixed
- Several durations (incident age, MTTR, downtime, report tables, escalation options) used English units in every language.

### Changed
- Arabic shows Western digits (0–9) for numbers and dates.

## [0.12.4] - 2026-09-28
More languages.

### Added
- **Polski, Română, Български**: complete translations of the web interface (1,092 texts each), with the plural forms of each language (Polish one/few/many, Romanian one/few/other). Notification provider forms use Uptime Kuma's Polish, Romanian and Bulgarian translations.
- `locales/README.md`: plural example for languages with several plural forms.

## [0.12.3] - 2026-09-28
More languages.

### Added
- **Italiano, Português (Brasil), Nederlands**: complete translations of the web interface (1,092 texts each). Notification provider forms use Uptime Kuma's Italian, Brazilian Portuguese and Dutch translations.

## [0.12.2] - 2026-09-28
More languages.

### Added
- **Deutsch, Français, Español**: complete translations of the web interface (1,092 texts each), alongside English and Greek. Notification provider forms use Uptime Kuma's German, French and Spanish translations.

### Fixed
- Monitor form: SNMP v1/v2c showed the SNMPv3 authentication and privacy fields. Field conditions now chain (a field whose controlling field is hidden is hidden too). Server-side validation was already correct.

## [0.12.1] - 2026-09-28
vCenter VM monitor fixes.

### Fixed
- **vCenter 6.7 failed with "vCenter HTTP 405"**: the API flavor was chosen as "7+" whenever `POST /api/session` did not return 404/405, but on 6.x the reverse proxy can answer it with a 2xx page. `/api` now counts only when it returns an actual session token; otherwise `/rest` is used. If `/api` sessions work but the VM list answers 400/404/405, the check switches to `/rest` and remembers it for that vCenter.
- **Session cache ignored the password**: monitors for the same vCenter and user shared a cached session, so a wrong or changed password was not detected until the session expired. The cache key now includes a hash of the password.
- "Authentication failed" is reported when credentials are rejected (also when 6.x answers `/api` with 401); other login problems show the status of each endpoint (e.g. `/rest: HTTP 503`).

### Changed
- The check message shows the vCenter version (e.g. "vCenter 6.7.0.54000", "vCenter 8.0.3.00400") when the account may read it; otherwise the API generation.

## [0.12.0] - 2026-09-28
Multilingual interface, with Greek as the first translation.

### Added
- **Languages from a folder**: every `locales/<code>.json` is a language, discovered automatically by the API (re-read when files change; no rebuild); `LOCALES_DIR` adds or overrides languages at run time. Partial translations fall back to English; invalid files are skipped with a log message.
- **Language picker** in the sidebar and on the sign-in screens, showing each language in its own name with its completion; the choice is saved per user (`users.locale`, migration `0011`) and the default follows the browser.
- **Ελληνικά (Greek)**: complete translation of the web interface (≈1,090 texts), including monitor, channel and template forms.
- Message format with placeholders and CLDR plural rules (`{count, plural, one {…} other {…}}`); dates and numbers follow the chosen language.
- Uptime Kuma provider forms use Kuma's own translations (60 languages, generated with the providers).
- Contributor tooling: `pnpm i18n:check` (missing/unused keys, placeholder mismatches, invalid files, completeness), `pnpm i18n:sync` (definition texts), `locales/README.md`.

### Changed
- All interface texts moved to `locales/en.json`; sentences built from fragments were rewritten as whole messages so translations can reorder them.

### Fixed
- `scripts/kuma/generate.mjs` deleted Fudo's shim files when regenerating the Kuma providers; it now only replaces the vendored provider folder.

### Notes
- Server-generated texts (check result messages, incident titles, API errors, notifications, emails and PDF reports) remain English; planned for 0.13.0.

## [0.11.0] - 2026-09-27
Thirteen new monitor types and encrypted monitor credentials.

### Added
- **Network**: SNMP (v1, v2c, v3 with MD5/SHA-1/SHA-2 and DES/AES; any value or =, ≠, contains, >, ≥, <, ≤), NTP (stratum, clock offset), SMTP (220 greeting, EHLO, STARTTLS or implicit TLS; never sends mail), Domain expiry (RDAP via the IANA bootstrap, WHOIS fallback).
- **Databases**: MySQL/MariaDB, PostgreSQL, Microsoft SQL Server (incl. named instances), Redis (any command, default PING), MongoDB (admin command, default ping); optional query with expected result (equals/contains).
- **Systems**: SSH command (password or private key; exit code, contains, not contains, exact, regex; optional host-key fingerprint pinning), Docker container (running, health check; local socket or remote API).
- **Infrastructure**: vCenter VM power state with optional VMware Tools check (vCenter 6.7 `/rest` and 7/8 `/api` detected automatically, sessions cached); HPE iLO / Redfish hardware health with the failing HPE subsystem named.
- **Encrypted monitor credentials (F-704)**: secret fields are stored with AES-256-GCM (key derived from `APP_SECRET`), masked in the UI, API and YAML export, kept when a monitor is edited, used by *Test now* while editing, and decrypted only by the worker. Clones ask for secrets again.
- Monitor form: password and private-key fields, fields that appear only when relevant (e.g. SNMPv3 settings), scrollable type list with new categories.
- `docker-compose.yml`: commented option to mount the Docker socket for local container monitors; `DOCKER_GID` in `.env.example`.

### Notes
- Kuma's monitor implementations depend on Kuma's server internals, so these checks are native implementations using the same client libraries (net-snmp, ssh2, mysql2, pg, mssql, redis, mongodb) and the same semantics.
- Live-tested against MariaDB, PostgreSQL, Redis, net-snmp (v2c and v3), OpenSSH, an SMTP server, and faithful fakes of vCenter 6.7 and 8, HPE iLO 5 Redfish, the Docker Engine API and an NTP server; SQL Server and MongoDB were tested for connection handling only.

## [0.10.0] - 2026-09-27
Phase 6, part 2: configuration as code, monitor templates and bulk add.

### Added
- **F-602** Configuration export/import as YAML (per tenant or Global scope): assets, monitors, applications, dependencies and application members. Import previews first (create / update per field / unchanged), reports errors with line numbers (click to jump to the line), checks references and dependency loops, and applies all-or-nothing. Export → import round-trips as "unchanged". Available through the API (`GET /api/config/export`, `POST /api/config/import`, *manage* permission).
- **F-207** Monitor templates: web application, Windows server, Linux server, HPE iLO/BMC, network switch/router, VMware ESXi host, VMware vCenter, SQL Server, storage array (HPE 3PAR/Primera/Alletra).
- **F-206** Bulk add: paste hosts/URLs or load a CSV (header detection, any column order), apply a template or a single check type per line, optionally create an asset per line, set a dependency and add the new checks to an application; server-side preview before creating.
- Imports emit live updates, so open pages refresh immediately.

### Notes
- Notification channels (contain secrets) and maintenance windows are not part of the YAML; imported push monitors receive new push URLs.
- A database backup button was deliberately not added; the documented `pg_dump`/`pg_restore` procedure is safer for full backups.

## [0.9.0] - 2026-09-27
Phase 6, part 1: reports, API tokens and API documentation.

### Added
- **F-601** Reports: availability per application (or shared asset in the Global scope), 24/7 and business-hours availability, downtime, planned maintenance, incidents, SLA met/missed, MTTA, MTTR, incident list with root cause and resolution, top root causes.
  - On demand: last week, last month, last 30 days or custom dates; preview in the UI; download as PDF or CSV (availability, incidents; UTF-8 with BOM for Excel).
  - Scheduled: weekly (Mondays, previous week) or monthly (1st, previous month) at a chosen hour and time zone, emailed as PDF and/or CSV through the SMTP settings; *Send now*; run log.
  - Time zones and daylight saving time handled for periods and business hours; the PDF font (DejaVu Sans) covers Greek.
- **F-603** API tokens: `read` / `operate` / `manage` per tenant or Global scope, shown once, stored as SHA-256, optional expiry, revocation, last-used time, audited; actions by tokens are labelled in incident timelines. OpenAPI 3.0 spec at `/api/openapi.json`, self-contained documentation at `/api/docs` (no CDN).
- `@fudo/reports` and `@fudo/report-fonts` packages; business-hours availability and time-zone helpers in `@fudo/engine` (unit-tested, including DST).
- Migration `0010_reports_tokens.sql`.

### Changed
- The API access page lives at `/access` (a path starting with `/api` would be routed to the API by prefix-based proxies); the development proxy now only forwards `/api/…`.

## [0.8.0] - 2026-09-27
Phase 5: dashboards, charts, live updates, topology. **Includes a security fix: please upgrade.**

### Security
- **Row-level security was not enforced in Docker deployments (since 0.4.0).** PostgreSQL superusers bypass RLS, and the official image's `POSTGRES_USER` is a superuser. List views were still separated by the application's own filters, but some lookups by id relied on RLS alone, so a user who knew another tenant's item id (random UUID) could read it. Fix: migration `0009` creates the role `fudo_app` (no superuser, no BYPASSRLS); migrations still run as the configured user, then the API and worker switch to `fudo_app` at connection start. `/api/health` reports `db.rls`, and Overview › System status shows *Tenant isolation* so this cannot go unnoticed. Verified with a superuser database user: cross-tenant reads return "not found".

### Added
- **F-501** TimescaleDB continuous aggregates `check_results_hourly` and `check_results_daily` (p95, real-time aggregation), compression of raw results after 3 days, retention: raw 30 days, hourly 400 days, daily kept. Migration `0008` is a no-op without TimescaleDB.
- **F-502** `GET /api/monitors/:id/series?range=1h|6h|24h|7d|30d|90d` (automatic resolution and source), `GET /api/{applications|assets}/:id/availability?days=N`.
- **F-503** New Overview dashboard (KPIs, service cards with 30-day availability strips and SLA status), range selector and p95 on monitor charts, availability cards on application and asset pages.
- **F-504** Live updates: `GET /api/live?scope=…` (Server-Sent Events, fed by Postgres NOTIFY from the worker and API); all pages refresh on relevant changes; *Live* indicator in the sidebar.
- **F-505** Topology page with layered dependency map, pan/zoom, hover tracing, search and *Problems only*.
- Availability calculation in `@fudo/engine` (unit-tested).

### Changed
- Charts scale to the 98th percentile so a single slow check does not flatten the view.
- All TimescaleDB features are now verified against TimescaleDB 2.30.1 (hypertable, retention, rollups, compression).

## [0.7.0] - 2026-09-27
Phase 4, part 2: 100+ notification channel types and escalation.

### Added
- **F-405** 102 notification providers from Uptime Kuma 3.0.0-beta.0 (MIT), vendored unmodified in `@fudo/kuma-notifications`: Telegram, Discord, PagerDuty, Opsgenie, ntfy, Pushover, Signal, Mattermost, Matrix, Google Chat, Twilio and other SMS gateways, and more. Shims replace the Kuma internals they use; incidents are mapped to Kuma's monitor/heartbeat objects so links point at the Fudo incident.
- **F-406** Generated channel forms: `scripts/kuma/generate.mjs` parses Kuma's Vue forms and English labels into `providers.json` (395 fields with secrets, selects, defaults and conditional visibility). The channel dialog groups types by category and can be filtered.
- **F-404** Escalation: a channel delay ("not acknowledged after N minutes") makes it an escalation step; acknowledging or snoozing stops the chain; escalations appear in the incident timeline and delivery log.
- Migration `0007_escalation.sql`.

### Changed
- Development logging falls back to JSON when `pino-pretty` is not installed.
- Excluded Kuma providers: Email, Webhook, Microsoft Teams and Slack (built-in equivalents), Web Push, Nostr, Apprise.

### Notes
- Messages sent through Kuma providers keep some upstream wording (e.g. "Uptime Kuma" as the sender name) because the provider code is unmodified; most providers offer a custom template or display-name field.

## [0.6.0] - 2026-09-27
Phase 4, part 1: incidents and notifications.

### Added
- **F-401** Automatic incidents from application, asset and standalone monitor failures; impacted incidents linked to their root incident ("Caused by INC-…", "Root of N impacted incidents", across tenants for global readers); auto-resolve on recovery, reopen within 5 minutes instead of a new incident. Incident numbers `INC-0001`…
- **F-402** Timeline (opened, status changes, linked, acknowledged, snoozed, notes, resolved) and notes of type comment / action taken / resolution, with tags.
- **F-403** Similar past incidents: same item, same root cause, shared tags, full-text match; shows action notes and resolution with "Copy to a note". The latest resolution of a similar incident is quoted in new alerts.
- **F-404 (partial)** Acknowledge, snooze (30 min to 1 day), reminders every N minutes while unacknowledged, manual resolve once the item has recovered.
- **F-407** Notification channels per scope: **Email** (SMTP from Settings), **Microsoft Teams** (Workflows webhook, Adaptive Card), **Slack** (incoming webhook), **Webhook** (JSON, custom headers, optional HMAC signature). Filters: minimum severity, events, skip impacted, NOC "all tenants" channels. Outbox with retries, rate limit (30 per 10 min per channel), delivery log per incident and per channel, Send test.
- `@fudo/notify` package; incident planning in `@fudo/engine` (unit-tested).
- UI: Incidents (list with open/resolved, search by text, INC number or tag; detail with timeline, note composer, similar incidents, notifications), Notifications (channels, generated forms, test, log), open-incident badge in the navigation, open incidents on the Overview.
- Migration `0006_incidents.sql`.

## [0.5.1] - 2026-09-27
Configuration fixes.

### Fixed
- Environment values in quotes, with surrounding spaces or Windows line endings (`\r`) are now accepted (e.g. `PUBLIC_URL="http://fudo.example.com"`).
- `SESSION_TTL_HOURS` and `COOKIE_SECURE` from `.env` were not passed to the containers by docker-compose.

### Changed
- Invalid configuration now prints the exact value received, with hidden and non-ASCII characters made visible (e.g. `\u{2010}` for a pasted Unicode hyphen); passwords and `APP_SECRET` are never printed.
- `.env.example` is fully pre-filled and commented, including how to generate `APP_SECRET` (Linux and PowerShell) and when to include a port in `PUBLIC_URL`.

## [0.5.0] - 2026-09-27
Phase 3: shared infrastructure, applications and root cause.

### Added
- **F-307** Global infrastructure scope ("Global infrastructure" in the sidebar switcher): shared assets and their monitors, managed by infra admins/superadmins, readable (never writable) from tenants via row-level security.
- **F-301** Assets: kind, location, management address, tags; status derived from linked monitors ("checks asset").
- **F-302** Applications: members (tenant or shared monitors, required/optional), health rule (all / any / N-of-M), criticality, owner, SLA target; status with cause.
- **F-303** Dependencies: asset→asset, application→asset, monitor→asset, with cycle detection and clear error messages.
- **F-304** Status engine (`@fudo/engine`, pure and unit-tested): root cause, **Impacted by X**, **At risk**, N-of-M redundancy, maintenance as planned cause. Worker evaluator runs on monitor status changes, on graph edits (Postgres NOTIFY) and every 15 s; transitions of assets and applications go to `state_changes` with their cause.
- **F-305** Maintenance windows on assets (incl. their checks), monitors and applications; results during a window are flagged and excluded from uptime; heartbeat strips show them in blue.
- **F-306** "What if this fails?": blast radius and predicted status of every affected application (across tenants for global readers).
- UI: Applications (cards + detail with a layered dependency path, members, dependencies, status history), Assets (list, detail, checks, depends on, used by, what-if), Maintenance (schedule, end now, cancel), status banners, "Checks asset" in the monitor form, effective status and cause in monitor list/detail and overview.
- Migration `0005_assets_apps.sql`.

### Changed
- Monitors may be global (no tenant); tenant monitor lists show only the tenant's own monitors (`?include=global` for pickers).
- Invalid ids in URLs return 404 instead of 500.

### Fixed
- Saving tags on an edited monitor (raw SQL array parameter).

## [0.4.0] - 2026-09-27
Phase 2, part 1: monitoring engine and monitors UI.

### Added
- **F-201** Monitor type registry (`@fudo/monitors`): each type is one definition (form fields + Zod schema, shared by UI and API) and one runner.
- **F-202** Monitor types: **HTTP(S)** (status ranges, keyword, JSON value, headers/body, TLS options), **Ping**, **TCP port**, **DNS**, **TLS certificate** (trust + days to expiry), **Push heartbeat** (public `/api/push/<token>`, GET or POST, `status`/`msg`/`ping` parameters, rotatable token).
- **F-203** Scheduler in the worker: claims due monitors with `FOR UPDATE SKIP LOCKED`, bounded concurrency (`CHECK_CONCURRENCY`), hard time limit per check.
- **F-204** Flap protection: Down after N consecutive failures (faster retry interval while failing), Up after M successes; Degraded applies immediately.
- **F-205 (partial)** `check_results` (TimescaleDB hypertable, 30-day retention; plain table + hourly cleanup without TimescaleDB) and `state_changes`.
- **F-206 (partial)** Monitors UI: list with status filters, search, 30-check heartbeat strips, 24 h uptime; Kuma-style add/edit/clone form with grouped type picker, generated fields, Advanced section and **Test now**; detail page with uptime 24 h/7 d/30 d, 100-check strip, 24 h response chart, status changes, latest results, push URL with curl/PowerShell examples; pause/resume/delete.
- **F-106** Row-level security on `monitors` and `state_changes` (`FORCE`), tenant-scoped API transactions via the `X-Fudo-Tenant` header, worker connections in all-tenant mode.
- Permission model per tenant: viewers read; operators also pause/resume/test; tenant admins, infra admins and superadmins manage.
- Overview: per-tenant monitor counts and a "Needs attention" list.
- `PUBLIC_URL` setting for invitation and push links behind a reverse proxy.
- Unit tests: state machine, HTTP/TCP/push runners against local servers, config validation (16 new tests).
- Migration `0004_monitors.sql`.

### Changed
- API and worker images include `iputils` ping; the API container also gets `NET_RAW` (Test now for Ping).
- Worker cleanup also removes expired invitation records.

## [0.3.0] - 2026-09-27
Project renamed to **Fudo**. Phase 1 (identity & tenancy) complete.

### Added
- **F-012** Fudo branding: logo on sign-in, setup and invitation screens; favicon, app icons and sidebar mark.
- **F-104** Tenants: create, edit, deactivate; tenant switcher in the sidebar (remembered per browser).
- **F-105** Role model: global scope (infra-admin, viewer) plus one role per tenant (tenant-admin, operator, viewer); `/api/auth/me` returns memberships and accessible tenants.
- **F-110** User management: invite by email or copyable one-time link (72 h), per-scope access matrix, superadmin flag, reset 2FA (keeps password, requires it on the link), reset password + 2FA, deactivate/activate. Self-lockout and last-superadmin protection.
- **F-107** Audit log viewer with event-type and user filters and paging; tenant changes store before/after values.
- Invitation acceptance flow (`/invite/:token`): set or confirm password → 2FA enrollment → recovery codes.
- Signed-in app shell: dark sidebar, main and administration navigation, sign-out.
- Migration `0003_tenancy_users.sql`: tenant metadata, invites table, role/scope constraint, audit indexes; `users.password_hash` nullable for pending invitations.

### Changed
- Packages renamed `@sm/*` → `@fudo/*`; compose project `fudo`; default database/user `fudo` in `.env.example`.
- Session cookie renamed to `fudo_session` (existing sessions end; sign in again).
- 2FA enrollment endpoints moved from `/api/setup/totp` to `/api/enroll/totp` (shared by setup and invitations).
- Authenticator entries are labelled `Fudo (<organization>)`.

### Upgrade notes (from 0.2.0)
- Keep your existing `.env` (database name and `APP_SECRET` unchanged); the new defaults only apply to fresh installs.
- Encryption keys still derive from `APP_SECRET` with the original salt, so stored 2FA secrets and the SMTP password remain valid.

## [0.2.0] - 2026-09-27
*Delivered as `service-monitor-v0.2.0.zip`.* Phase 1, part 1: setup wizard, sign-in and two-factor authentication.

### Added
- **F-101** First-run setup wizard (web): administrator account → 2FA enrollment (QR + manual key) → recovery codes (download/copy) → optional SMTP with test email. Resumable after reload; cannot be re-run once complete.
- **F-102** Sign-in with email + password, then second factor; logout; account lockout (5 failures → 15 min); per-IP rate limits; password policy (min 12 chars).
- **F-103** Mandatory TOTP 2FA (RFC 6238, replay protection) and 10 single-use recovery codes.
- **F-109** SMTP settings API with encrypted password and "send test email".
- **F-107 (partial)** Audit events for setup, sign-in/out, failures, lockouts, settings changes.
- **F-011 (partial)** Vitest unit tests: TOTP against RFC 6238 vectors, base32, recovery codes, AES-GCM encryption.
- Worker job removing expired sessions (hourly).
- Consistent JSON error format `{ error, message, fields }` with per-field validation messages.
- Migration `0002_auth.sql`: lockout counters, TOTP last-used step, recovery codes table.
- New env vars: `SESSION_TTL_HOURS`, `COOKIE_SECURE`.

### Changed
- `/api/setup/status` also returns `orgName`; setup counts as complete only when a superadmin with 2FA exists.
- `/api/health` reports the version from `package.json` and is `degraded` without TimescaleDB.
- Web app: sign-in, setup wizard and signed-in status page replace the placeholder.

### Security
- Session tokens stored only as SHA-256 hashes; cookie is HttpOnly + SameSite=Lax, Secure over HTTPS.
- State-changing API calls require `application/json` (CSRF protection).
- Cookie headers redacted from logs.

## [0.1.0] - 2026-09-27
Phase 0: foundation (delivered as `service-monitor.zip`).

### Added
- pnpm monorepo (`apps/api`, `apps/worker`, `apps/web`, `packages/shared`, `packages/db`), strict TypeScript.
- docker-compose: TimescaleDB, api, worker, web (nginx).
- Zod-validated environment, pino logging.
- SQL migration runner and `0001_init.sql` (tenants, users, roles, sessions, settings, audit log).
- pg-boss with worker heartbeat; `/api/health`, `/api/setup/status`; web system status page.
