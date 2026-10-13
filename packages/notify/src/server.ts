/**
 * Server-side notification plumbing (Node only): encrypted channel config, the outbox
 * (enqueue with routing and suppression), and sending one delivery.
 */
import type pg from "pg";
import { decrypt, deriveKey, encrypt } from "@fudo/shared";
import { getChannelType, secretKeys, severityRank } from "./definitions.js";
import { buildMessage, incNo, langFor, type MessageContext, type MessageLang, type NotifyEvent } from "./message.js";
import { serverI18n } from "./i18n.js";
import { sendMessage, type SmtpConfig } from "./senders.js";

export { sendMessage } from "./senders.js";
export { buildMessage, incNo, langFor, ENGLISH, type MessageLang } from "./message.js";
export { ServerI18n, serverI18n } from "./i18n.js";
export { NOTIFY_TEXTS } from "./texts.js";

export const channelKey = (appSecret: string) => deriveKey(appSecret, "channel-config");
export const encryptConfig = (cfg: Record<string, unknown>, appSecret: string) => encrypt(JSON.stringify(cfg), channelKey(appSecret));
export const decryptConfig = (enc: string, appSecret: string) => JSON.parse(decrypt(enc, channelKey(appSecret))) as Record<string, unknown>;

/** Config safe for the browser: secret values replaced by a marker. */
export function maskConfig(type: string, cfg: Record<string, unknown>): Record<string, unknown> {
  const out = { ...cfg };
  for (const k of secretKeys(type)) if (out[k]) out[k] = "__unchanged__";
  return out;
}
/** Merge an edited config with the stored one: "__unchanged__" or empty secrets keep the stored value. */
export function mergeSecrets(type: string, incoming: Record<string, unknown>, stored: Record<string, unknown> | null): Record<string, unknown> {
  const out = { ...incoming };
  for (const k of secretKeys(type)) if ((out[k] === "__unchanged__" || out[k] === undefined) && stored) out[k] = stored[k];
  return out;
}

export async function loadSmtp(c: pg.PoolClient | pg.Pool, appSecret: string): Promise<SmtpConfig | null> {
  const r = await c.query("SELECT value FROM settings WHERE key = 'smtp'");
  const s = r.rows[0]?.value;
  if (!s) return null;
  return { host: s.host, port: s.port, secure: s.secure, username: s.username ?? "", password: s.passwordEnc ? decrypt(s.passwordEnc, deriveKey(appSecret, "smtp-password")) : "", from: s.from, allowUntrusted: Boolean(s.allowUntrusted) };
}

/** The organisation's default language for notifications, emails and reports ("en" when not set). */
export async function defaultLocale(c: pg.PoolClient | pg.Pool): Promise<string> {
  const r = await c.query("SELECT value FROM settings WHERE key = 'notify.locale'");
  const v = r.rows[0]?.value;
  return typeof v === "string" && serverI18n().has(v) ? v : "en";
}

/** A message language: the given locale if its file exists, else the organisation's default. */
export async function messageLang(c: pg.PoolClient | pg.Pool, locale: string | null | undefined): Promise<MessageLang> {
  const code = locale && serverI18n().has(locale) ? locale : await defaultLocale(c);
  const i18n = serverI18n();
  return langFor(code, i18n.lookup(code), i18n.numberLocale(code));
}

const RATE_LIMIT = { count: 30, minutes: 10 };

/**
 * Queues notifications for an incident event on every matching channel, recording why a
 * channel was skipped (suppressed) so the delivery log explains itself.
 */
export async function enqueueNotifications(pool: pg.Pool, incidentId: string, event: Exclude<NotifyEvent, "test">, opts: { channelId?: string } = {}): Promise<number> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('fudo.all_tenants', 'on', true)");
    const inc = (await c.query("SELECT * FROM incidents WHERE id = $1", [incidentId])).rows[0];
    if (!inc) { await c.query("ROLLBACK"); return 0; }
    const baseEvent = event === "reopened" ? "opened" : event;
    const channels = (await c.query(
      `SELECT ch.*, (SELECT count(*) FROM notification_deliveries d WHERE d.channel_id = ch.id AND d.status IN ('sent','queued','sending')
                      AND d.created_at > now() - make_interval(mins => $2)) AS recent,
              EXISTS (SELECT 1 FROM application_channels ac WHERE ac.channel_id = ch.id AND $3::text = 'application' AND ac.application_id = $4::uuid) AS linked
         FROM notification_channels ch
        WHERE ch.enabled AND (ch.tenant_id IS NOT DISTINCT FROM $1::uuid OR (ch.tenant_id IS NULL AND ch.all_tenants AND $1::uuid IS NOT NULL))`,
      [inc.tenant_id, RATE_LIMIT.minutes, inc.entity_type, inc.entity_id],
    )).rows;
    const impacted = inc.parent_id !== null || inc.entity_status === "IMPACTED";
    let n = 0;
    for (const ch of channels) {
      if (opts.channelId && ch.id !== opts.channelId) continue;
      // per-application routing: such a channel only hears about the applications linked to it
      if (ch.routing === "selected" && !ch.linked) continue;
      const escalation = ch.escalate_after_minutes > 0;
      if (event === "escalated") {
        if (!escalation || !opts.channelId) continue;
      } else if (escalation) {
        // escalation steps only hear about incidents that were escalated to them
        if (event !== "acknowledged" && event !== "resolved") continue;
        const was = await c.query("SELECT 1 FROM notification_deliveries WHERE incident_id = $1 AND channel_id = $2 AND event = 'escalated' AND status IN ('queued','sending','sent')", [incidentId, ch.id]);
        if (!was.rowCount) continue;
      } else if (event === "reminder" ? ch.remind_minutes <= 0 : !ch.events.includes(baseEvent)) continue;
      if (severityRank(inc.severity) < severityRank(ch.min_severity)) continue;
      let suppressed: string | null = null;
      if (impacted && ch.skip_impacted) suppressed = "Caused by another incident (channel skips impacted incidents)";
      else if (impacted && ch.tenant_id === null && inc.tenant_id !== null) suppressed = "Caused by an infrastructure incident; this channel receives the root incident instead";
      else if ((event === "opened" || event === "reminder" || event === "escalated") && inc.snoozed_until && new Date(inc.snoozed_until) > new Date()) suppressed = "Incident is snoozed";
      else if (Number(ch.recent) >= RATE_LIMIT.count) suppressed = `Rate limit: more than ${RATE_LIMIT.count} messages in ${RATE_LIMIT.minutes} minutes`;
      await c.query(
        `INSERT INTO notification_deliveries (tenant_id, channel_id, incident_id, event, status, detail) VALUES ($1, $2, $3, $4, $5, $6)`,
        [inc.tenant_id, ch.id, incidentId, event, suppressed ? "suppressed" : "queued", suppressed ?? ""],
      );
      if (event === "escalated" && !suppressed) {
        await c.query("INSERT INTO incident_events (incident_id, tenant_id, kind, body) VALUES ($1, $2, 'escalated', $3)",
          [incidentId, inc.tenant_id, `Escalated to ${ch.name}: not acknowledged after ${ch.escalate_after_minutes} min`]);
      }
      n++;
    }
    if (event === "reminder" || event === "opened" || event === "reopened") await c.query("UPDATE incidents SET last_notified_at = now() WHERE id = $1", [incidentId]);
    await c.query("COMMIT");
    return n;
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

