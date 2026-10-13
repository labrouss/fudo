import type { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { withTenant } from "@fudo/db";
import type { ImportResult } from "@fudo/shared";
import { z } from "zod";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { notifyGraph, tenantScope } from "../lib/tenant-scope.js";
import { exportConfig, importConfig, parseYaml } from "../lib/config.js";
import { rows } from "./common.js";

const importBody = z.object({
  yaml: z.string().max(5_000_000).optional(),
  /** already-parsed document (bulk add from the UI) */
  doc: z.object({ assets: z.array(z.unknown()).optional(), monitors: z.array(z.unknown()).optional(), applications: z.array(z.unknown()).optional() }).optional(),
  dryRun: z.boolean().default(true),
}).refine((b) => Boolean(b.yaml) !== Boolean(b.doc), "Send either yaml or doc");

/** Configuration export/import (F-602). Manage permission: configs may contain credentials (e.g. HTTP headers). */
export const configRoutes =
  ({ db, pool, env }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get("/config/export", async (req, reply) => {
      const scope = await tenantScope(req, db, "manage");
      const { yaml, name } = await withTenant(db, scope.scopeId, async (tx) => {
        const scopeName = scope.isGlobal ? "Global infrastructure" : ((await rows(tx, sql`SELECT name FROM tenants WHERE id = ${scope.tenantId}`))[0]?.name as string);
        return { yaml: await exportConfig(tx, scope, scopeName), name: scopeName };
      });
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "config.exported", diff: scope.tokenName ? { apiToken: scope.tokenName } : undefined });
      const file = `fudo-${name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "config"}-${new Date().toISOString().slice(0, 10)}.yaml`;
      return reply.header("content-type", "application/yaml; charset=utf-8").header("content-disposition", `attachment; filename="${file}"`).send(yaml);
    });

    app.post("/config/import", { bodyLimit: 6_000_000, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req): Promise<ImportResult> => {
      const scope = await tenantScope(req, db, "manage");
      const b = parse(importBody, req.body);
      let doc, lineOf: (p: Array<string | number>) => number | null = () => null;
      if (b.yaml !== undefined) {
        const p = parseYaml(b.yaml);
        if (p.error) return { dryRun: b.dryRun, applied: false, actions: [], errors: [p.error], summary: { create: 0, update: 0, unchanged: 0 } };
        doc = p.doc!; lineOf = p.lineOf;
      } else doc = { assets: b.doc!.assets ?? [], monitors: b.doc!.monitors ?? [], applications: b.doc!.applications ?? [] };
      if (doc.assets.length + doc.monitors.length + doc.applications.length > 5000) throw new HttpError(400, "too_large", "At most 5000 items per import");
      const r = await withTenant(db, scope.scopeId, (tx) => importConfig(tx, scope, doc, lineOf, !b.dryRun, env.APP_SECRET));
      const applied = !b.dryRun && r.errors.length === 0;
      if (applied) {
        await notifyGraph(pool);
        // open pages in this scope refresh (monitor lists, assets, applications)
        for (const k of ["monitor", "status"]) await pool.query("SELECT pg_notify('fudo_live', json_build_object('t', $1::uuid, 'k', $2::text)::text)", [scope.tenantId, k]);
        await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "config.imported", diff: { ...r.summary, ...(scope.tokenName ? { apiToken: scope.tokenName } : {}) } });
      }
      return { dryRun: b.dryRun, applied, ...r };
    });
  };
