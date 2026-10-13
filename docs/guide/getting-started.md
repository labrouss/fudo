# Getting started

Fudo tells you whether your business applications are up, **why** they are down, and what fixed
similar problems before. This page takes you from a fresh installation to your first alert.

## 1. First sign-in

After installation (see [Installation](../admin/installation.md)), open Fudo in the browser. The
**setup wizard** asks for:

1. your organization's name,
2. the first administrator (name, email, password of at least 12 characters),
3. two-factor authentication: scan the QR code with an authenticator app (Microsoft
   Authenticator, Google Authenticator, 1Password, …) and **save the recovery codes**,
4. optionally the email (SMTP) server, used for invitations, alerts and reports. You can also
   set it later under **Settings**.

Two-factor authentication is mandatory for every account.

## 2. Create a tenant

A **tenant** is a business unit, for example *Finance* or *HR*. Its applications, monitors and
notification channels are separate from other tenants'. Go to **Administration › Tenants ›
New tenant**, then pick it in the tenant switcher at the top of the sidebar.

Shared infrastructure (core switches, storage, clusters) belongs to the **Global
infrastructure** scope instead; see [Concepts](concepts.md).

## 3. Add a monitor

**Monitors › Add monitor**, choose a type (for example *HTTP(S)* or *Ping*), fill in the
target and press **Test now** to run the check once without saving. Save it; results appear
within one check interval. For many hosts at once use **Bulk add / templates**; see
[Monitors](monitors.md).

## 4. Group monitors into an application

**Applications › New application**, then add the monitors that make up the service (web front
end, API, database). The application's status shows whether the service works, and why not.
Set a **SLA target** to track it in reports.

## 5. Get notified

**Notifications › Add channel**: Email, Microsoft Teams, Slack, a JSON webhook or one of more
than 100 others (Telegram, PagerDuty, SMS gateways, …). **Send test** checks the channel.
See [Notifications](notifications.md).

## 6. Invite your colleagues

**Administration › Users › Invite user**: choose their language and their role per tenant.
They get a one-time link to choose a password and set up two-factor authentication. See
[Users and access](users-and-access.md).

## Where to go next

- [Concepts](concepts.md): scopes, assets, dependencies and how Fudo finds the root cause
- [Incidents](incidents.md): what happens when something fails
- [Troubleshooting](troubleshooting.md): common questions
