# Dashboards and reports

## Overview

Open incidents, mean time to recover (MTTR, 30 days), monitors up and failing, applications on
SLA target, and a card per application with its 30-day availability strip. Pages update live
(about a second after a change); the sidebar shows **Live** while connected.

**Availability** comes from status history: down and impacted time count against it; planned
maintenance and the time before the first check do not.

## Charts

Each monitor shows its response time for 1 h, 6 h, 24 h, 7 d, 30 d and 90 d (average, p95,
failures, maintenance), its latest checks as a heartbeat strip, its status changes and its
recent results.

## Reports

**Reports** shows, per application (or per shared asset in the Global scope):
availability 24/7 and during **business hours**, downtime, planned maintenance, incidents, SLA
met or missed, MTTA (time to acknowledge) and MTTR (time to resolve). Choose last week, last
month, the last 30 days or custom dates, and download it as:

- **PDF**: in your language; Arabic reports are laid out right to left,
- **CSV**: availability and incidents, UTF-8 for Excel, with English column names so
  spreadsheets and scripts keep working.

## Scheduled reports

**Reports › New schedule** emails the PDF and/or CSV every Monday (previous week) or on the 1st
(previous month) at a chosen hour and time zone, in the schedule's language, through the SMTP
server from Settings. **Send now** sends the last period immediately.

## Status pages

**Status pages › New status page** shows chosen applications, assets and monitors on a page of
its own at `/status/<address>`, with the overall status, 90 days of availability, current incidents
and maintenance. Each item gets a **display name**, shown instead of its internal name; items with
the same group are shown together. Tenant pages may include shared infrastructure.

- **Public**: anyone with the link, without signing in. The page shows only display names and plain
  statuses (*Operational, Degraded, Outage, Maintenance*), never internal names, causes, incident
  titles or maintenance names.
- **Internal**: signed-in users with access to the tenant, who also see incident titles and
  maintenance names.

The page refreshes every minute and uses the visitor's language and light or dark mode.
