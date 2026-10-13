import type { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { apiTokenSchema, randomToken, sha256, type ApiTokenDto } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { forbidden, HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { tenantScope } from "../lib/tenant-scope.js";
import { iso, rows } from "./common.js";
import { withTenant } from "@fudo/db";

/** API tokens (F-603). Managed only from a signed-in session: a token cannot create tokens. */
export const tokenRoutes =
  ({ db }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const sessionOnly = (req: { apiToken: unknown }) => { if (req.apiToken) throw forbidden("API tokens cannot manage API tokens"); };

    app.get("/api-tokens", async (req): Promise<ApiTokenDto[]> => {
      sessionOnly(req);
      const scope = await tenantScope(req, db, "manage");
      const r = await withTenant(db, scope.scopeId, (tx) => rows(tx, sql`
        SELECT t.*, u.display_name FROM api_tokens t LEFT JOIN users u ON u.id = t.created_by
         WHERE t.tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid ORDER BY t.revoked_at NULLS FIRST, t.created_at DESC`));
      return r.map((t) => ({
        id: t.id as string, name: t.name as string, prefix: t.prefix as string, permission: t.permission as "read", scope: t.tenant_id ? "tenant" : "global",
        createdAt: iso(t.created_at)!, createdBy: (t.display_name as string) ?? null, expiresAt: iso(t.expires_at), lastUsedAt: iso(t.last_used_at), revokedAt: iso(t.revoked_at),
      }));
    });

    app.post("/api-tokens", async (req, reply) => {
      sessionOnly(req);
      const scope = await tenantScope(req, db, "manage");
      const i = parse(apiTokenSchema, req.body);
      const token = `fudo_${randomToken(30)}`;
      const expires = i.expiresInDays ? new Date(Date.now() + i.expiresInDays * 86_400_000).toISOString() : null;
      const id = await withTenant(db, scope.scopeId, async (tx) => (await rows(tx, sql`
        INSERT INTO api_tokens (tenant_id, name, prefix, token_hash, permission, expires_at, created_by)
        VALUES (${scope.tenantId}::uuid, ${i.name}, ${token.slice(0, 12)}, ${sha256(token)}, ${i.permission}, ${expires}::timestamptz, ${scope.userId}) RETURNING id`))[0]!.id as string);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "api_token.created", entityType: "api_token", entityId: id, diff: { name: i.name, permission: i.permission, expiresAt: expires } });
      reply.code(201);
      return { id, token, expiresAt: expires };
    });

    app.delete<{ Params: { id: string } }>("/api-tokens/:id", async (req) => {
      sessionOnly(req);
      const scope = await tenantScope(req, db, "manage");
      const r = await withTenant(db, scope.scopeId, (tx) => rows(tx, sql`UPDATE api_tokens SET revoked_at = now()
        WHERE id = ${req.params.id} AND tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid AND revoked_at IS NULL RETURNING name`));
      if (!r.length) throw new HttpError(404, "not_found", "Token not found or already revoked");
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "api_token.revoked", entityType: "api_token", entityId: req.params.id, diff: { name: r[0]!.name } });
      return { ok: true };
    });
  };