/** Builds the message context for an incident (tenant name, cause, similar resolution, link). */
export async function incidentContext(c: pg.PoolClient, incidentId: string, event: NotifyEvent, baseUrl: string | null): Promise<MessageContext | null> {
  const i = (await c.query(
    `SELECT i.*, t.name AS tenant_name, p.number AS parent_number, u.display_name AS ack_name
       FROM incidents i LEFT JOIN tenants t ON t.id = i.tenant_id LEFT JOIN incidents p ON p.id = i.parent_id
       LEFT JOIN users u ON u.id = i.acknowledged_by WHERE i.id = $1`, [incidentId])).rows[0];
  if (!i) return null;
  const similar = (await c.query(
    `SELECT s.number, s.resolved_at, e.body FROM incidents s
       JOIN LATERAL (SELECT body FROM incident_events WHERE incident_id = s.id AND kind = 'note' AND note_type = 'resolution' ORDER BY ts DESC LIMIT 1) e ON true
      WHERE s.status = 'resolved' AND s.id <> $1
        AND ((s.entity_type = $2 AND s.entity_id = $3) OR ($4::text IS NOT NULL AND (s.cause->>'id' = $4 OR s.entity_id::text = $4)))
      ORDER BY s.resolved_at DESC LIMIT 1`,
    [i.id, i.entity_type, i.entity_id, i.cause?.id ?? null])).rows[0];
  const org = (await c.query("SELECT value FROM settings WHERE key = 'org.name'")).rows[0]?.value ?? null;
  return {
    event,
    incident: {
      number: i.number, title: i.title, titleParts: i.title_parts ?? null, severity: i.severity, status: i.status, entityType: i.entity_type, entityName: i.entity_name,
      entityStatus: i.entity_status, tenantName: i.tenant_name ?? null, openedAt: new Date(i.opened_at).toISOString(),
      resolvedAt: i.resolved_at ? new Date(i.resolved_at).toISOString() : null, cause: i.cause ?? null, parentNumber: i.parent_number ?? null,
      acknowledgedBy: i.ack_name ?? null,
    },
    similar: similar ? { number: similar.number, resolvedAt: new Date(similar.resolved_at).toISOString(), resolution: similar.body } : null,
    link: baseUrl ? `${baseUrl}/incidents/${i.id}` : null,
    orgName: org,
  };
}

/** What Kuma providers receive as the monitor/heartbeat for an incident message. */
export function kumaContext(ctx: MessageContext, incidentId: string, baseUrl: string | null) {
  return { incidentId, name: `${ctx.incident.entityName} (${incNo(ctx.incident.number)})`, down: ctx.event !== "resolved", baseURL: baseUrl, openedAt: ctx.incident.openedAt };
}

/** Webhook payload: stable, documented JSON for integrations. */
export function webhookPayload(ctx: MessageContext, incidentId: string | null) {
  return { event: ctx.event, incident: incidentId ? { id: incidentId, key: incNo(ctx.incident.number), ...ctx.incident } : null, organization: ctx.orgName };
}

export async function sendTest(type: string, cfg: Record<string, unknown>, smtp: SmtpConfig | null, orgName: string | null, link: string | null, lang?: MessageLang): Promise<string> {
  if (!getChannelType(type)) throw new Error("Unknown channel type");
  const ctx: MessageContext = { event: "test", incident: null as never, similar: null, link, orgName };
  return sendMessage(type, cfg, buildMessage(ctx, lang), { smtp, payload: { event: "test", incident: null, organization: orgName } });
}
export { sendPersonal, smtpSender, teamsUrlAllowed, telegramBotName, type PersonalDeps, type PersonalType } from "./personal.js";
