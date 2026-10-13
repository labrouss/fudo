import type { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@fudo/db";
import type { TopologyDto, TopologyNode } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { tenantScope } from "../lib/tenant-scope.js";
import { rows } from "./common.js";

/**
 * Topology map (F-505): assets and applications with their dependencies. Applications are linked to
 * infrastructure directly and through their member monitors (the monitor name is the "via" label).
 * Global readers in the Global scope also see every tenant's applications.
 */
export const topologyRoutes =
  ({ db }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get("/topology", async (req): Promise<TopologyDto> => {
      const scope = await tenantScope(req, db);
      const load = async (tx: Tx, withApps: boolean) => {
        const assets = await rows(tx, sql`SELECT a.id, a.name, a.status, a.cause, a.kind, a.tenant_id, t.name AS tenant_name FROM assets a LEFT JOIN tenants t ON t.id = a.tenant_id`);
        const apps = withApps ? await rows(tx, sql`SELECT a.id, a.name, a.status, a.cause, a.tenant_id, t.name AS tenant_name FROM applications a JOIN tenants t ON t.id = a.tenant_id`) : [];
        const deps = await rows(tx, sql`SELECT from_type, from_id, to_asset_id FROM dependencies`);
        const members = withApps ? await rows(tx, sql`SELECT am.application_id, m.id AS monitor_id, m.name, m.asset_id FROM application_members am JOIN monitors m ON m.id = am.monitor_id`) : [];
        return { assets, apps, deps, members };
      };
      const data = scope.isGlobal && scope.globalRead
        ? await withTenant(db, "all", (tx) => load(tx, true))
        : await withTenant(db, scope.scopeId, (tx) => load(tx, !scope.isGlobal));
      // in the global scope only shared assets are drawn (tenant-private assets belong to their tenant's map)
      const node = (type: "asset" | "application", r: Record<string, unknown>): TopologyNode => ({
        key: `${type}:${r.id as string}`, type, id: r.id as string, name: r.name as string, status: r.status as TopologyNode["status"],
        cause: (r.cause as TopologyNode["cause"]) ?? null, kind: (r.kind as string) ?? null, scope: r.tenant_id ? "tenant" : "global", tenantName: (r.tenant_name as string) ?? null,
      });
      const nodes = new Map<string, TopologyNode>();
      for (const a of data.assets) if (!scope.isGlobal || a.tenant_id === null) nodes.set(`asset:${a.id as string}`, node("asset", a));
      for (const a of data.apps) nodes.set(`application:${a.id as string}`, node("application", a));
      const edges = new Map<string, { from: string; to: string; via: string | null }>();
      const add = (from: string, to: string, via: string | null) => {
        if (from === to || !nodes.has(from) || !nodes.has(to)) return;
        const k = `${from}>${to}`;
        if (!edges.has(k)) edges.set(k, { from, to, via });
      };
      for (const d of data.deps) {
        if (d.from_type === "asset") add(`asset:${d.from_id as string}`, `asset:${d.to_asset_id as string}`, null);
        if (d.from_type === "application") add(`application:${d.from_id as string}`, `asset:${d.to_asset_id as string}`, null);
      }
      for (const m of data.members) {
        const from = `application:${m.application_id as string}`;
        if (m.asset_id) add(from, `asset:${m.asset_id as string}`, m.name as string);
        for (const d of data.deps) if (d.from_type === "monitor" && d.from_id === m.monitor_id) add(from, `asset:${d.to_asset_id as string}`, m.name as string);
      }
      return { nodes: [...nodes.values()], edges: [...edges.values()] };
    });
  };
