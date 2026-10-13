# Monitors

## The list

The monitor list shows each monitor's **asset** and the **applications** it belongs to (an optional membership has a dashed outline); both are links. Click a column header to sort (again to reverse, a third time for the default order); Fudo remembers the sort in this browser. The filter box searches names, targets, tags, assets and applications; it ignores case and accents, and every word must match. The other long lists (assets, incidents, users, maintenance, channels and more) sort and filter the same way.

## Monitor types

| Category | Type | Checks |
|---|---|---|
| Web | **HTTP(S)** | status code ranges, keyword present/absent, JSON value (`$.status`), headers, body, response time |
| | **TLS certificate** | trust, host name, days until expiry (Degraded within N days, Down when expired) |
| Network | **Ping** | reachability, latency, packet loss |
| | **TCP port** | the port accepts connections |
| | **DNS** | A/AAAA/CNAME/MX/TXT/NS, optional expected answer, chosen resolver |
| | **SNMP** | reads an OID (v1, v2c, v3) and compares the value, or its change per second for counters |
| | **Network interface (SNMP)** | a switch, router or firewall port: link state, traffic in and out (bit/s and % of link speed), errors; charted over time |
| | **NTP** | reachability, stratum, clock offset |
| | **SMTP** | 220 greeting, EHLO, optional STARTTLS |
| | **LDAP / Active Directory** | the directory answers (Active Directory: Degraded while the domain controller is not synchronized), or an account signs in and a search finds entries; names locked-out, expired and disabled accounts |
| | **Domain expiry** | registration expiry via RDAP (WHOIS fallback) |
| Databases | **PostgreSQL, MySQL/MariaDB, Microsoft SQL Server, MongoDB, Redis** | connects, optional query with expected result |
| Systems | **SSH command** | exit code or output (contains, exact, regex), optional host-key pinning |
| | **Docker container** | running, and healthy if it has a health check |
| Infrastructure | **vCenter VM** | power state, VMware Tools (vCenter 6.7, 7, 8) |
| | **HPE iLO / Redfish health** | server hardware health from the BMC (iLO 4/5/6, iDRAC, other Redfish BMCs) |
| | **Inlet temperature (iLO / Redfish)** | air temperature entering the server, i.e. in front of its rack: Degraded from 27 °C, Down from 32 °C (ASHRAE), charted over time |
| | **Room temperature** | all inlet sensors tagged `room:<name>` together: Down when several are hot (a cooling problem), Degraded when one is hot or several rise fast |
| Passive | **Push heartbeat** | a job calls a URL; Down when it stops calling |
| | **SNMP traps** | traps a device sends (v1, v2c): Down or Degraded while a problem trap is open; clears by itself, by a clearing trap or by hand |

**Test now** runs a check once from the Fudo server without saving, so you can tune it before
it starts alerting.

## Avoiding false alarms

- **Down after N failures**: a monitor turns Down only after N consecutive failed checks,
  retrying at the faster *retry interval* in between.
- **Up after M successes**: it recovers only after M consecutive successful checks.
- **Degraded above**: slow responses count as Degraded instead of Down.

## Credentials

Passwords, SNMP communities, SSH keys and similar are stored **encrypted** and never shown again,
exported or returned by the API; only the worker decrypts them to run a check. Use read-only
accounts: a vCenter role with *Read-only*, an iLO user with the *Login* privilege, a database
user with `CONNECT`/`SELECT` only.

### Shared credentials

When many monitors sign in with the same account (one read-only iLO user for every server, one
SNMP community for the switches), keep it once under **Credentials** and let the monitors use it.
When the password changes, edit the credential once: every monitor using it checks again at once
with the new value.

- A credential has a kind: *Account and password*, *SSH key*, *SNMP community (v1, v2c)* or
  *SNMPv3 user*. In the monitor form, types that sign in offer **Enter it here** or **Use a shared
  credential**; with a credential, the account fields disappear from the form.
- Credentials belong to one scope: a tenant's monitors can only use that tenant's credentials, and
  monitors of the Global infrastructure scope only global ones.
- Secrets are write-only, like a monitor's own: stored encrypted, never shown, exported or
  returned. The list shows the account and which monitors use it.
- **Same account in several monitors**: the page lists monitors that already store the same
  account and password. Give the group a name and choose **Make a shared credential**: the
  password is copied on the server, nobody needs to know it.
- **Use for…** points more monitors at a credential; their own account and password are removed.
  A credential in use cannot be deleted, and its kind cannot change.
- A monitor that stops using a credential needs its own password again.
- In [configuration as code](configuration-as-code.md) a monitor names its credential
  (`credential: iLO read-only`); the credential itself is created in the interface. Bulk add of
  data center temperature checks can use one too.
- Every change is in the audit log, with the names of the secrets that changed, never their values.

## Push monitors

A push monitor waits for your job to call it. After saving, its page shows the URL:

```bash
curl -fsS "https://fudo.corp.local/api/push/<token>?msg=backup%20ok&ping=5400"   # success
curl -fsS "https://fudo.corp.local/api/push/<token>?status=down&msg=disk%20full" # report a failure
```

