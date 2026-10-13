import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { sql } from "drizzle-orm";
import { materializeSeries, withTenant, type Tx } from "@fudo/db";
import { maintenanceSchema, maintenanceSeriesSchema, seriesRule, type MaintenanceDto, type MaintenanceSeriesDto, type RecurrenceRule } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { notifyGraph, tenantScope, type TenantScope } from "../lib/tenant-scope.js";
import { assertOwned, iso, notFound, rows, type Row } from "./common.js";

const TABLE = { asset: "assets", monitor: "monitors", application: "applications" } as const;

function toDto(r: Row): MaintenanceDto {
  const now = Date.now();
  const s = new Date(r.starts_at as string).getTime();
  const e = new Date(r.ends_at as string).getTime();
  return {
    id: r.id as string, scope: r.tenant_id ? "tenant" : "global", name: r.name as string, description: r.description as string,
    startsAt: iso(r.starts_at)!, endsAt: iso(r.ends_at)!, state: now < s ? "upcoming" : now < e ? "active" : "past",
    targets: (r.targets as MaintenanceDto["targets"]) ?? [],
    seriesId: (r.series_id as string | null) ?? null,
  };
}

const TARGET_NAMES = sql`coalesce((SELECT json_agg(json_build_object('type', t->>'type', 'id', t->>'id',
    'name', coalesce(a.name, m.name, ap.name, '(deleted)')) ORDER BY t->>'type')
    FROM jsonb_array_elements(s.targets) t
    LEFT JOIN assets a ON t->>'type' = 'asset' AND a.id = (t->>'id')::uuid
    LEFT JOIN monitors m ON t->>'type' = 'monitor' AND m.id = (t->>'id')::uuid
    LEFT JOIN applications ap ON t->>'type' = 'application' AND ap.id = (t->>'id')::uuid), '[]')`;

function seriesDto(r: Row): MaintenanceSeriesDto {
  return {
    id: r.id as string, scope: r.tenant_id ? "tenant" : "global", name: r.name as string, description: r.description as string,
    rule: r.rule as RecurrenceRule, targets: (r.target_names as MaintenanceSeriesDto["targets"]) ?? [],
    nextStart: iso(r.next_start) ?? null, nextEnd: iso(r.next_end) ?? null,
  };
}

const LIST_SQL = (where: ReturnType<typeof sql>) => sql`
  SELECT w.*, (
    SELECT coalesce(json_agg(json_build_object('type', t.entity_type, 'id', t.entity_id, 'name', coalesce(a.name, m.name, ap.name, '(deleted)')) ORDER BY t.entity_type), '[]')
      FROM maintenance_targets t
      LEFT JOIN assets a ON t.entity_type = 'asset' AND a.id = t.entity_id
      LEFT JOIN monitors m ON t.entity_type = 'monitor' AND m.id = t.entity_id
      LEFT JOIN applications ap ON t.entity_type = 'application' AND ap.id = t.entity_id
     WHERE t.window_id = w.id) AS targets
    FROM maintenance_windows w WHERE ${where}
   ORDER BY (w.ends_at < now()), w.starts_at DESC LIMIT 200`;

