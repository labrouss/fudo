# Troubleshooting

### I got an alert, but the incident list is empty

- **Another tenant**: the list shows the scope selected in the sidebar. A channel set to *all
  tenants* receives every tenant's incidents; switch tenant to see them.
- **Already resolved**: short outages open and close an incident within minutes; look under
  *Resolved*.
- **Not from Fudo**: Fudo's chat messages start with **[Fudo]** and never contain raw error codes
  such as `EHOSTUNREACH`. If you still run another monitoring tool (for example Uptime Kuma)
  posting to the same chat, that alert came from it. The channel's **Log** lists everything Fudo
  sent.

### A monitor fails with "Host unreachable" or "Timed out"

The check runs from the Fudo **worker** container, not from your PC. Make sure the worker's host
can reach the target (routing, firewalls). For Ping, the containers need the `NET_RAW`
capability (set in `docker-compose.yml`).

### "The SMTP server's certificate is not trusted"

Your mail relay uses a self-signed or internal certificate. Enable **Accept self-signed
certificates** under Settings › Email (SMTP).

### Everything behind one switch turned red at once

That is expected, and Fudo handles it: the switch is **Down** (root cause) and the items behind
it are **Impacted**. You get one root incident with the others linked to it. Make sure the
dependencies are modelled (asset *depends on* switch) so Fudo can tell.

### A planned change paged the on-call team

Create a [maintenance window](maintenance.md) for the affected assets first: checks keep running
but alerts are suppressed and the time does not count against availability.

### An application's incidents reach nobody

Open the application: its **Notifications** card warns when no channel receives its incidents
(for example when every channel is set to *selected applications* without it).

### The page says "Reconnecting to live updates"

The browser lost its connection to the API; pages refresh again automatically once it is back.
If it stays, check that a proxy in front of Fudo allows long-lived connections (Server-Sent
Events) to `/api/live`.

### I lost my phone

Sign in with a recovery code, or ask an administrator to **Reset 2FA** for your account.
