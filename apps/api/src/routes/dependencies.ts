import type { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { withTenant } from "@fudo/db";
import { wouldCreateCycle } from "@fudo/engine";
import { dependencySchema } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { notifyGraph, tenantScope } from "../lib/tenant-scope.js";
import { assertOwned, notFound, rows, uniqueViolation } from "./common.js";

const TABLE = { asset: "assets", monitor: "monitors", application: "applications" } as const;

/** "X depends on asset Y" edges. The edge belongs to X's scope; Y may be global. */
export const dependencyRoutes =
  ({ db, pool }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.post("/dependencies", async (req, reply) => {
      const scope = await tenantScope(req, db, "manage");
      const input = parse(dependencySchema, req.body);
      const id = await withTenant(db, scope.scopeId, async (tx) => {
        const from = (await rows(tx, sql`SELECT id, tenant_id, name FROM ${sql.raw(TABLE[input.fromType])} WHERE id = ${input.fromId}`))[0];
        if (!from) throw notFound("Item");
        assertOwned(from, scope.tenantId);
        const to = (await rows(tx, sql`SELECT id, tenant_id, name FROM assets WHERE id = ${input.toAssetId}`))[0];
        if (!to) throw new HttpError(400, "validation_failed", "Check the highlighted fields", { toAssetId: "Choose an asset from this scope or the global infrastructure" });
        if (input.fromType === "asset") {
          const edges = (await rows(tx, sql`SELECT from_type, from_id, to_asset_id FROM dependencies WHERE from_type = 'asset'`))
            .map((e) => ({ fromType: "asset" as const, fromId: e.from_id as string, toAssetId: e.to_asset_id as string }));
          if (wouldCreateCycle(edges, input.fromId, input.toAssetId)) {
            const [asset, dependency] = [to.name as string, from.name as string];
            throw new HttpError(400, "cycle", `${asset} already depends on ${dependency} (directly or through other assets). A dependency loop is not allowed.`, { toAssetId: "This would create a dependency loop" });
          }
        }
        try {
          const r = await rows(tx, sql`INSERT INTO dependencies (tenant_id, from_type, from_id, to_asset_id, created_by)
                                       VALUES (${scope.tenantId}::uuid, ${input.fromType}, ${input.fromId}, ${input.toAssetId}, ${scope.userId}) RETURNING id`);
          return { id: r[0]!.id as string, from: from.name as string, to: to.name as string };
        } catch (err) {
          if (uniqueViolation(err)) throw new HttpError(409, "conflict", "This dependency already exists", { toAssetId: "Already added" });
          throw err;
        }
      });
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "dependency.created", entityType: input.fromType, entityId: input.fromId, diff: { from: id.from, dependsOn: id.to } });
      reply.code(201);
      return { id: id.id };
    });

    app.delete<{ Params: { id: string } }>("/dependencies/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      await withTenant(db, scope.scopeId, async (tx) => {
        const e = (await rows(tx, sql`SELECT id, tenant_id FROM dependencies WHERE id = ${req.params.id}`))[0];
        if (!e) throw notFound("Dependency");
        assertOwned(e, scope.tenantId, "This dependency");
        await tx.execute(sql`DELETE FROM dependencies WHERE id = ${req.params.id}`);
      });
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "dependency.deleted", entityType: "dependency", entityId: req.params.id });
      return { ok: true };
    });
  };