It turns Down when no call arrives within the interval plus the grace period. **New URL**
replaces the token if it leaked.

## Bulk add and templates

**Monitors › Bulk add / templates** creates checks for many hosts at once:

1. paste one host or URL per line (or load a CSV with `name,host,port`),
2. pick a **template**, for example *Windows server* (ping, RDP, WinRM), *Linux server*, *HPE
   iLO*, *network device*, *ESXi host*, *vCenter*, *SQL Server*, *storage array* or *web
   application*, or a single check type,
3. optionally create an asset per line, make them depend on an existing asset and add them to
   an application.

It shows a preview of everything it will create before applying.

## Type notes

- **vCenter VM** finds the right API version itself and reuses sessions (one login per vCenter
  every 20 minutes). The VMware Tools check needs vCenter 7.0 or later.
- **HPE iLO / Redfish** names the failing part on HPE iLO (fans, power supplies, storage,
  redundancy). Warning → Degraded, Critical or powered off → Down.
- **SSH command**: set *Host key fingerprint* (`ssh-keyscan host | ssh-keygen -lf -`) so a changed
  server key is reported instead of trusted.
- **Docker container** uses the local Docker socket (mount it into the worker container, see
  `docker-compose.yml`) or a remote Docker API URL.
- **Domain expiry**: some country registries publish neither RDAP nor WHOIS; Fudo reports this as
  Degraded with an explanation.
- **Ping** needs the `NET_RAW` capability in the worker container, and in the API container for **Test now** (both set in `docker-compose.yml`).

## SNMP traps

Point your devices' SNMP traps (v1 or v2c) at the Fudo server, UDP port 162. The **Traps** page
shows whether traps are being received, and every trap with its fields.

- An **SNMP traps** monitor takes the traps of the devices in **From**: addresses, host names or
  IPv4 ranges (`10.0.12.0/24`). With a **Community** (or a shared SNMP community credential) it
  takes only traps carrying it; the community is never stored.
- **Problem traps**: the standard ones (link down, cold and warm start, authentication failure),
  only listed traps (names or OIDs; an OID also covers everything under it, e.g. a vendor's
  enterprise prefix), or any trap. *Only when a field contains* narrows it to traps with a text
  such as `Critical`.
- While a problem is open the monitor is **Down** (or Degraded, if you choose); its incident,
  notifications and on-call paging work as for any check, within a second of the trap.
- Problems are kept per trap and interface: link down on two ports is two problems, and the
  **link up** of one port ends only that port's problem.
- **Problems clear** automatically when no new trap arrives for a while (default 30 minutes), or
  only by hand: the monitor page lists the open traps with **Clear** (until the next matching
  trap). *Clearing traps* end problems too, e.g. a vendor's "condition cleared" trap.
- A trap **no monitor takes** is still kept: under the tenant of the asset with that address,
  otherwise in the Global infrastructure scope. **Create monitor** on the Traps page fills in a
  monitor for its device.
- A device that floods traps is limited (50 per second, bursts of 500); dropped traps are counted
  on the Traps page of the Global scope. Traps are kept for 30 days (Settings › Data retention).

## Network interfaces

A **Network interface (SNMP)** monitor watches one port of a switch, router or firewall.

- **Find interfaces…** (after the host and SNMP access, or a shared credential) lists the device's
  interfaces with description, speed and state. Choose one, or, when adding, tick several: each
  becomes a monitor with the settings of the form, named after the interface.
- The interface is kept by **name** (or description or alias), not by number, because some devices
  renumber their interfaces after a restart. A number also works.
- **Traffic** is the difference between two readings of the 64-bit counters: the first check
  reads twice, two seconds apart; later checks use the reading kept from the check before. After a
  device restart the pair is skipped, so there is no false spike. Devices without 64-bit
  counters (SNMP v1) use 32-bit ones, which are not reliable above about 100 Mbit/s with a
  one-minute interval.
- **Status**: link down → Down; testing or dormant → Degraded; a port disabled on purpose is Up
  (or Down, if you choose). The busier direction above *Degraded from utilisation* (default 80 %)
  → Degraded, above *Down from utilisation* (off by default) → Down; errors above the limit per
  minute → Degraded. If the device reports the wrong speed (a tunnel, a rate-limited circuit),
  set *Link speed*.
- The monitor page charts traffic in and out with the Degraded line.
- The **SNMP** monitor's *Compare: its change per second* does the same for any counter (frames
  on a SAN port, firewall sessions, UPS events).

## Data center temperature

**Temperature** shows every inlet temperature sensor, grouped by its `room:<name>` tag and sorted hottest first, with its rack (`rack:<name>`), current value, last 6 hours, change over 15 minutes and 24-hour range. **Add sensors** creates them for a list of iLO (or other Redfish BMC) addresses with one shared read-only account.

A sensor also turns Degraded when its temperature **rises fast** (by default 3 °C within 15 minutes), even below its thresholds: the earliest sign of a cooling failure. **Create room alert** adds a *Room temperature* monitor for the room: Down when 3 sensors are hot, Degraded when one is hot or 2 rise fast. It opens incidents like any monitor, so ownership, on-call and status pages work for it too.
