/**
 * Creates the windows of recurring maintenance for the coming weeks (idempotent: one window per
 * series and start time). Used by the API right after a series is saved, and by the worker.
 */
import type pg from "pg";
import { occurrences, type RecurrenceRule } from "@fudo/shared";

export const SERIES_HORIZON_DAYS = 60;
const TABLE: Record<string, string> = { asset: "assets", monitor: "monitors", application: "applications" };

export async function materializeSeries(pool: pg.Pool, opts: { seriesId?: string; now?: Date } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const horizon = new Date(now.getTime() + SERIES_HORIZON_DAYS * 86_400_000);
  const c = await pool.connect();
  let created = 0;
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('fudo.all_tenants', 'on', true)");
    const series = (await c.query(`SELECT * FROM maintenance_series ${opts.seriesId ? "WHERE id = $1" : ""}`, opts.seriesId ? [opts.seriesId] : [])).rows;
    for (const s of series) {
      const skipped = new Set((s.skipped as Date[]).map((d) => new Date(d).getTime()));
      for (const o of occurrences(s.rule as RecurrenceRule, now, horizon)) {
        if (skipped.has(o.start.getTime())) continue;
        const w = (await c.query(
          `INSERT INTO maintenance_windows (tenant_id, name, description, starts_at, ends_at, created_by, series_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (series_id, starts_at) WHERE series_id IS NOT NULL DO NOTHING RETURNING id`,
          [s.tenant_id, s.name, s.description, o.start, o.end, s.created_by, s.id])).rows[0];
        if (!w) continue;
        created++;
        for (const t of s.targets as Array<{ type: string; id: string }>) {
          const table = TABLE[t.type];
          if (!table) continue;
          // targets deleted since the series was saved are left out
          await c.query(`INSERT INTO maintenance_targets (window_id, tenant_id, entity_type, entity_id)
                         SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM ${table} WHERE id = $4) ON CONFLICT DO NOTHING`, [w.id, s.tenant_id, t.type, t.id]);
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
  if (created) await pool.query("NOTIFY fudo_graph").catch(() => {});
  return created;
}
