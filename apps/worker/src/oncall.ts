/**
 * On-call escalation. Every 30 seconds:
 *  1. stop paging for incidents that are no longer open (acknowledged or resolved);
 *  2. engage the people whose escalation step is due (on-call person, next in rotation, leads,
 *     whole team) for open incidents of items owned by a team with an enabled schedule;
 *  3. follow each engaged person's own notification steps (claimed in the database first, so a
 *     step is never sent twice), pausing while an incident is snoozed.
 */
import type pg from "pg";
import type { Logger } from "pino";
import { randomBytes } from "node:crypto";
import { decrypt, deriveKey, nextInRotation, onCallAt, sha256, type OncallOverride, type OncallSchedule } from "@fudo/shared";
import { incNo, loadSmtp, messageLang, sendPersonal, smtpSender, type PersonalDeps, type PersonalType } from "@fudo/notify/server";

const SEV = { minor: 1, major: 2, critical: 3 } as const;
type Step = { target: "oncall" | "next" | "leads" | "team"; afterMin: number };

export class OncallEscalator {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(private pool: pg.Pool, private log: Logger, private appSecret: string, private publicUrl: string | undefined) {}
  start() { this.timer = setInterval(() => void this.tick(), 30_000); setTimeout(() => void this.tick(), 5_000); }
  stop() { if (this.timer) clearInterval(this.timer); }

  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try { await this.engage(now); await this.send(now); }
    catch (e) { this.log.error({ err: e }, "on-call escalation"); }
    finally { this.running = false; }
  }

  /** Steps 1 and 2, in one transaction. */
  private async engage(now: Date) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('fudo.all_tenants', 'on', true)");
      await c.query(`UPDATE oncall_pages p SET done_at = now() FROM incidents i WHERE p.incident_id = i.id AND p.done_at IS NULL AND i.status <> 'open'`);
      const incidents = (await c.query(`
        SELECT i.id, i.tenant_id, i.severity, i.opened_at, t.team_id
          FROM incidents i
          CROSS JOIN LATERAL (SELECT CASE i.entity_type
            WHEN 'application' THEN (SELECT owner_team_id FROM applications WHERE id = i.entity_id)
            WHEN 'asset' THEN (SELECT owner_team_id FROM assets WHERE id = i.entity_id)
            WHEN 'monitor' THEN (SELECT coalesce(a.owner_team_id, (SELECT ap.owner_team_id FROM application_members am JOIN applications ap ON ap.id = am.application_id
                                   WHERE am.monitor_id = m.id AND ap.owner_team_id IS NOT NULL ORDER BY am.required DESC, ap.name LIMIT 1))
                                 FROM monitors m LEFT JOIN assets a ON a.id = m.asset_id WHERE m.id = i.entity_id)
          END AS team_id) t
         WHERE i.status = 'open' AND (i.snoozed_until IS NULL OR i.snoozed_until <= now())
           AND i.opened_at > now() - interval '1 day' AND t.team_id IS NOT NULL`)).rows;
      for (const inc of incidents) {
        const sch = (await c.query(`SELECT * FROM oncall_schedules WHERE team_id = $1 AND enabled`, [inc.team_id])).rows[0];
        if (!sch || SEV[inc.severity as keyof typeof SEV] < SEV[sch.min_severity as keyof typeof SEV]) continue;
        const schedule: OncallSchedule = { participants: sch.participants, shiftDays: sch.shift_days, handoverTime: sch.handover_time, timezone: sch.timezone, startDate: new Date(sch.start_date).toISOString().slice(0, 10) };
        const overrides: OncallOverride[] = (await c.query(`SELECT user_id, starts_at, ends_at, created_at FROM oncall_overrides WHERE team_id = $1 AND ends_at > now()`, [inc.team_id])).rows
          .map((o) => ({ userId: o.user_id, startsAt: new Date(o.starts_at), endsAt: new Date(o.ends_at), createdAt: new Date(o.created_at) }));
        const members = (await c.query(`SELECT user_id, role FROM team_members WHERE team_id = $1`, [inc.team_id])).rows as Array<{ user_id: string; role: string }>;
        for (const step of sch.steps as Step[]) {
          if (new Date(inc.opened_at).getTime() + step.afterMin * 60_000 > now.getTime()) break; // later steps are not due either
          const users = step.target === "oncall" ? [onCallAt(schedule, overrides, now)?.userId]
            : step.target === "next" ? [nextInRotation(schedule, now)]
            : step.target === "leads" ? members.filter((m) => m.role === "lead").map((m) => m.user_id)
            : members.map((m) => m.user_id);
          for (const u of users) {
            if (!u) continue;
            await c.query(`INSERT INTO oncall_pages (tenant_id, incident_id, team_id, user_id, reason) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (incident_id, user_id) DO NOTHING`,
              [inc.tenant_id, inc.id, inc.team_id, u, step.target]);
          }
        }
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  /** One statement in its own short transaction, across tenants (the on-call tables are tenant-isolated). */
  private async q(text: string, params: unknown[]) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('fudo.all_tenants', 'on', true)");
      const r = await c.query(text, params);
      await c.query("COMMIT");
      return r;
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  }

  /** Step 3: each person's own notification steps (email to the sign-in address if they set none). */
  private async send(now: Date) {
    const c = await this.pool.connect();
    let work: Array<Record<string, unknown>>;
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('fudo.all_tenants', 'on', true)");
      work = (await c.query(`
        SELECT p.id, p.tenant_id, p.started_at, p.next_step, p.incident_id, u.email, u.locale, u.notification_steps,
               i.number, i.title, i.title_parts, i.severity, i.entity_name, i.opened_at
          FROM oncall_pages p JOIN incidents i ON i.id = p.incident_id JOIN users u ON u.id = p.user_id
         WHERE p.done_at IS NULL AND u.is_active AND i.status = 'open' AND (i.snoozed_until IS NULL OR i.snoozed_until <= now())`)).rows;
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
    if (!work.length) return;

    const smtp = await loadSmtp(this.pool, this.appSecret);
    const tg = (await this.pool.query(`SELECT value FROM settings WHERE key = 'telegram'`)).rows[0]?.value as { botTokenEnc?: string } | undefined;
    const deps: PersonalDeps = {
      sendEmail: smtpSender(smtp),
      telegramToken: tg?.botTokenEnc ? decrypt(tg.botTokenEnc, deriveKey(this.appSecret, "telegram-bot")) : null,
      telegramApi: process.env.TELEGRAM_API_URL || undefined,
    };
    const contactKey = deriveKey(this.appSecret, "contact-target");

    for (const p of work) {
      const own = (p.notification_steps as Array<{ contactId: string; delayMin: number }>) ?? [];
      const steps = own.length ? own : [{ contactId: "", delayMin: 0 }]; // nobody paged is left unreachable
      let k = p.next_step as number;
      const started = new Date(p.started_at as string).getTime();
      while (k < steps.length && started + steps[k]!.delayMin * 60_000 <= now.getTime()) {
        // claim the step first: with several workers, each step goes out once
        const claimed = (await this.q(`UPDATE oncall_pages SET next_step = $2 WHERE id = $1 AND next_step = $3 AND done_at IS NULL`, [p.id, k + 1, k])).rowCount;
        if (!claimed) break;
        const step = steps[k]!;
        let type: PersonalType = "email", target = p.email as string;
        if (step.contactId) {
          const ct = (await this.pool.query(`SELECT type, target_enc FROM user_contact_methods WHERE id = $1 AND verified_at IS NOT NULL`, [step.contactId])).rows[0];
          if (!ct) { k++; continue; } // removed or no longer verified
          type = ct.type; target = decrypt(ct.target_enc, contactKey);
        }
        const L = await messageLang(this.pool, (p.locale as string) ?? null);
        const since = new Intl.DateTimeFormat(L.code, { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: "UTC" }).format(new Date(p.opened_at as string)) + " UTC";
        const base = this.publicUrl?.replace(/\/$/, "");
        // a one-time acknowledge link per message (only its hash is stored)
        let actions: Array<{ title: string; url: string }> | undefined;
        if (base) {
          const token = randomBytes(32).toString("base64url");
          await this.q(`INSERT INTO oncall_ack_tokens (token_hash, page_id, tenant_id, expires_at) VALUES ($1, $2, $3, now() + interval '24 hours')`, [sha256(token), p.id, p.tenant_id]);
          actions = [{ title: L.t("notify.oncall.ack_action"), url: `${base}/ack/${token}` }, { title: L.t("notify.oncall.open_action"), url: `${base}/incidents/${p.incident_id}` }];
        }
        const msg = {
          title: L.t("notify.oncall.title", { key: incNo(p.number as number), title: L.render(p.title_parts as never, p.title as string) }),
          text: `${L.t("notify.oncall.text", { severity: L.t(`severity.${p.severity}`), item: p.entity_name, since })}\n\n${L.t("notify.oncall.ack_hint")}`,
          actions,
        };
        let ok = true, error: string | null = null;
        try { await sendPersonal(type, target, msg, deps); }
        catch (e) { ok = false; error = (e as Error).message.slice(0, 300); this.log.warn({ err: e, page: p.id }, "on-call message failed"); }
        await this.q(`INSERT INTO oncall_sends (tenant_id, page_id, channel, ok, error) VALUES ($1, $2, $3, $4, $5)`, [p.tenant_id, p.id, type, ok, error]);
        k++;
      }
    }
  }
}
