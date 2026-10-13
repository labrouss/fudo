import type { FastifyPluginAsync } from "fastify";
import { partsOf } from "../lib/parts.js";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { loadSnapshot, withTenant, type Tx } from "@fudo/db";
import { whatIf } from "@fudo/engine";
import { assetSchema, type AssetDetail, type AssetDto, type ImpactDto } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { notifyGraph, tenantScope } from "../lib/tenant-scope.js";
import { assertOwned, iso, notFound, rows, textArray, uniqueViolation, type Row } from "./common.js";

const linkSchema = z.object({ monitorIds: z.array(z.string().uuid()).min(1, "Choose at least one monitor").max(500) });

const ASSET_SQL = (where: ReturnType<typeof sql>) => sql`
  SELECT a.*,
         (SELECT count(*)::int FROM monitors m WHERE m.asset_id = a.id) AS monitor_count,
         (SELECT count(*)::int FROM dependencies d WHERE d.to_asset_id = a.id) AS dependent_count,
         (SELECT coalesce(json_agg(json_build_object('edgeId', d.id, 'id', t.id, 'name', t.name, 'status', t.status) ORDER BY t.name), '[]')
            FROM dependencies d JOIN assets t ON t.id = d.to_asset_id
           WHERE d.from_type = 'asset' AND d.from_id = a.id) AS depends_on
    FROM assets a WHERE ${where} ORDER BY a.tenant_id NULLS FIRST, a.name`;

function toDto(r: Row): AssetDto {
  return {
    id: r.id as string, scope: r.tenant_id ? "tenant" : "global", name: r.name as string, kind: r.kind as string,
    description: r.description as string, location: r.location as string, address: r.address as string, tags: (r.tags as string[]) ?? [],
    status: r.status as AssetDto["status"], statusChangedAt: iso(r.status_changed_at), cause: (r.cause as AssetDto["cause"]) ?? null,
    atRisk: (r.at_risk as AssetDto["atRisk"]) ?? null, summary: r.summary as string, summaryParts: partsOf(r.summary_parts),
    monitorCount: Number(r.monitor_count ?? 0), dependentCount: Number(r.dependent_count ?? 0),
    dependsOn: (r.depends_on as AssetDto["dependsOn"]) ?? [],
  };
}

