# Concepts

## Scopes: tenants and global infrastructure

| Scope | Contains | Managed by |
|---|---|---|
| **Tenant** (one per business unit) | its applications, monitors, assets, channels, reports | tenant admins |
| **Global infrastructure** | shared assets (switches, storage arrays, FC fabrics, clusters) and their monitors | infra admins and superadmins |

Pick the scope in the switcher at the top of the sidebar. Tenants see shared infrastructure
read-only and link their own monitors and applications to it, so a storage failure shows up as
the cause of every application that needs that storage.

## Building blocks

| Thing | What it is | Example |
|---|---|---|
| **Monitor** | one check, run on a schedule | HTTPS on `erp.corp.local/health` |
| **Asset** | a piece of infrastructure, checked by its monitors | `Core-SW-01`, `SAN-A` |
| **Application** | a business service: monitors (members) plus the infrastructure it needs | *ERP Production* |
| **Dependency** | "this needs that": asset → asset, application → asset | ESXi cluster → SAN-A |

```
application ──members──▶ monitors ──check──▶ asset ──depends on──▶ asset …
     └──────────────────depends on──────────────────▶ asset
```

On an asset, **Add existing** puts monitors you already have on it (one that is on another asset moves) and **New monitor** opens the monitor form for it. A tenant can also put its own monitors on a shared Global asset; **Remove** takes a monitor off the asset and keeps it.

## Statuses

| Status | Meaning |
|---|---|
| **Up** | working |
| **Degraded** | working, but slow or partly failing (e.g. an optional member is down) |
| **Down** | failing, and nothing it depends on explains it: this is a **root cause** |
| **Impacted** | failing **because** something it depends on is down: alerts point to the root cause |
| **At risk** | working, but something it depends on has a problem |
| **Maintenance** | in a planned maintenance window: not counted against availability |
| **Pending** | no result yet |

## How Fudo finds the root cause

| Situation | Result |
|---|---|
| An asset's own checks fail and nothing it depends on is down | **Down**: root cause, it gets its own incident |
| Its checks fail **and** something it depends on is down | **Impacted by** that root cause: no separate alert storm |
| Its checks pass but something it depends on is down | keeps its status, marked **At risk** |
| Something it depends on is in planned maintenance | **Impacted by maintenance** (planned, excluded from availability) |

An application is healthy when its members are, according to its rule: **all required members
up**, **at least one**, or **at least N of M** (for redundant services). Required members decide
the status; optional ones can only make it *Degraded*.

**What if this fails?** on an asset predicts which applications would go down, and which survive
thanks to redundancy, before you take it down for work.

The **Topology** page draws the whole picture with live status: hover over an item to trace its
dependencies, *Problems only* shows what is failing and what depends on it.
