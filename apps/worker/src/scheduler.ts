import type pg from "pg";
import type { Logger } from "pino";
import { runCheck } from "@fudo/monitors/runner";
import { applyCredential, openCredentialSecrets } from "@fudo/monitors/credentials";
import { englishMessage } from "@fudo/shared";
import { extraContext } from "@fudo/monitors/context";
import { openConfig } from "@fudo/monitors/secrets";
import { recordResult } from "@fudo/monitors/record";

interface DueMonitor {
  id: string; tenant_id: string | null; credential_id: string | null;
  name: string;
  type: string;
  config: Record<string, unknown>;
  interval_s: number;
  timeout_s: number;
  last_push_at: Date | null;
  in_maintenance: boolean;
}

export interface SchedulerOptions {
  /** decrypts secret fields of monitor configs */
  appSecret: string;
  /** checks running at the same time */
  concurrency: number;
  /** how often to look for due monitors */
  tickMs: number;
}

/**
 * Claims due monitors with FOR UPDATE SKIP LOCKED (safe with several workers), moves their
 * next_run_at forward by one interval *before* running, then runs checks with bounded concurrency.
 * recordResult() pulls next_run_at in to the retry interval while a monitor is failing.
 */
export class Scheduler {
  private running = 0;
  private stopped = false;
  private timer: NodeJS.Timeout | null = null;
  private inFlight = new Set<string>();

  /** called when a monitor's status changed (triggers dependency re-evaluation) */
  onChange?: () => void;

  constructor(private pool: pg.Pool, private log: Logger, private opts: SchedulerOptions) {}

  start() {
    this.log.info({ concurrency: this.opts.concurrency }, "scheduler started");
    void this.tick();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    const deadline = Date.now() + 15_000;
    while (this.running > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  }

  private async tick() {
    if (this.stopped) return;
    try {
      const free = this.opts.concurrency - this.running;
      if (free > 0) {
        const due = await this.claim(free);
        for (const m of due) void this.execute(m);
      }
    } catch (err) {
      this.log.error({ err }, "scheduler tick failed");
    }
    this.timer = setTimeout(() => void this.tick(), this.opts.tickMs);
  }

  private async claim(limit: number): Promise<DueMonitor[]> {
    const r = await this.pool.query<DueMonitor>(
      `UPDATE monitors m SET next_run_at = now() + make_interval(secs => m.interval_s)
         FROM (SELECT id FROM monitors WHERE NOT paused AND next_run_at <= now()
                ORDER BY next_run_at LIMIT $1 FOR UPDATE SKIP LOCKED) due
        WHERE m.id = due.id
    RETURNING m.id, m.tenant_id, m.name, m.type, m.config, m.credential_id, m.interval_s, m.timeout_s, m.last_push_at,
              EXISTS (SELECT 1 FROM maintenance_targets t JOIN maintenance_windows w ON w.id = t.window_id
                       WHERE now() >= w.starts_at AND now() < w.ends_at
                         AND ((t.entity_type = 'monitor' AND t.entity_id = m.id) OR (t.entity_type = 'asset' AND t.entity_id = m.asset_id))) AS in_maintenance`,
      [limit],
    );
    return r.rows.filter((m) => !this.inFlight.has(m.id));
  }

  /** The monitor's config filled from its shared credential; null if the credential cannot be read. */
  private async withCredential(m: DueMonitor, cfg: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN READ ONLY");
      await c.query("SELECT set_config('fudo.all_tenants', 'on', true)");
      const row = (await c.query("SELECT kind, fields, secrets_enc, tenant_id FROM credentials WHERE id = $1", [m.credential_id])).rows[0];
      await c.query("COMMIT");
      // same scope only (enforced when saving; checked again here)
      if (!row || (row.tenant_id ?? null) !== (m.tenant_id ?? null)) return null;
      return applyCredential(m.type, cfg, { kind: row.kind, fields: row.fields ?? {}, secrets: openCredentialSecrets(row.secrets_enc, this.opts.appSecret) });
    } catch (err) {
      await c.query("ROLLBACK").catch(() => {});
      this.log.error({ err, monitor: m.id }, "cannot read the monitor's shared credential (was APP_SECRET changed?)");
      return null;
    } finally { c.release(); }
  }

  private async execute(m: DueMonitor) {
    this.running++;
    this.inFlight.add(m.id);
    try {
      let cfg: Record<string, unknown>;
      try { cfg = openConfig(m.type, m.config, this.opts.appSecret); }
      catch { cfg = m.config; this.log.error({ monitor: m.id }, "cannot decrypt monitor secrets (was APP_SECRET changed?)"); }
      // a shared credential is read now, so a changed password applies at the next check
      if (m.credential_id) {
        const filled = await this.withCredential(m, cfg);
        if (!filled) {
          const out = await recordResult(this.pool, m.id, { status: "DOWN", latencyMs: null, message: englishMessage([["cred.unreadable"]]), parts: [["cred.unreadable"]] }, { inMaintenance: m.in_maintenance });
          if (out?.changed) this.onChange?.();
          return;
        }
        cfg = filled;
      }
      // some checks need recent data: an inlet sensor its last readings, a room its sensors
      const extra = await extraContext(this.pool, { id: m.id, tenantId: m.tenant_id ?? null, type: m.type, config: cfg }).catch((err) => { this.log.warn({ err, monitor: m.id }, "check context"); return {}; });
      const result = await runCheck(m.type, cfg, { timeoutMs: m.timeout_s * 1000, intervalS: m.interval_s, lastPushAt: m.last_push_at, ...extra });
      if (!result) return;
      const out = await recordResult(this.pool, m.id, result, { inMaintenance: m.in_maintenance });
      if (out?.changed) this.onChange?.();
      if (out?.changed) this.log.info({ monitor: m.name, from: out.from, to: out.status, message: result.message }, "monitor status changed");
      else this.log.debug({ monitor: m.name, status: result.status, latencyMs: result.latencyMs }, "check");
    } catch (err) {
      this.log.error({ err, monitor: m.name }, "check failed to record");
    } finally {
      this.running--;
      this.inFlight.delete(m.id);
    }
  }
}
