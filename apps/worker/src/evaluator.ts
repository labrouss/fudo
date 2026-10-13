import { englishMessage, type MsgPart } from "@fudo/shared";
import type pg from "pg";
import type { Logger } from "pino";
import { loadSnapshot } from "@fudo/db";
import { evaluate, key, type Evaluation, type Ref } from "@fudo/engine";

/**
 * Recomputes effective statuses (root cause, impact, at-risk, application aggregation) from the
 * whole graph and stores what changed. Runs when monitors change status, when the API signals a
 * graph change (NOTIFY fudo_graph) and every 15 s (maintenance windows starting/ending).
 */
export class Evaluator {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private again = false;
  private listener: pg.PoolClient | null = null;
  private interval: NodeJS.Timeout | null = null;

  /** runs after each evaluation (incident reconciliation) */
  afterRun?: () => Promise<void>;

  constructor(private pool: pg.Pool, private log: Logger) {}

  async start() {
    this.listener = await this.pool.connect();
    await this.listener.query("LISTEN fudo_graph");
    this.listener.on("notification", () => this.schedule(300));
    this.interval = setInterval(() => this.schedule(0), 15_000);
    this.schedule(0);
  }

  async stop() {
    if (this.interval) clearInterval(this.interval);
    if (this.timer) clearTimeout(this.timer);
    if (this.listener) { await this.listener.query("UNLISTEN *").catch(() => {}); this.listener.release(); }
  }

  /** Debounced trigger; bursts of changes cause a single evaluation. */
  schedule(delayMs = 500) {
    if (this.running) { this.again = true; return; }
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; void this.run(); }, delayMs);
  }

  private async run() {
    this.running = true;
    const started = Date.now();
    try {
      const snap = await loadSnapshot(this.pool);
      const results = evaluate(snap);
      const changed = await this.persist(results);
      if (changed) this.log.info({ changed, ms: Date.now() - started }, "dependency statuses updated");
      await this.afterRun?.();
    } catch (err) {
      this.log.error({ err }, "evaluation failed");
    } finally {
      this.running = false;
      if (this.again) { this.again = false; this.schedule(200); }
    }
  }

  private async persist(results: Map<string, Evaluation>): Promise<number> {
    const c = await this.pool.connect();
    let changed = 0;
    const tenants = new Set<string | null>();
    try {
      await c.query("BEGIN");
      const same = (a: unknown, b: Ref | null) => {
        const x = a as Ref | null;
        return (x?.id ?? null) === (b?.id ?? null) && Boolean(x?.planned) === Boolean(b?.planned);
      };

      for (const table of ["assets", "applications"] as const) {
        const type = table === "assets" ? "asset" : "application";
        const cur = await c.query(`SELECT id, tenant_id, name, status, cause, at_risk, summary FROM ${table}`);
        for (const row of cur.rows) {
          const ev = results.get(key(type, row.id));
          if (!ev) continue;
          const statusChanged = ev.status !== row.status;
          if (!statusChanged && same(row.cause, ev.cause) && same(row.at_risk, ev.atRisk) && ev.summary === row.summary) continue;
          changed++;
          tenants.add(row.tenant_id ?? null);
          await c.query(
            `UPDATE ${table} SET status = $2, cause = $3, at_risk = $4, summary = $5, summary_parts = $7,
                    status_changed_at = CASE WHEN $6 THEN now() ELSE status_changed_at END WHERE id = $1`,
            [row.id, ev.status, ev.cause ? JSON.stringify(ev.cause) : null, ev.atRisk ? JSON.stringify(ev.atRisk) : null, ev.summary, statusChanged, JSON.stringify(ev.summaryParts)],
          );
          if (statusChanged) {
            const parts: MsgPart[] = ev.status === "IMPACTED" && ev.cause ? [[ev.cause.planned ? "change.impactedByPlanned" : "change.impactedBy", { cause: ev.cause.name }]] : ev.status === "DOWN" && ev.cause ? [["change.causeDown", { cause: ev.cause.name }]] : ev.summaryParts;
            const msg = englishMessage(parts);
            await c.query(
              `INSERT INTO state_changes (tenant_id, entity_type, entity_id, from_status, to_status, message, cause, cause_entity_id, message_parts) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [row.tenant_id, type, row.id, row.status, ev.status, msg, ev.cause ? JSON.stringify(ev.cause) : null, ev.cause?.id ?? null, JSON.stringify(parts)],
            );
          }
        }
      }

      const mons = await c.query("SELECT id, tenant_id, effective_status, cause, at_risk FROM monitors");
      for (const row of mons.rows) {
        const ev = results.get(key("monitor", row.id));
        if (!ev || (ev.status === row.effective_status && same(row.cause, ev.cause) && same(row.at_risk, ev.atRisk))) continue;
        changed++;
        tenants.add(row.tenant_id ?? null);
        await c.query("UPDATE monitors SET effective_status = $2, cause = $3, at_risk = $4 WHERE id = $1", [
          row.id, ev.status, ev.cause ? JSON.stringify(ev.cause) : null, ev.atRisk ? JSON.stringify(ev.atRisk) : null,
        ]);
      }
      for (const t of tenants) await c.query("SELECT pg_notify('fudo_live', json_build_object('t', $1::uuid, 'k', 'status')::text)", [t]);
      await c.query("COMMIT");
      return changed;
    } catch (err) {
      await c.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      c.release();
    }
  }
}
