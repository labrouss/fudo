import type pg from "pg";
import type { Logger } from "pino";
import { buildMessage, decryptConfig, enqueueNotifications, incidentContext, kumaContext, loadSmtp, messageLang, sendMessage, webhookPayload } from "@fudo/notify/server";

const BACKOFF_MIN = [1, 5, 15];

/**
 * Sends queued notification deliveries (the outbox written by the API and the incident manager),
 * with retries and backoff, and queues reminders for incidents nobody has acknowledged.
 */
export class Dispatcher {
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private lastReminderCheck = 0;

  constructor(private pool: pg.Pool, private log: Logger, private appSecret: string, private publicUrl: string | undefined) {}

  start() { void this.tick(); }
  stop() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }

  private async baseUrl(c: pg.PoolClient): Promise<string | null> {
    if (this.publicUrl) return this.publicUrl;
    return (await c.query("SELECT value FROM settings WHERE key = 'app.baseUrl'")).rows[0]?.value ?? null;
  }

  private async tick() {
    if (this.stopped) return;
    try {
      await this.pool.query(`UPDATE notification_deliveries SET status = 'queued' WHERE status = 'sending' AND next_attempt_at < now() - interval '5 minutes'`);
      const due = await this.pool.query(
        `UPDATE notification_deliveries d SET status = 'sending', attempts = attempts + 1, next_attempt_at = now()
           FROM (SELECT id FROM notification_deliveries WHERE status = 'queued' AND next_attempt_at <= now() ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED) q
          WHERE d.id = q.id RETURNING d.*`);
      await Promise.all(due.rows.map((d) => this.deliver(d)));
      if (Date.now() - this.lastReminderCheck > 30_000) { this.lastReminderCheck = Date.now(); await this.reminders(); await this.escalations(); }
    } catch (err) {
      this.log.error({ err }, "dispatcher tick failed");
    }
    this.timer = setTimeout(() => void this.tick(), 2000);
  }

  private async deliver(d: Record<string, any>) {
    const c = await this.pool.connect();
    try {
      const ch = (await c.query("SELECT * FROM notification_channels WHERE id = $1", [d.channel_id])).rows[0];
      if (!ch) return;
      const base = await this.baseUrl(c);
      const ctx = await incidentContext(c, d.incident_id, d.event, base);
      if (!ctx) { await c.query("UPDATE notification_deliveries SET status = 'failed', detail = 'Incident no longer exists' WHERE id = $1", [d.id]); return; }
      const cfg = decryptConfig(ch.config_enc, this.appSecret);
      const smtp = ch.type === "email" ? await loadSmtp(c, this.appSecret) : null;
      const detail = await sendMessage(ch.type, cfg, buildMessage(ctx, await messageLang(c, ch.locale)), { smtp, payload: webhookPayload(ctx, d.incident_id), kuma: kumaContext(ctx, d.incident_id, base) });
      await c.query("UPDATE notification_deliveries SET status = 'sent', sent_at = now(), detail = $2 WHERE id = $1", [d.id, detail.slice(0, 500)]);
      this.log.info({ channel: ch.name, event: d.event }, "notification sent");
    } catch (err) {
      const msg = (err as Error).message.slice(0, 500);
      const retry = d.attempts <= BACKOFF_MIN.length;
      await c.query(
        retry
          ? "UPDATE notification_deliveries SET status = 'queued', detail = $2, next_attempt_at = now() + make_interval(mins => $3) WHERE id = $1"
          : "UPDATE notification_deliveries SET status = 'failed', detail = $2 WHERE id = $1",
        retry ? [d.id, `Attempt ${d.attempts} failed: ${msg}`, BACKOFF_MIN[d.attempts - 1]] : [d.id, `Gave up after ${d.attempts} attempts: ${msg}`],
      );
      this.log.warn({ err: msg, delivery: d.id, attempt: d.attempts }, "notification failed");
    } finally {
      c.release();
    }
  }

  /** Escalation steps: open (unacknowledged, unsnoozed) incidents older than a channel's delay, not yet escalated there. */
  private async escalations() {
    const r = await this.pool.query(
      `SELECT i.id AS incident_id, ch.id AS channel_id FROM incidents i
         JOIN notification_channels ch ON ch.enabled AND ch.escalate_after_minutes > 0
          AND (ch.tenant_id IS NOT DISTINCT FROM i.tenant_id OR (ch.tenant_id IS NULL AND ch.all_tenants AND i.tenant_id IS NOT NULL))
          AND (ch.routing = 'all' OR EXISTS (SELECT 1 FROM application_channels ac WHERE ac.channel_id = ch.id AND i.entity_type = 'application' AND ac.application_id = i.entity_id))
        WHERE i.status = 'open' AND (i.snoozed_until IS NULL OR i.snoozed_until < now())
          AND i.opened_at <= now() - make_interval(mins => ch.escalate_after_minutes)
          AND NOT EXISTS (SELECT 1 FROM notification_deliveries d WHERE d.incident_id = i.id AND d.channel_id = ch.id AND d.event = 'escalated')`);
    for (const row of r.rows) await enqueueNotifications(this.pool, row.incident_id, "escalated", { channelId: row.channel_id });
  }

  /** Re-notify open, unacknowledged, unsnoozed incidents on channels with a reminder interval. */
  private async reminders() {
    const r = await this.pool.query(
      `SELECT i.id FROM incidents i
        WHERE i.status = 'open' AND (i.snoozed_until IS NULL OR i.snoozed_until < now())
          AND EXISTS (SELECT 1 FROM notification_channels ch WHERE ch.enabled AND ch.remind_minutes > 0 AND ch.escalate_after_minutes = 0
                        AND (ch.tenant_id IS NOT DISTINCT FROM i.tenant_id OR (ch.tenant_id IS NULL AND ch.all_tenants))
                        AND coalesce(i.last_notified_at, i.opened_at) < now() - make_interval(mins => ch.remind_minutes))`);
    for (const row of r.rows) await enqueueNotifications(this.pool, row.id, "reminder");
  }
}