export const assetRoutes =
  ({ db, pool }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    async function one(tx: Tx, id: string): Promise<Row> {
      const r = (await rows(tx, ASSET_SQL(sql`a.id = ${id}`)))[0];
      if (!r) throw notFound("Asset");
      return r;
    }

    /** Tenant scope: own + global assets. Global scope: global assets. */
    /** Global readers (infra admins, global viewers) see dependents in every tenant. */
    const allTenantsDependents = async (ids: string[]) => {
      if (!ids.length) return new Map<string, number>();
      const r = await withTenant(db, "all", (tx) => rows(tx, sql`SELECT to_asset_id, count(*)::int AS n FROM dependencies WHERE to_asset_id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) GROUP BY 1`));
      return new Map(r.map((x) => [x.to_asset_id as string, Number(x.n)]));
    };

    app.get("/assets", async (req) => {
      const scope = await tenantScope(req, db);
      const list = await withTenant(db, scope.scopeId, async (tx) => (await rows(tx, ASSET_SQL(sql`true`))).map(toDto));
      if (scope.isGlobal && scope.globalRead) {
        const counts = await allTenantsDependents(list.map((a) => a.id));
        for (const a of list) a.dependentCount = counts.get(a.id) ?? 0;
      }
      return list;
    });

    app.get<{ Params: { id: string } }>("/assets/:id", async (req): Promise<AssetDetail> => {
      const scope = await tenantScope(req, db);
      return withTenant(db, scope.scopeId, async (tx) => {
        const r = await one(tx, req.params.id);
        const monitors = await rows(tx, sql`SELECT id, name, type, status, effective_status, tenant_id FROM monitors WHERE asset_id = ${req.params.id} ORDER BY name`);
        const usedBy = await (scope.isGlobal && scope.globalRead ? (q: ReturnType<typeof sql>) => withTenant(db, "all", (t) => rows(t, q)) : (q: ReturnType<typeof sql>) => rows(tx, q))(sql`
          SELECT d.from_type AS type, d.from_id AS id, coalesce(a.name, m.name, ap.name) AS name,
                 coalesce(a.status, m.effective_status, ap.status) AS status, t.name AS tenant_name
            FROM dependencies d
            LEFT JOIN assets a ON d.from_type = 'asset' AND a.id = d.from_id
            LEFT JOIN monitors m ON d.from_type = 'monitor' AND m.id = d.from_id
            LEFT JOIN applications ap ON d.from_type = 'application' AND ap.id = d.from_id
            LEFT JOIN tenants t ON t.id = coalesce(a.tenant_id, m.tenant_id, ap.tenant_id)
           WHERE d.to_asset_id = ${req.params.id} AND coalesce(a.id, m.id, ap.id) IS NOT NULL
           ORDER BY 1, 3`);
        const events = await rows(tx, sql`SELECT ts, from_status, to_status, message, message_parts FROM state_changes WHERE entity_type = 'asset' AND entity_id = ${req.params.id} ORDER BY ts DESC LIMIT 25`);
        return {
          ...toDto(r),
          monitors: monitors.map((m) => ({ id: m.id as string, name: m.name as string, type: m.type as string, status: m.status as "UP", effectiveStatus: m.effective_status as "UP", scope: m.tenant_id ? "tenant" : "global" })),
          usedBy: usedBy.map((u) => ({ type: u.type as "asset", id: u.id as string, name: u.name as string, status: u.status as "UP", tenantName: (u.tenant_name as string) ?? null })),
          events: events.map((e) => ({ ts: iso(e.ts)!, from: e.from_status as string, to: e.to_status as string, message: (e.message as string) ?? null , messageParts: partsOf(e.message_parts)})),
        };
      });
    });

    /** What-if: what happens to applications if this asset fails. */
    app.get<{ Params: { id: string } }>("/assets/:id/impact", async (req): Promise<ImpactDto> => {
      const scope = await tenantScope(req, db);
      await withTenant(db, scope.scopeId, (tx) => one(tx, req.params.id)); // visibility check
      const snap = await loadSnapshot(pool);
      const w = whatIf(snap, req.params.id);
      const tenantNames = new Map((await pool.query("SELECT id, name FROM tenants")).rows.map((t) => [t.id as string, t.name as string]));
      const appById = new Map(snap.applications.map((a) => [a.id, a]));
      const visible = (tenantId: string) => scope.globalRead || tenantId === scope.tenantId;
      const apps = w.applications.filter((a) => visible(appById.get(a.id)!.tenantId));
      const assetName = new Map(snap.assets.map((a) => [a.id, a]));
      return {
        assets: w.radius.assets.map((id) => assetName.get(id)!).filter((a) => a.tenantId === null || visible(a.tenantId)).map((a) => ({ id: a.id, name: a.name })),
        monitorCount: w.radius.monitors.filter((id) => { const m = snap.monitors.find((x) => x.id === id); return m && (m.tenantId === null || visible(m.tenantId)); }).length,
        applications: apps
          .map((a) => ({ id: a.id, name: appById.get(a.id)!.name, tenantName: tenantNames.get(appById.get(a.id)!.tenantId) ?? null, before: { status: a.before.status }, after: { status: a.after.status, cause: a.after.cause, summary: a.after.summary, summaryParts: a.after.summaryParts ?? null } }))
          .sort((x, y) => (x.after.status === y.after.status ? x.name.localeCompare(y.name) : x.after.status === "DOWN" || x.after.status === "IMPACTED" ? -1 : 1)),
        hiddenApplications: w.applications.length - apps.length,
      };
    });

    app.post("/assets", async (req, reply) => {
      const scope = await tenantScope(req, db, "manage");
      const input = parse(assetSchema, req.body);
      try {
        const id = await withTenant(db, scope.scopeId, async (tx) => {
          const r = await rows(tx, sql`
            INSERT INTO assets (tenant_id, name, kind, description, location, address, tags, created_by)
            VALUES (${scope.tenantId}::uuid, ${input.name}, ${input.kind}, ${input.description}, ${input.location}, ${input.address}, ${textArray(input.tags)}, ${scope.userId})
            RETURNING id`);
          return r[0]!.id as string;
        });
        await notifyGraph(pool);
        await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "asset.created", entityType: "asset", entityId: id, diff: { name: input.name, kind: input.kind } });
        reply.code(201);
        return { id };
      } catch (err) {
        if (uniqueViolation(err)) throw new HttpError(409, "conflict", "Check the highlighted fields", { name: "An asset with this name already exists here" });
        throw err;
      }
    });

    app.put<{ Params: { id: string } }>("/assets/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      const input = parse(assetSchema, req.body);
      try {
        await withTenant(db, scope.scopeId, async (tx) => {
          assertOwned(await one(tx, req.params.id), scope.tenantId, "This asset");
          await tx.execute(sql`UPDATE assets SET name = ${input.name}, kind = ${input.kind}, description = ${input.description}, location = ${input.location},
                                  address = ${input.address}, tags = ${textArray(input.tags)}, updated_at = now() WHERE id = ${req.params.id}`);
        });
      } catch (err) {
        if (uniqueViolation(err)) throw new HttpError(409, "conflict", "Check the highlighted fields", { name: "An asset with this name already exists here" });
        throw err;
      }
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "asset.updated", entityType: "asset", entityId: req.params.id, diff: { name: input.name } });
      return { ok: true };
    });

    /** Put existing monitors of this scope on the asset (a monitor on another asset moves here). Tenants may use shared assets. */
    app.post<{ Params: { id: string } }>("/assets/:id/monitors", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      const { monitorIds } = parse(linkSchema, req.body);
      const ids = [...new Set(monitorIds)];
      const moved = await withTenant(db, scope.scopeId, async (tx) => {
        await one(tx, req.params.id); // visible: this scope's asset, or a shared one
        const r = await rows(tx, sql`
          WITH old AS (SELECT m.id, m.name, a.name AS from_asset FROM monitors m LEFT JOIN assets a ON a.id = m.asset_id
                        WHERE m.id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) AND m.tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid
                          AND m.asset_id IS DISTINCT FROM ${req.params.id}::uuid)
          UPDATE monitors m SET asset_id = ${req.params.id}, updated_at = now() FROM old WHERE m.id = old.id RETURNING old.name, old.from_asset`);
        const ok = await rows(tx, sql`SELECT count(*)::int AS n FROM monitors WHERE id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) AND asset_id = ${req.params.id}::uuid AND tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid`);
        if (Number(ok[0]!.n) !== ids.length) throw new HttpError(400, "validation_failed", "Choose monitors of this scope");
        return r;
      });
      if (moved.length) {
        await notifyGraph(pool);
        await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "asset.monitors_added", entityType: "asset", entityId: req.params.id,
          diff: { monitors: moved.map((m) => (m.from_asset ? `${m.name} (from ${m.from_asset})` : (m.name as string))) } });
      }
      return { ok: true, added: moved.length };
    });

    /** Take a monitor off the asset; the monitor stays. */
    app.delete<{ Params: { id: string; monitorId: string } }>("/assets/:id/monitors/:monitorId", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      const r = await withTenant(db, scope.scopeId, (tx) => rows(tx, sql`
        UPDATE monitors SET asset_id = NULL, updated_at = now() WHERE id = ${req.params.monitorId}::uuid AND asset_id = ${req.params.id}::uuid
           AND tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid RETURNING name`));
      if (!r.length) throw notFound("Monitor");
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "asset.monitor_removed", entityType: "asset", entityId: req.params.id, diff: { monitor: r[0]!.name } });
      return { ok: true };
    });

    app.delete<{ Params: { id: string } }>("/assets/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      const name = await withTenant(db, scope.scopeId, async (tx) => {
        const r = await one(tx, req.params.id);
        assertOwned(r, scope.tenantId, "This asset");
        await tx.execute(sql`DELETE FROM dependencies WHERE from_type = 'asset' AND from_id = ${req.params.id}`);
        await tx.execute(sql`DELETE FROM maintenance_targets WHERE entity_type = 'asset' AND entity_id = ${req.params.id}`);
        await tx.execute(sql`DELETE FROM assets WHERE id = ${req.params.id}`);
        return r.name as string;
      });
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "asset.deleted", entityType: "asset", entityId: req.params.id, diff: { name } });
      return { ok: true };
    });
  };
