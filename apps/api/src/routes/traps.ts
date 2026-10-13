/**
 * SNMP traps: the traps a scope received (and which monitor took them), the receiver's state, and a
 * trap monitor's open problems, which operators can clear by hand ("until the next trap").
 */
import type { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@fudo/db";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { getSetting } from "../lib/settings.js";
import { tenantScope } from "../lib/tenant-scope.js";
import { notFound, rows } from "./common.js";

const listQuery = z.object({
  monitorId: z.string().uuid().optional(),
  unclaimed: z.enum(["1", "0"]).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(300),
});
const clearBody = z.object({ key: z.string().max(400).optional() });
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export const trapRoutes =
  ({ db }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get("/traps", async (req) => {
      const scope = await tenantScope(req, db);
      const q = parse(listQuery, req.query);
      return withTenant(db, scope.scopeId, async (tx) => {
        const list = await rows(tx, sql`
          SELECT t.id, t.ts, t.source, t.version, t.trap_oid, t.trap_name, t.fields, t.action, t.monitor_id, m.name AS monitor_name, t.asset_id, a.name AS asset_name
            FROM snmp_traps t LEFT JOIN monitors m ON m.id = t.monitor_id LEFT JOIN assets a ON a.id = t.asset_id
           WHERE t.tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid
             ${q.monitorId ? sql`AND t.monitor_id = ${q.monitorId}::uuid` : sql``}
             ${q.unclaimed === "1" ? sql`AND t.monitor_id IS NULL` : sql``}
           ORDER BY t.ts DESC LIMIT ${q.limit}`);
        return list.map((t) => ({
          id: t.id as string, ts: iso(t.ts)!, source: t.source as string, version: t.version as string, oid: t.trap_oid as string, name: (t.trap_name as string) ?? null,
          fields: t.fields as Array<{ oid: string; name: string | null; value: string }>, action: (t.action as string) ?? null,
          monitorId: (t.monitor_id as string) ?? null, monitorName: (t.monitor_name as string) ?? null, assetId: (t.asset_id as string) ?? null, assetName: (t.asset_name as string) ?? null,
        }));
      });
    });

    /** The receiver (written by the worker every 30 s) and this scope's trap counts. */
    app.get("/traps/status", async (req) => {
      const scope = await tenantScope(req, db);
      const r = await getSetting<Record<string, unknown>>(db, "traps.receiver");
      const counts = await withTenant(db, scope.scopeId, async (tx) => (await rows(tx, sql`
        SELECT count(*) FILTER (WHERE ts > now() - interval '1 hour') AS hour, count(*) FILTER (WHERE ts > now() - interval '24 hours') AS day,
               count(*) FILTER (WHERE ts > now() - interval '24 hours' AND monitor_id IS NULL) AS unclaimed
          FROM snmp_traps WHERE tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid AND ts > now() - interval '24 hours'`))[0]!);
      const fresh = !!r?.updatedAt && Date.now() - new Date(String(r.updatedAt)).getTime() < 120_000;
      return {
        running: fresh, listening: fresh && r?.listening === true, error: (r?.error as string) ?? null,
        port: Number(r?.publishedPort ?? r?.port ?? 162),
        // receiver-wide numbers only for the Global scope (they include every tenant)
        ...(scope.isGlobal ? { received: Number(r?.received ?? 0), dropped: Number(r?.dropped ?? 0), droppedBySource: r?.droppedBySource ?? {}, since: r?.startedAt ?? null } : {}),
        lastHour: Number(counts.hour), lastDay: Number(counts.day), unclaimedDay: Number(counts.unclaimed),
      };
    });

    app.get<{ Params: { id: string } }>("/monitors/:id/trap-problems", async (req) => {
      const scope = await tenantScope(req, db);
      return withTenant(db, scope.scopeId, async (tx) => {
        const m = (await rows(tx, sql`SELECT id, type, config FROM monitors WHERE id = ${req.params.id}::uuid`))[0];
        if (!m) throw notFound("Monitor");
        const cfg = m.config as Record<string, unknown>;
        const auto = cfg.clearMode !== "manual", minutes = Math.max(1, Number(cfg.clearAfterMin ?? 30));
        const list = await rows(tx, sql`SELECT key, label, source, detail, first_at, last_at, count,
            CASE WHEN ${auto} THEN last_at + make_interval(mins => ${minutes}) END AS clears_at
          FROM snmp_trap_problems WHERE monitor_id = ${req.params.id}::uuid AND (NOT ${auto} OR last_at > now() - make_interval(mins => ${minutes})) ORDER BY last_at DESC`);
        return list.map((p) => ({ key: p.key as string, label: p.label as string, source: p.source as string, detail: p.detail as string, firstAt: iso(p.first_at)!, lastAt: iso(p.last_at)!, count: Number(p.count), clearsAt: iso(p.clears_at) }));
      });
    });

    /** Clears one open problem (key) or all; the next matching trap opens it again. */
    app.post<{ Params: { id: string } }>("/monitors/:id/traps/clear", async (req) => {
      const scope = await tenantScope(req, db, "operate");
      const { key } = parse(clearBody, req.body ?? {});
      const out = await withTenant(db, scope.scopeId, async (tx) => {
        const m = (await rows(tx, sql`SELECT id, name, type, tenant_id FROM monitors WHERE id = ${req.params.id}::uuid`))[0];
        if (!m || (m.tenant_id ?? null) !== scope.tenantId) throw notFound("Monitor");
        if (m.type !== "snmp-trap") throw new HttpError(400, "not_trap_monitor", "Only SNMP trap monitors have traps to clear");
        const gone = await rows(tx, sql`DELETE FROM snmp_trap_problems WHERE monitor_id = ${req.params.id}::uuid ${key ? sql`AND key = ${key}` : sql``} RETURNING key`);
        await tx.execute(sql`UPDATE monitors SET next_run_at = now() WHERE id = ${req.params.id}::uuid`);
        return { name: m.name as string, cleared: gone.map((g) => g.key as string) };
      });
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "monitor.traps_cleared", entityType: "monitor", entityId: req.params.id, diff: { name: out.name, cleared: out.cleared } });
      return { cleared: out.cleared.length };
    });
  };
