import type { FastifyPluginAsync } from "fastify";
import { partsOf } from "../lib/parts.js";
import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@fudo/db";
import { applicationSchema, membersSchema, type ApplicationDetail, type ApplicationDto, type GraphNode } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { notifyGraph, tenantScope, type TenantScope } from "../lib/tenant-scope.js";
import { iso, notFound, rows, uniqueViolation, type Row } from "./common.js";

const APP_SQL = (where: ReturnType<typeof sql>) => sql`
  SELECT ap.*, (SELECT count(*)::int FROM application_members am WHERE am.application_id = ap.id) AS member_count
    FROM applications ap WHERE ${where} ORDER BY ap.name`;

function toDto(r: Row): ApplicationDto {
  return {
    id: r.id as string, name: r.name as string, description: r.description as string, owner: r.owner as string,
    criticality: r.criticality as ApplicationDto["criticality"], aggregation: r.aggregation as ApplicationDto["aggregation"],
    minUp: r.min_up as number, slaTarget: Number(r.sla_target), status: r.status as ApplicationDto["status"],
    statusChangedAt: iso(r.status_changed_at), cause: (r.cause as ApplicationDto["cause"]) ?? null, atRisk: (r.at_risk as ApplicationDto["atRisk"]) ?? null,
    summary: r.summary as string, summaryParts: partsOf(r.summary_parts), memberCount: Number(r.member_count ?? 0),
  };
}

function tenantOnly(scope: TenantScope) {
  if (scope.isGlobal) throw new HttpError(400, "tenant_required", "Applications belong to tenants. Choose a tenant in the sidebar.");
}

/** Upstream closure of an application, layered by distance, for the dependency view. */
async function buildGraph(tx: Tx, app: Row): Promise<ApplicationDetail["graph"]> {
  const nodes = new Map<string, GraphNode>();
  const links: Array<{ from: string; to: string }> = [];
  const monitors = new Map((await rows(tx, sql`SELECT id, name, type, effective_status, cause, asset_id, tenant_id FROM monitors`)).map((m) => [m.id as string, m]));
  const assets = new Map((await rows(tx, sql`SELECT id, name, kind, status, cause, summary, tenant_id FROM assets`)).map((a) => [a.id as string, a]));
  const edges = await rows(tx, sql`SELECT from_type, from_id, to_asset_id FROM dependencies`);
  const members = await rows(tx, sql`SELECT monitor_id, required FROM application_members WHERE application_id = ${app.id as string}`);

  const add = (k: string, n: Omit<GraphNode, "key" | "depth">, depth: number) => {
    const cur = nodes.get(k);
    if (!cur || depth < cur.depth) nodes.set(k, { key: k, depth, ...n });
  };
  const addAsset = (id: string, depth: number) => {
    const a = assets.get(id);
    if (!a) return false;
    add(`asset:${id}`, { type: "asset", id, name: a.name as string, status: a.status as GraphNode["status"], cause: (a.cause as GraphNode["cause"]) ?? null, scope: a.tenant_id ? "tenant" : "global", detail: (a.summary as string) || (a.kind as string) }, depth);
    return true;
  };
  add(`application:${app.id as string}`, { type: "application", id: app.id as string, name: app.name as string, status: app.status as GraphNode["status"], cause: (app.cause as GraphNode["cause"]) ?? null, scope: "tenant", detail: app.summary as string }, 0);

  const queue: Array<{ k: string; depth: number }> = [];
  for (const mm of members) {
    const m = monitors.get(mm.monitor_id as string);
    if (!m) continue;
    const k = `monitor:${m.id as string}`;
    add(k, { type: "monitor", id: m.id as string, name: m.name as string, status: m.effective_status as GraphNode["status"], cause: (m.cause as GraphNode["cause"]) ?? null, scope: m.tenant_id ? "tenant" : "global", detail: `${m.type as string}${mm.required ? "" : " · optional"}` }, 1);
    links.push({ from: `application:${app.id as string}`, to: k });
    queue.push({ k, depth: 1 });
  }
  for (const e of edges.filter((e) => e.from_type === "application" && e.from_id === app.id)) {
    if (addAsset(e.to_asset_id as string, 1)) { links.push({ from: `application:${app.id as string}`, to: `asset:${e.to_asset_id as string}` }); queue.push({ k: `asset:${e.to_asset_id as string}`, depth: 1 }); }
  }
  const seen = new Set<string>();
  while (queue.length) {
    const { k, depth } = queue.shift()!;
    if (seen.has(k)) continue;
    seen.add(k);
    const [type, id] = k.split(":") as [string, string];
    const targets: string[] = [];
    if (type === "monitor") {
      const m = monitors.get(id);
      if (m?.asset_id) targets.push(m.asset_id as string);
    }
    for (const e of edges) if (e.from_type === type && e.from_id === id) targets.push(e.to_asset_id as string);
    for (const t of [...new Set(targets)]) {
      if (depth >= 6 || !addAsset(t, depth + 1)) continue;
      links.push({ from: k, to: `asset:${t}` });
      queue.push({ k: `asset:${t}`, depth: depth + 1 });
    }
  }
  return { nodes: [...nodes.values()], links };
}

