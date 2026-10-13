import type pg from "pg";
import type { Snapshot } from "@fudo/engine";

/** Loads the whole dependency graph across tenants for the engine (worker, what-if). */
export async function loadSnapshot(pool: pg.Pool): Promise<Snapshot> {
  const c = await pool.connect();
  try {
    // one consistent snapshot; queries run one after another (one connection runs one query at a time)
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await c.query("SELECT set_config('fudo.all_tenants', 'on', true)");
    const monitors = await c.query("SELECT id, tenant_id, name, status, paused, asset_id FROM monitors");
    const assets = await c.query("SELECT id, tenant_id, name FROM assets");
    const edges = await c.query("SELECT from_type, from_id, to_asset_id FROM dependencies");
    const apps = await c.query("SELECT id, tenant_id, name, aggregation, min_up FROM applications");
    const members = await c.query("SELECT application_id, monitor_id, required FROM application_members");
    const maint = await c.query(`SELECT t.entity_type, t.entity_id FROM maintenance_targets t
                 JOIN maintenance_windows w ON w.id = t.window_id WHERE now() >= w.starts_at AND now() < w.ends_at`);
    await c.query("COMMIT");
    const byApp = new Map<string, Array<{ monitorId: string; required: boolean }>>();
    for (const m of members.rows) byApp.set(m.application_id, [...(byApp.get(m.application_id) ?? []), { monitorId: m.monitor_id, required: m.required }]);
    const mset = (t: string) => new Set<string>(maint.rows.filter((r) => r.entity_type === t).map((r) => r.entity_id));
    return {
      monitors: monitors.rows.map((m) => ({ id: m.id, tenantId: m.tenant_id, name: m.name, status: m.status, paused: m.paused, assetId: m.asset_id })),
      assets: assets.rows.map((a) => ({ id: a.id, tenantId: a.tenant_id, name: a.name })),
      edges: edges.rows.map((e) => ({ fromType: e.from_type, fromId: e.from_id, toAssetId: e.to_asset_id })),
      applications: apps.rows.map((a) => ({ id: a.id, tenantId: a.tenant_id, name: a.name, aggregation: a.aggregation, minUp: a.min_up, members: byApp.get(a.id) ?? [] })),
      maintenance: { monitors: mset("monitor"), assets: mset("asset"), applications: mset("application") },
    };
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}
