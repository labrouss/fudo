import type { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@fudo/db";
import { availability } from "@fudo/engine";
import type { AvailabilityDto, ChartRange, DashboardDto, DashboardItem, SeriesDto } from "@fudo/shared";
import { z } from "zod";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { tenantScope } from "../lib/tenant-scope.js";
import { iso, notFound, rows, type Row } from "./common.js";

const DAY = 86_400_000;
/** bucket size in minutes, so the interface can write it in the viewer's language */
const RES_MIN: Record<ChartRange, number> = { "1h": 1, "6h": 5, "24h": 5, "7d": 60, "30d": 240, "90d": 1440 };
const RANGES: Record<ChartRange, { ms: number; bucket: string; label: string; rollup: "raw" | "hourly" | "daily" }> = {
  "1h": { ms: 3600_000, bucket: "1 minute", label: "1 min", rollup: "raw" },
  "6h": { ms: 6 * 3600_000, bucket: "5 minutes", label: "5 min", rollup: "raw" },
  "24h": { ms: DAY, bucket: "5 minutes", label: "5 min", rollup: "raw" },
  "7d": { ms: 7 * DAY, bucket: "1 hour", label: "1 hour", rollup: "hourly" },
  "30d": { ms: 30 * DAY, bucket: "4 hours", label: "4 hours", rollup: "hourly" },
  "90d": { ms: 90 * DAY, bucket: "1 day", label: "1 day", rollup: "daily" },
};

let rollupsAvailable: boolean | null = null;
async function hasRollups(tx: Tx): Promise<boolean> {
  if (rollupsAvailable === null) {
    const r = await rows(tx, sql`SELECT to_regclass('check_results_hourly') IS NOT NULL AS h, to_regclass('check_results_daily') IS NOT NULL AS d`);
    rollupsAvailable = Boolean(r[0]?.h && r[0]?.d);
  }
  return rollupsAvailable;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100);

/** Availability of applications, assets or monitors from their status history, with daily buckets. */
export async function loadAvailability(tx: Tx, type: "application" | "asset" | "monitor", entities: Array<{ id: string; status: string; createdAt: Date }>, days: number): Promise<Map<string, AvailabilityDto & { target: null }>> {
  const out = new Map<string, AvailabilityDto & { target: null }>();
  if (!entities.length) return out;
  const to = Date.now();
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const from = dayStart.getTime() - (days - 1) * DAY;
  const ids = sql.join(entities.map((e) => sql`${e.id}::uuid`), sql`, `);
  const changes = await rows(tx, sql`
    SELECT entity_id, ts, to_status, coalesce((cause->>'planned')::boolean, false) AS planned FROM state_changes
     WHERE entity_type = ${type} AND entity_id IN (${ids}) AND ts >= ${new Date(from).toISOString()}::timestamptz ORDER BY ts`);
  const before = await rows(tx, sql`
    SELECT DISTINCT ON (entity_id) entity_id, to_status, coalesce((cause->>'planned')::boolean, false) AS planned FROM state_changes
     WHERE entity_type = ${type} AND entity_id IN (${ids}) AND ts < ${new Date(from).toISOString()}::timestamptz ORDER BY entity_id, ts DESC`);
  const prev = new Map(before.map((b) => [b.entity_id as string, { status: b.to_status as string, planned: b.planned as boolean }]));
  for (const e of entities) {
    const own = changes.filter((c) => c.entity_id === e.id).map((c) => ({ ts: new Date(c.ts as string).getTime(), to: c.to_status as string, planned: c.planned as boolean }));
    // before the first recorded change: the previous state, or UNKNOWN if the entity is newer than the range
    const initial = prev.get(e.id) ?? (e.createdAt.getTime() > from || own.length ? { status: "UNKNOWN" } : { status: e.status });
    const r = availability(initial, own, from, to, DAY);
    out.set(e.id, {
      days, pct: r.totals.pct === null ? null : Math.round(r.totals.pct * 1000) / 1000,
      downMin: Math.round(r.totals.down / 60000), plannedMin: Math.round(r.totals.planned / 60000), target: null,
      buckets: r.buckets.map((b) => ({ date: new Date(b.start).toISOString().slice(0, 10), pct: b.pct === null ? null : Math.round(b.pct * 100) / 100, downMin: Math.round(b.down / 60000), plannedMin: Math.round(b.planned / 60000) })),
    });
  }
  return out;
}

const seriesQuery = z.object({ range: z.enum(["1h", "6h", "24h", "7d", "30d", "90d"]).default("24h") });
const daysQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export const metricsRoutes =
  ({ db }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    /** Response-time and availability series at a resolution that fits the range (F-502). */
    app.get<{ Params: { id: string } }>("/monitors/:id/series", async (req): Promise<SeriesDto> => {
      const scope = await tenantScope(req, db);
      const { range } = parse(seriesQuery, req.query);
      const R = RANGES[range as ChartRange];
      return withTenant(db, scope.scopeId, async (tx) => {
        if (!(await rows(tx, sql`SELECT 1 FROM monitors WHERE id = ${req.params.id}`)).length) throw notFound("Monitor");
        const from = new Date(Date.now() - R.ms).toISOString();
        const id = req.params.id;
        const rollups = await hasRollups(tx);
        let source: SeriesDto["source"] = "raw";
        let pts: Row[];
        if (R.rollup !== "raw" && rollups) {
          source = R.rollup;
          const view = sql.raw(R.rollup === "daily" ? "check_results_daily" : "check_results_hourly");
          pts = await rows(tx, sql`
            SELECT time_bucket(${R.bucket}::interval, bucket) AS t, sum(sum_ms) / nullif(sum(n_ms), 0) AS avg, max(p95_ms) AS p95, max(max_ms) AS max,
                   sum(total)::int AS total, sum(down)::int AS down, sum(maint)::int AS maint
              FROM ${view} WHERE monitor_id = ${id} AND bucket >= ${from}::timestamptz GROUP BY 1 ORDER BY 1`);
        } else {
          pts = await rows(tx, sql`
            SELECT date_bin(${R.bucket}::interval, ts, TIMESTAMPTZ '2000-01-01') AS t, avg(latency_ms) AS avg,
                   percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95, max(latency_ms) AS max,
                   count(*)::int AS total, count(*) FILTER (WHERE status = 'DOWN' AND NOT in_maintenance)::int AS down,
                   count(*) FILTER (WHERE in_maintenance)::int AS maint
              FROM check_results WHERE monitor_id = ${id} AND ts >= ${from}::timestamptz GROUP BY 1 ORDER BY 1`);
        }
        const counted = pts.reduce((n, p) => n + Number(p.total) - Number(p.maint), 0);
        const down = pts.reduce((n, p) => n + Number(p.down), 0);
        return {
          range: range as ChartRange, resolution: R.label, resolutionMin: RES_MIN[range as ChartRange], source, from, to: new Date().toISOString(),
          uptime: counted > 0 ? Math.round(((counted - down) / counted) * 100000) / 1000 : null,
          points: pts.map((p) => ({ t: iso(p.t)!, avg: num(p.avg), p95: num(p.p95), max: num(p.max), total: Number(p.total), down: Number(p.down), maint: Number(p.maint) })),
        };
      });
    });

    /** A value recorded with each check (e.g. temperatureC), averaged and maximum per time slot, from raw results. */
    app.get<{ Params: { id: string }; Querystring: { key?: string; range?: string } }>("/monitors/:id/metric", async (req) => {
      const scope = await tenantScope(req, db);
      const { range } = parse(seriesQuery, req.query);
      const key = String(req.query.key ?? "");
      if (!/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(key)) throw new HttpError(400, "validation_failed", "Unknown value");
      const R = RANGES[range as ChartRange];
      return withTenant(db, scope.scopeId, async (tx) => {
        if (!(await rows(tx, sql`SELECT 1 FROM monitors WHERE id = ${req.params.id}`)).length) throw notFound("Monitor");
        const from = new Date(Date.now() - R.ms).toISOString();
        const pts = await rows(tx, sql`
          SELECT date_bin(${R.bucket}::interval, ts, TIMESTAMPTZ '2000-01-01') AS t, avg((data->>${key})::float8) AS avg, max((data->>${key})::float8) AS max, min((data->>${key})::float8) AS min
            FROM check_results WHERE monitor_id = ${req.params.id} AND ts >= ${from}::timestamptz AND data ? ${key} GROUP BY 1 ORDER BY 1`);
        return { range, key, resolutionMin: RES_MIN[range as ChartRange], from, to: new Date().toISOString(),
          points: pts.map((p) => ({ t: iso(p.t)!, avg: num(p.avg), max: num(p.max), min: num(p.min) })) };
      });
    });

    for (const type of ["application", "asset"] as const) {
      const table = type === "application" ? "applications" : "assets";
      app.get<{ Params: { id: string } }>(`/${table}/:id/availability`, async (req): Promise<AvailabilityDto> => {
        const scope = await tenantScope(req, db);
        const { days } = parse(daysQuery, req.query);
        return withTenant(db, scope.scopeId, async (tx) => {
          const e = (await rows(tx, sql`SELECT id, status, created_at${sql.raw(type === "application" ? ", sla_target" : "")} FROM ${sql.raw(table)} WHERE id = ${req.params.id}`))[0];
          if (!e) throw notFound(type === "application" ? "Application" : "Asset");
          const a = (await loadAvailability(tx, type, [{ id: e.id as string, status: e.status as string, createdAt: new Date(e.created_at as string) }], days)).get(e.id as string)!;
          return { ...a, target: e.sla_target === undefined ? null : Number(e.sla_target) };
        });
      });
    }

    /** Dashboard: applications (tenant) or shared assets (global) with 30-day availability, incident stats, monitor counts. */
    app.get("/dashboard", async (req): Promise<DashboardDto> => {
      const scope = await tenantScope(req, db);
      return withTenant(db, scope.scopeId, async (tx) => {
        const own = sql`tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid`;
        const ents = scope.isGlobal
          ? await rows(tx, sql`SELECT id, name, status, cause, at_risk, kind, NULL AS criticality, NULL AS sla_target, created_at FROM assets WHERE ${own} ORDER BY name`)
          : await rows(tx, sql`SELECT id, name, status, cause, at_risk, NULL AS kind, criticality, sla_target, created_at FROM applications WHERE ${own} ORDER BY name`);
        const type = scope.isGlobal ? "asset" : "application";
        const av = await loadAvailability(tx, type, ents.map((e) => ({ id: e.id as string, status: e.status as string, createdAt: new Date(e.created_at as string) })), 30);
        const items: DashboardItem[] = ents.map((e) => ({
          type, id: e.id as string, name: e.name as string, status: e.status as DashboardItem["status"], cause: (e.cause as DashboardItem["cause"]) ?? null,
          atRisk: (e.at_risk as DashboardItem["atRisk"]) ?? null, criticality: (e.criticality as string) ?? null, slaTarget: e.sla_target === null ? null : Number(e.sla_target),
          availability: { ...av.get(e.id as string)!, target: e.sla_target === null ? null : Number(e.sla_target) },
        }));
        const inc = (await rows(tx, sql`
          SELECT count(*) FILTER (WHERE status = 'open')::int AS open, count(*) FILTER (WHERE status = 'acknowledged')::int AS ack,
                 count(*) FILTER (WHERE status = 'resolved' AND resolved_at > now() - interval '30 days')::int AS resolved30,
                 avg(extract(epoch FROM resolved_at - opened_at)) FILTER (WHERE status = 'resolved' AND resolved_at > now() - interval '30 days') AS mttr
            FROM incidents WHERE ${own}`))[0]!;
        const mons = await rows(tx, sql`SELECT CASE WHEN paused THEN 'PAUSED' ELSE effective_status END AS s, count(*)::int AS n FROM monitors WHERE ${own} GROUP BY 1`);
        return {
          items,
          incidents: { open: Number(inc.open), acknowledged: Number(inc.ack), resolved30: Number(inc.resolved30), mttrMin: inc.mttr === null ? null : Math.round(Number(inc.mttr) / 60) },
          monitors: Object.fromEntries(mons.map((m) => [m.s as string, Number(m.n)])),
        };
      });
    });
  };
