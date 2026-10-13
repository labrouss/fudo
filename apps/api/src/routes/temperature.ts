/**
 * Data center temperature: every inlet temperature sensor in scope (a tenant also sees shared
 * global ones), grouped by its room tag, with 24-hour range, 6-hour sparkline and recent rise;
 * plus the room monitors. Three queries, whatever the number of sensors.
 */
import type { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { withTenant } from "@fudo/db";
import type { AppDeps } from "../server.js";
import { tenantScope } from "../lib/tenant-scope.js";
import { iso, rows } from "./common.js";

const tag = (tags: unknown, key: string) => ((tags as string[] | null) ?? []).find((t) => t.toLowerCase().startsWith(`${key}:`))?.slice(key.length + 1) ?? null;
const n = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);

export const temperatureRoutes =
  ({ db }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get("/temperature", async (req) => {
      const scope = await tenantScope(req, db);
      return withTenant(db, scope.scopeId, async (tx) => {
        const inScope = scope.tenantId ? sql`(m.tenant_id = ${scope.tenantId}::uuid OR m.tenant_id IS NULL)` : sql`m.tenant_id IS NULL`;
        const sensors = await rows(tx, sql`
          SELECT m.id, m.name, m.tags, m.tenant_id, m.status, m.config->>'warnC' AS warn, m.config->>'criticalC' AS crit,
                 r.ts, r.data, s.min24, s.max24
            FROM monitors m
            LEFT JOIN LATERAL (SELECT ts, data FROM check_results WHERE monitor_id = m.id AND data ? 'temperatureC' ORDER BY ts DESC LIMIT 1) r ON true
            LEFT JOIN LATERAL (SELECT min((data->>'temperatureC')::float8) AS min24, max((data->>'temperatureC')::float8) AS max24
                                 FROM check_results WHERE monitor_id = m.id AND ts > now() - interval '24 hours' AND data ? 'temperatureC') s ON true
           WHERE m.type = 'redfish-temperature' AND ${inScope}
           ORDER BY m.name`);
        const ids = sensors.map((s) => s.id as string);
        const spark = ids.length ? await rows(tx, sql`
          SELECT monitor_id, date_bin('5 minutes', ts, TIMESTAMPTZ '2000-01-01') AS t, avg((data->>'temperatureC')::float8) AS v
            FROM check_results WHERE monitor_id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) AND ts > now() - interval '6 hours' AND data ? 'temperatureC'
           GROUP BY 1, 2 ORDER BY 2`) : [];
        const rooms = await rows(tx, sql`SELECT m.id, m.name, m.status, m.config->>'room' AS room, m.tenant_id,
            (SELECT message FROM check_results WHERE monitor_id = m.id ORDER BY ts DESC LIMIT 1) AS message,
            (SELECT message_parts FROM check_results WHERE monitor_id = m.id ORDER BY ts DESC LIMIT 1) AS parts
          FROM monitors m WHERE m.type = 'temperature-room' AND ${inScope}`);

        const now = Date.now(), start = now - 6 * 3600_000;
        const list = sensors.map((s) => {
          const data = (s.data as Record<string, unknown> | null) ?? {};
          const pts = spark.filter((p) => p.monitor_id === s.id);
          // 72 five-minute slots over 6 hours; empty slots stay null (gaps)
          const slots: Array<number | null> = Array.from({ length: 72 }, () => null);
          for (const p of pts) { const i = Math.floor((new Date(p.t as string).getTime() - start) / 300_000); if (i >= 0 && i < 72) slots[i] = n(p.v); }
          return {
            id: s.id as string, name: s.name as string, scope: s.tenant_id ? "tenant" : "global", room: tag(s.tags, "room"), rack: tag(s.tags, "rack"),
            status: s.status as string, celsius: n(data.temperatureC), at: iso(s.ts) ?? null, riseC: n(data.riseC), sensor: (data.sensor as string) ?? null,
            warnC: Number(s.warn ?? 27), criticalC: Number(s.crit ?? 32), min24: n(s.min24), max24: n(s.max24), spark: slots,
          };
        });
        const fresh = list.filter((s) => s.celsius !== null && s.at && now - new Date(s.at).getTime() < 15 * 60_000);
        const hottest = fresh.reduce<typeof fresh[0] | null>((a, b) => (!a || b.celsius! > a.celsius! ? b : a), null);
        return {
          sensors: list,
          rooms: rooms.map((r) => ({ id: r.id as string, name: r.name as string, room: (r.room as string) || null, status: r.status as string, message: (r.message as string) ?? null, parts: r.parts ?? null, scope: r.tenant_id ? "tenant" : "global" })),
          summary: {
            sensors: list.length, fresh: fresh.length,
            avg: fresh.length ? n(fresh.reduce((a, b) => a + b.celsius!, 0) / fresh.length) : null,
            hottest: hottest ? { id: hottest.id, name: hottest.name, celsius: hottest.celsius } : null,
            hot: fresh.filter((s) => s.celsius! >= s.warnC).length,
            rising: fresh.filter((s) => s.riseC !== null && s.riseC >= 3).length,
          },
        };
      });
    });
  };
