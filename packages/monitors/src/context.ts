/**
 * Extra data some checks need beyond their own configuration (used by the worker's scheduler and by
 * the API's "Test"): an inlet sensor gets its recent readings (rate of rise); a room monitor gets
 * the latest readings of the inlet sensors tagged with its room.
 */
import type pg from "pg";
import type { RunContext } from "./runners/types.js";

export interface Peer { name: string; rack: string | null; status: string | null; celsius: number | null; riseC: number | null; ageS: number | null; warnC: number; criticalC: number }

async function inTx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('fudo.all_tenants', 'on', true)");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}

const tagValue = (tags: string[] | null, key: string) => (tags ?? []).find((t) => t.toLowerCase().startsWith(`${key}:`))?.slice(key.length + 1) ?? null;

export async function extraContext(pool: pg.Pool, m: { id: string | null; tenantId: string | null; type: string; config: Record<string, unknown> }): Promise<Partial<RunContext>> {
  if (m.type === "redfish-temperature" && m.id && Number(m.config.riseC) > 0) {
    const minutes = Math.max(1, Number(m.config.riseMin ?? 15));
    return inTx(pool, async (c) => ({
      recent: (await c.query(`SELECT ts, (data->>'temperatureC')::float8 AS v FROM check_results
                               WHERE monitor_id = $1 AND ts > now() - make_interval(mins => $2) AND data ? 'temperatureC' ORDER BY ts`, [m.id, minutes])).rows
        .map((r) => ({ ts: new Date(r.ts), value: Number(r.v) })),
    }));
  }
  // counters: the reading kept with the last result, for a rate since then
  if (m.id && (m.type === "snmp-interface" || (m.type === "snmp" && m.config.mode === "rate"))) {
    return inTx(pool, async (c) => ({
      previous: ((await c.query(`SELECT data FROM check_results WHERE monitor_id = $1 AND ts > now() - interval '6 hours' AND data ? 'c_at' ORDER BY ts DESC LIMIT 1`, [m.id])).rows[0]?.data as Record<string, unknown> | undefined) ?? null,
    }));
  }
  // traps: open problems (auto-cleared ones left out) and the last trap
  if (m.type === "snmp-trap" && m.id) {
    const auto = m.config.clearMode !== "manual";
    const minutes = Math.max(1, Number(m.config.clearAfterMin ?? 30));
    return inTx(pool, async (c) => {
      const problems = (await c.query(`SELECT key, label, source, detail, first_at, last_at, count FROM snmp_trap_problems
                                        WHERE monitor_id = $1 AND (NOT $2 OR last_at > now() - make_interval(mins => $3))`, [m.id, auto, minutes])).rows
        .map((r) => ({ key: r.key, label: r.label, source: r.source, detail: r.detail, firstAt: new Date(r.first_at), lastAt: new Date(r.last_at), count: Number(r.count) }));
      const l = (await c.query(`SELECT coalesce(trap_name, trap_oid) AS label, source, ts FROM snmp_traps WHERE monitor_id = $1 ORDER BY ts DESC LIMIT 1`, [m.id])).rows[0];
      return { traps: { problems, last: l ? { label: l.label, source: l.source, at: new Date(l.ts) } : null } };
    });
  }
  if (m.type === "temperature-room") {
    const room = String(m.config.room ?? "").trim().toLowerCase();
    return inTx(pool, async (c) => {
      // the room's sensors: same tenant or shared (global) infrastructure, not paused
      const rows = (await c.query(`
        SELECT m.name, m.tags, m.config->>'warnC' AS warn, m.config->>'criticalC' AS crit, r.status, r.data, extract(epoch FROM now() - r.ts) AS age
          FROM monitors m
          LEFT JOIN LATERAL (SELECT status, data, ts FROM check_results WHERE monitor_id = m.id ORDER BY ts DESC LIMIT 1) r ON true
         WHERE m.type = 'redfish-temperature' AND NOT m.paused
           AND (m.tenant_id IS NOT DISTINCT FROM $1::uuid OR m.tenant_id IS NULL)
           AND ($2 = '' OR EXISTS (SELECT 1 FROM unnest(m.tags) t WHERE lower(t) = 'room:' || $2))`, [m.tenantId, room])).rows;
      const peers: Peer[] = rows.map((r) => ({
        name: r.name, rack: tagValue(r.tags, "rack"), status: r.status ?? null,
        celsius: r.data?.temperatureC ?? null, riseC: r.data?.riseC ?? null, ageS: r.age === null ? null : Number(r.age),
        warnC: Number(r.warn ?? 27), criticalC: Number(r.crit ?? 32),
      }));
      return { peers };
    });
  }
  return {};
}
