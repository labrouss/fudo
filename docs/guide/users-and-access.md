# Users and access

## Roles

| Role | Where | Can |
|---|---|---|
| **Superadmin** | everywhere | everything, including users, tenants and settings |
| **Infrastructure admin** | Global infrastructure scope (and every tenant) | manage shared infrastructure; manage all tenants' data |
| **Tenant admin** | one tenant | manage the tenant: monitors, assets, applications, channels, reports, API tokens |
| **Operator** | one tenant | see everything; pause, resume and test monitors, acknowledge, snooze and resolve incidents, add notes |
| **Viewer** | one tenant | see everything, change nothing |

A user can have a different role in each tenant. Users and tenants are managed by superadmins
under **Administration**.

## Invitations and sign-in

**Administration › Users › Invite user**: name, email, the user's **language** (used for the
invitation email and their first sign-in) and their roles. They receive a one-time link (valid
72 hours) to choose a password and set up **two-factor authentication**, which is mandatory. If
email is not configured, copy the link from the dialog and send it yourself.

Lost phone? Sign in with one of the **recovery codes**. An administrator can also **Reset 2FA**
(the password stays) or **Reset sign-in** (password and 2FA) from the user's dialog; the user
gets a new link.

Accounts are locked for 15 minutes after 5 failed password or code attempts.

## Deactivating and deleting users

**Deactivate** blocks sign-in immediately and keeps the account. **Delete user** removes the
account with its sessions, roles and 2FA; incidents, notes and the audit log keep their history
(shown as *name@example (deleted)*). You cannot delete yourself or the last active superadmin.

## API tokens

**API access** (tenant admins per tenant, infra admins in the Global scope) creates tokens with
one permission:

| Permission | Allows |
|---|---|
| **read** | view monitors, incidents and reports |
| **operate** | also pause/resume, acknowledge, notes, tests |
| **manage** | also create, change and delete |

A token works only in its scope, can expire, can be revoked, and can never manage users,
tenants, settings or other tokens. It is shown once; only a hash is stored.

```bash
curl -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" https://fudo.corp.local/api/incidents
```

API documentation is built in at **/api/docs** (works offline); the machine-readable spec is at
`/api/openapi.json`.

## Audit log

**Administration › Audit log** records sign-ins and failures, lockouts, invitations, and every
change to users, tenants and settings with before and after values.

## Your profile

**Profile** (bottom of the sidebar) is where you change your name and password, move two-factor
authentication to a new phone (the old one works until you confirm the new one), get new recovery
codes, and see your sessions and sign out the others. Changing the password or the phone signs out
your other sessions.

Its tabs: **Your details**, **Password**, **Two-factor authentication**, **Sessions** and **On-call** (your on-call shifts, contact methods and notification steps). The address keeps the open tab, for example `/profile#sessions`.

**Contact methods** are how Fudo reaches you personally, for example when you are on call: email, a
Microsoft Teams workflow that posts to your chat, or Telegram (once an administrator connects a
Telegram bot under *Settings*). Each method is confirmed with a 6-digit code first. **Your
notification steps** say which methods to use and when, for example email at once and Telegram after
5 minutes, until the incident is acknowledged.

## Teams and ownership

**Teams** groups the people responsible for applications and infrastructure, for example a
*Database Group* in a tenant or a *Storage team* in the Global infrastructure scope. Members are
**members** or **leads**; only people with access to the team's scope can be added.

Choose the **owner team** on an application's or asset's page. Every incident then shows its owner
and leads, including incidents of monitors (through their asset or application), and so do
post-incident reports. Tenant items are owned by the tenant's teams, shared infrastructure by global
teams. On-call rotations are set per team.