/** Maintenance windows. A scope can only put its own items into maintenance (tenants: not shared infrastructure). */
export const maintenanceRoutes =
  ({ db, pool }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    async function checkTargets(tx: Tx, scope: TenantScope, targets: Array<{ type: keyof typeof TABLE; id: string }>) {
      for (const t of targets) {
        const r = (await rows(tx, sql`SELECT tenant_id, name FROM ${sql.raw(TABLE[t.type])} WHERE id = ${t.id}`))[0];
        if (!r) throw new HttpError(400, "validation_failed", "One of the targets no longer exists");
        assertOwned(r, scope.tenantId, `"${r.name as string}"`);
      }
    }

    /** The series will not create this occurrence (again). */
    async function skipOccurrence(tx: Tx, seriesId: string, startsAt: unknown) {
      await tx.execute(sql`UPDATE maintenance_series SET skipped = array_append(skipped, ${new Date(startsAt as string).toISOString()}::timestamptz) WHERE id = ${seriesId}`);
    }

    app.get("/maintenance", async (req) => {
      const scope = await tenantScope(req, db);
      return withTenant(db, scope.scopeId, async (tx) => (await rows(tx, LIST_SQL(sql`w.tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid OR w.tenant_id IS NULL`))).map(toDto));
    });

    async function save(req: FastifyRequest, id: string | null) {
      const scope = await tenantScope(req, db, "manage");
      const input = parse(maintenanceSchema, req.body);
      const windowId = await withTenant(db, scope.scopeId, async (tx) => {
        await checkTargets(tx, scope, input.targets);
        let wid = id;
        if (wid) {
          const r = (await rows(tx, sql`SELECT tenant_id, series_id, starts_at FROM maintenance_windows WHERE id = ${wid}`))[0];
          if (!r) throw notFound("Maintenance window");
          assertOwned(r, scope.tenantId, "This maintenance window");
          // a changed occurrence of a series stands on its own; the series does not recreate the original
          if (r.series_id) await skipOccurrence(tx, r.series_id as string, r.starts_at);
          await tx.execute(sql`UPDATE maintenance_windows SET name = ${input.name}, description = ${input.description}, starts_at = ${input.startsAt.toISOString()}, ends_at = ${input.endsAt.toISOString()}, series_id = NULL WHERE id = ${wid}`);
          await tx.execute(sql`DELETE FROM maintenance_targets WHERE window_id = ${wid}`);
        } else {
          wid = (await rows(tx, sql`INSERT INTO maintenance_windows (tenant_id, name, description, starts_at, ends_at, created_by)
                                    VALUES (${scope.tenantId}::uuid, ${input.name}, ${input.description}, ${input.startsAt.toISOString()}, ${input.endsAt.toISOString()}, ${scope.userId}) RETURNING id`))[0]!.id as string;
        }
        for (const t of input.targets) {
          await tx.execute(sql`INSERT INTO maintenance_targets (window_id, tenant_id, entity_type, entity_id) VALUES (${wid}, ${scope.tenantId}::uuid, ${t.type}, ${t.id}) ON CONFLICT DO NOTHING`);
        }
        return wid;
      });
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: id ? "maintenance.updated" : "maintenance.created", entityType: "maintenance", entityId: windowId, diff: { name: input.name, startsAt: input.startsAt, endsAt: input.endsAt, targets: input.targets.length } });
      return windowId;
    }

    app.post("/maintenance", async (req, reply) => { const id = await save(req, null); reply.code(201); return { id }; });
    app.put<{ Params: { id: string } }>("/maintenance/:id", async (req) => { await save(req, req.params.id); return { ok: true }; });

    /** End an active window now (or cancel an upcoming one). */
    app.post<{ Params: { id: string } }>("/maintenance/:id/end", async (req) => {
      const scope = await tenantScope(req, db, "operate");
      await withTenant(db, scope.scopeId, async (tx) => {
        const r = (await rows(tx, sql`SELECT tenant_id, starts_at, series_id FROM maintenance_windows WHERE id = ${req.params.id}`))[0];
        if (!r) throw notFound("Maintenance window");
        assertOwned(r, scope.tenantId, "This maintenance window");
        const upcoming = new Date(r.starts_at as string) > new Date();
        if (upcoming && r.series_id) await skipOccurrence(tx, r.series_id as string, r.starts_at);
        if (upcoming) await tx.execute(sql`DELETE FROM maintenance_windows WHERE id = ${req.params.id}`);
        else await tx.execute(sql`UPDATE maintenance_windows SET ends_at = now() WHERE id = ${req.params.id} AND ends_at > now()`);
      });
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "maintenance.ended", entityType: "maintenance", entityId: req.params.id });
      return { ok: true };
    });

    app.delete<{ Params: { id: string } }>("/maintenance/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      await withTenant(db, scope.scopeId, async (tx) => {
        const r = (await rows(tx, sql`SELECT tenant_id, starts_at, series_id FROM maintenance_windows WHERE id = ${req.params.id}`))[0];
        if (!r) throw notFound("Maintenance window");
        assertOwned(r, scope.tenantId, "This maintenance window");
        if (r.series_id && new Date(r.starts_at as string) > new Date()) await skipOccurrence(tx, r.series_id as string, r.starts_at);
        await tx.execute(sql`DELETE FROM maintenance_windows WHERE id = ${req.params.id}`);
      });
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "maintenance.deleted", entityType: "maintenance", entityId: req.params.id });
      return { ok: true };
    });

    /* ---------- recurring maintenance ---------- */
    app.get("/maintenance/series", async (req) => {
      const scope = await tenantScope(req, db);
      return withTenant(db, scope.scopeId, async (tx) => (await rows(tx, sql`
        SELECT s.*, ${TARGET_NAMES} AS target_names,
               (SELECT min(w.starts_at) FROM maintenance_windows w WHERE w.series_id = s.id AND w.ends_at > now()) AS next_start,
               (SELECT w.ends_at FROM maintenance_windows w WHERE w.series_id = s.id AND w.ends_at > now() ORDER BY w.starts_at LIMIT 1) AS next_end
          FROM maintenance_series s
         WHERE s.tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid OR s.tenant_id IS NULL
         ORDER BY s.name`)).map(seriesDto));
    });

    async function saveSeries(req: FastifyRequest, id: string | null) {
      const scope = await tenantScope(req, db, "manage");
      const input = parse(maintenanceSeriesSchema, req.body);
      const rule = seriesRule(input);
      const targets = JSON.stringify(input.targets);
      const seriesId = await withTenant(db, scope.scopeId, async (tx) => {
        await checkTargets(tx, scope, input.targets);
        if (id) {
          const r = (await rows(tx, sql`SELECT tenant_id FROM maintenance_series WHERE id = ${id}`))[0];
          if (!r) throw notFound("Maintenance series");
          assertOwned(r, scope.tenantId, "This maintenance series");
          await tx.execute(sql`UPDATE maintenance_series SET name = ${input.name}, description = ${input.description}, rule = ${JSON.stringify(rule)}::jsonb, targets = ${targets}::jsonb, updated_at = now() WHERE id = ${id}`);
          // future occurrences follow the new rule; running and past ones stay as they were
          await tx.execute(sql`DELETE FROM maintenance_windows WHERE series_id = ${id} AND starts_at > now()`);
          return id;
        }
        return (await rows(tx, sql`INSERT INTO maintenance_series (tenant_id, name, description, rule, targets, created_by)
          VALUES (${scope.tenantId}::uuid, ${input.name}, ${input.description}, ${JSON.stringify(rule)}::jsonb, ${targets}::jsonb, ${scope.userId}) RETURNING id`))[0]!.id as string;
      });
      await materializeSeries(pool, { seriesId });
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: id ? "maintenance.series_updated" : "maintenance.series_created", entityType: "maintenance_series", entityId: seriesId, diff: { name: input.name, rule, targets: input.targets.length } });
      return seriesId;
    }
    app.post("/maintenance/series", async (req, reply) => { const id = await saveSeries(req, null); reply.code(201); return { id }; });
    app.put<{ Params: { id: string } }>("/maintenance/series/:id", async (req) => { await saveSeries(req, req.params.id); return { ok: true }; });

    /** Stops the series: future occurrences go, running and past windows stay. */
    app.delete<{ Params: { id: string } }>("/maintenance/series/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      await withTenant(db, scope.scopeId, async (tx) => {
        const r = (await rows(tx, sql`SELECT tenant_id FROM maintenance_series WHERE id = ${req.params.id}`))[0];
        if (!r) throw notFound("Maintenance series");
        assertOwned(r, scope.tenantId, "This maintenance series");
        await tx.execute(sql`DELETE FROM maintenance_windows WHERE series_id = ${req.params.id} AND starts_at > now()`);
        await tx.execute(sql`DELETE FROM maintenance_series WHERE id = ${req.params.id}`);
      });
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "maintenance.series_deleted", entityType: "maintenance_series", entityId: req.params.id });
      return { ok: true };
    });
  };
