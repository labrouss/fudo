# Settings

**Settings** (bottom of the sidebar) has your own preferences for everyone, and system settings
for superadmins.

Each section is a tab. The address keeps the open tab (for example `/settings#retention`), so a tab can be bookmarked or sent as a link.

## Your preferences

- **Interface language**: 13 languages, including Arabic with a right-to-left layout. Saved to your
  profile, so it follows you to any browser. Incident titles and check results are translated
  too.
- **Theme**: **System** (follows your operating system's light or dark mode), **Light**,
  **Dark**, **Monokai**, plus any theme your administrator adds.

## System settings (superadmins)

### Notification language

**Default language** of notifications and scheduled reports. Each channel and schedule can use
its own; emails to a person (invitations, password resets) use that person's language. It does not
change the interface: everyone chooses that under *Preferences*.

### Email (SMTP)

Used for invitations, email alerts and scheduled reports.

| Field | Notes |
|---|---|
| SMTP host, port | 587 (STARTTLS) or 465 (*Use TLS from the start*); 25 for an internal relay |
| User name, password | optional; the password is stored encrypted and never shown again |
| Sender address | e.g. `fudo@corp.local` |
| **Accept self-signed certificates** | for a local relay with a self-signed or internal certificate: the connection stays encrypted, only the certificate check is skipped |

**Send test email** shows a precise reason when something is wrong: an untrusted certificate, a
wrong password, a server that cannot be reached, or a TLS mode that does not match the port.

## For administrators

New languages and themes can be added by dropping files into folders, without rebuilding; see
`locales/README.md` and `themes/README.md` in the repository.

## Data retention

**Settings › Data retention** (superadmins) sets how long each kind of data is kept and shows the space it uses: raw check results, hourly and daily summaries, status history, resolved incidents, the notification log, the audit log and finished maintenance windows. Old data is removed every hour, a little at a time. Minimums protect what Fudo shows (90-day charts, availability reports, status pages), and the last status change before the cutoff is always kept, so availability stays exact. Open incidents and notifications still waiting to be sent are never removed.