export const applicationRoutes =
  ({ db, pool }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    async function one(tx: Tx, id: string): Promise<Row> {
      const r = (await rows(tx, APP_SQL(sql`ap.id = ${id}`)))[0];
      if (!r) throw notFound("Application");
      return r;
    }

    app.get("/applications", async (req) => {
      const scope = await tenantScope(req, db);
      if (scope.isGlobal) return [];
      return withTenant(db, scope.scopeId, async (tx) => (await rows(tx, APP_SQL(sql`true`))).map(toDto));
    });

    app.get<{ Params: { id: string } }>("/applications/:id", async (req): Promise<ApplicationDetail> => {
      const scope = await tenantScope(req, db);
      tenantOnly(scope);
      return withTenant(db, scope.scopeId, async (tx) => {
        const r = await one(tx, req.params.id);
        const members = await rows(tx, sql`
          SELECT am.monitor_id, am.required, m.name, m.type, m.status, m.effective_status, m.cause, m.tenant_id
            FROM application_members am JOIN monitors m ON m.id = am.monitor_id
           WHERE am.application_id = ${req.params.id} ORDER BY am.required DESC, m.name`);
        const deps = await rows(tx, sql`
          SELECT d.id AS edge_id, a.id, a.name, a.status FROM dependencies d JOIN assets a ON a.id = d.to_asset_id
           WHERE d.from_type = 'application' AND d.from_id = ${req.params.id} ORDER BY a.name`);
        const events = await rows(tx, sql`
          SELECT ts, from_status, to_status, message, message_parts, cause FROM state_changes
           WHERE entity_type = 'application' AND entity_id = ${req.params.id} ORDER BY ts DESC LIMIT 30`);
        return {
          ...toDto(r),
          members: members.map((m) => ({ monitorId: m.monitor_id as string, name: m.name as string, type: m.type as string, required: m.required as boolean, status: m.status as "UP", effectiveStatus: m.effective_status as "UP", cause: (m.cause as ApplicationDetail["cause"]) ?? null, scope: m.tenant_id ? "tenant" : "global" })),
          dependsOn: deps.map((d) => ({ edgeId: d.edge_id as string, id: d.id as string, name: d.name as string, status: d.status as "UP" })),
          graph: await buildGraph(tx, r),
          events: events.map((e) => ({ ts: iso(e.ts)!, from: e.from_status as string, to: e.to_status as string, message: (e.message as string) ?? null, messageParts: partsOf(e.message_parts), cause: (e.cause as ApplicationDetail["cause"]) ?? null })),
        };
      });
    });

    app.post("/applications", async (req, reply) => {
      const scope = await tenantScope(req, db, "manage");
      tenantOnly(scope);
      const input = parse(applicationSchema, req.body);
      try {
        const id = await withTenant(db, scope.scopeId, async (tx) => (await rows(tx, sql`
          INSERT INTO applications (tenant_id, name, description, owner, criticality, aggregation, min_up, sla_target, created_by)
          VALUES (${scope.tenantId}::uuid, ${input.name}, ${input.description}, ${input.owner}, ${input.criticality}, ${input.aggregation}, ${input.minUp}, ${input.slaTarget}, ${scope.userId})
          RETURNING id`))[0]!.id as string);
        await notifyGraph(pool);
        await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "application.created", entityType: "application", entityId: id, diff: { name: input.name } });
        reply.code(201);
        return { id };
      } catch (err) {
        if (uniqueViolation(err)) throw new HttpError(409, "conflict", "Check the highlighted fields", { name: "An application with this name already exists" });
        throw err;
      }
    });

    app.put<{ Params: { id: string } }>("/applications/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      tenantOnly(scope);
      const input = parse(applicationSchema, req.body);
      try {
        await withTenant(db, scope.scopeId, async (tx) => {
          await one(tx, req.params.id);
          await tx.execute(sql`UPDATE applications SET name = ${input.name}, description = ${input.description}, owner = ${input.owner}, criticality = ${input.criticality},
                                  aggregation = ${input.aggregation}, min_up = ${input.minUp}, sla_target = ${input.slaTarget}, updated_at = now() WHERE id = ${req.params.id}`);
        });
      } catch (err) {
        if (uniqueViolation(err)) throw new HttpError(409, "conflict", "Check the highlighted fields", { name: "An application with this name already exists" });
        throw err;
      }
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "application.updated", entityType: "application", entityId: req.params.id, diff: { ...input } });
      return { ok: true };
    });

    /** Replaces the member list. Members can be the tenant's monitors or shared (global) monitors. */
    app.put<{ Params: { id: string } }>("/applications/:id/members", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      tenantOnly(scope);
      const { members } = parse(membersSchema, req.body);
      const names = await withTenant(db, scope.scopeId, async (tx) => {
        const r = await one(tx, req.params.id);
        const ids = [...new Set(members.map((m) => m.monitorId))];
        if (ids.length) {
          const ok = await rows(tx, sql`SELECT id FROM monitors WHERE id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
          if (ok.length !== ids.length) throw new HttpError(400, "validation_failed", "One of the chosen monitors is not available in this tenant");
        }
        await tx.execute(sql`DELETE FROM application_members WHERE application_id = ${req.params.id}`);
        for (const m of members) {
          await tx.execute(sql`INSERT INTO application_members (application_id, monitor_id, tenant_id, required) VALUES (${req.params.id}, ${m.monitorId}, ${scope.tenantId}::uuid, ${m.required})
                                ON CONFLICT (application_id, monitor_id) DO UPDATE SET required = EXCLUDED.required`);
        }
        return r.name as string;
      });
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "application.members_updated", entityType: "application", entityId: req.params.id, diff: { name: names, members: members.length } });
      return { ok: true };
    });

    app.delete<{ Params: { id: string } }>("/applications/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      tenantOnly(scope);
      const name = await withTenant(db, scope.scopeId, async (tx) => {
        const r = await one(tx, req.params.id);
        await tx.execute(sql`DELETE FROM dependencies WHERE from_type = 'application' AND from_id = ${req.params.id}`);
        await tx.execute(sql`DELETE FROM maintenance_targets WHERE entity_type = 'application' AND entity_id = ${req.params.id}`);
        await tx.execute(sql`DELETE FROM applications WHERE id = ${req.params.id}`);
        return r.name as string;
      });
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "application.deleted", entityType: "application", entityId: req.params.id, diff: { name } });
      return { ok: true };
    });
  };
