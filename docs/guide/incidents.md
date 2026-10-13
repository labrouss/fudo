# Incidents

Fudo opens incidents by itself when something fails and resolves them when it recovers.

## When an incident opens

| Item | Opens an incident when | Severity |
|---|---|---|
| **Application** | Down, or Impacted by an unplanned cause | from its criticality: critical → critical, high → major, others → minor |
| **Asset** | Down (it is a root cause) | major |
| **Monitor** | Down, and not part of an asset or application | minor |

An incident that is **Impacted** links to the incident of its root cause (*Caused by INC-…*), so
one failing switch gives one root incident plus clearly linked impacted ones, not an alert storm.

## Life of an incident

1. **Opened** automatically, notifications go out (see [Notifications](notifications.md)).
2. **Acknowledge** it to show someone is on it; this stops reminders and escalations.
3. **Snooze** silences notifications for a while (30 minutes to 1 day) without acknowledging.
4. **Resolved** automatically when the item recovers. If it fails again within 5 minutes, the
   same incident **reopens** instead of a new one. You can also resolve it by hand.

The **timeline** records every step: status changes, notifications, acknowledgements and notes.

## Notes: share what you learned

Add notes to the timeline as a **Comment**, an **Action taken** or a **Resolution**, with tags
(e.g. `supervisor`, `firmware`).

Resolutions are reused: when a similar incident happens later (same item, same root cause,
shared tags or similar text), **Similar past incidents** shows what fixed it, and its alerts
quote it: *"Last time (INC-0041, 12 Aug 2026) this was resolved by: …"*.

## Finding incidents

**Incidents** lists the **open** incidents of the scope selected in the sidebar; switch to
*Resolved* for history, and search by title, INC number or tag. Incidents of another tenant
appear when you switch to that tenant (see [Troubleshooting](troubleshooting.md)).

## Post-incident reports

**Post-incident report** on an incident downloads a report as **PDF** or **Markdown** (for a wiki or a ticket): a summary with times and who acknowledged and resolved it, the impacted incidents, the resolution and actions taken, the timeline, the notifications sent and similar past incidents. It uses your language and your time zone, and can be made while the incident is still open.
