# Notifications

## Channels

**Notifications › Add channel**. Built in: **Email** (needs the SMTP server from Settings),
**Microsoft Teams** (Workflows webhook), **Slack** (incoming webhook) and **Webhook (JSON)**.
More than 100 others (Telegram, Discord, PagerDuty, Opsgenie, ntfy, Pushover, Signal, Twilio
and other SMS gateways, Mattermost, Matrix, Google Chat, …) come from Uptime Kuma's notification
providers. **Send test** checks a channel; **Log** shows every delivery and why a channel was
skipped.

Chat messages start with **[Fudo]**, so they are easy to tell apart from other tools posting to
the same chat.

## Which incidents a channel receives

| Setting | Effect |
|---|---|
| **Send** | *All incidents in this tenant* (default) or *Only incidents of selected applications* |
| **Minimum severity** | minor and above (all), major and critical, or critical only |
| **Events** | opened, acknowledged, resolved |
| **Skip incidents caused by another** | only root causes, not the impacted incidents linked to them |
| **Remind until acknowledged** | repeat every N minutes while nobody acknowledges |
| **Language of messages** | the channel's language; default: the organization's (Settings) |

Tenant channels receive the tenant's incidents, including those caused by shared
infrastructure (with the root cause in the message). Global channels receive infrastructure
incidents; with **all tenants** (a NOC channel) they also receive every tenant's incidents,
except those caused by an infrastructure incident they already received.

**Per application:** a channel set to *selected applications* only hears about those. Pick them
in the channel form, or on an application's page in its **Notifications** card, which also warns
when an application's incidents reach no channel at all.

## Escalation

Give a channel a delay (**Escalation: not acknowledged after 15 min**) and it becomes an
escalation step: it is notified only if the incident is still open, unacknowledged and not
snoozed after that time, and afterwards receives its acknowledgement and resolution. Chain
several: Teams immediately → on-call SMS after 15 minutes → manager after 60 minutes.

## Delivery

Messages go through an outbox with retries (after 1, 5 and 15 minutes) and a per-channel rate
limit, so a flood of incidents cannot get your bot or mail relay blocked.

## Webhook payload

```json
{ "event": "opened",
  "incident": { "key": "INC-0042", "title": "ERP Production is down", "severity": "major",
                "status": "open", "entityType": "application", "entityName": "ERP Production",
                "entityStatus": "DOWN", "tenantName": "Finance", "cause": null, "parentNumber": null },
  "organization": "Acme" }
```

Set a **signing secret** to receive `X-Fudo-Signature: sha256=<HMAC of the body>`. The payload
stays in English (it is a stable format for integrations); `incident.titleParts` carries the
title as message codes if you want to translate it yourself.

## On-call

Teams page people for incidents of the items they own. On **Teams › On-call**, put the members in
rotation order, choose the shift length (one day, one week, two weeks or any number of days), the
handover time and time zone, and the incidents to page for. **Escalation** steps say who is paged and
when, counted from when the incident opened, for example the person on call at once, the next person
after 15 minutes and the team's leads after 30. **Overrides** let someone else cover a period, such as a
swap or a holiday.

Each paged person is reached through their own notification steps (see *Your profile*), or by email at
their sign-in address if they have none. Paging stops as soon as someone acknowledges the incident and
pauses while it is snoozed. The incident page shows who was paged and what was sent; your profile shows
your coming shifts.

On-call messages include **Acknowledge** and **Open in Fudo** links (set `PUBLIC_URL`). Acknowledge opens a page where one tap acknowledges the incident as you, without signing in; just opening the link changes nothing, so link previews and email scanners cannot acknowledge by accident. Each link works once, for 24 hours, while the incident is open, and only if your role may acknowledge incidents.
