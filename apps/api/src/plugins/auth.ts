import fp from "fastify-plugin";
import type pg from "pg";
import { sha256 } from "@fudo/shared";
import type { FastifyRequest } from "fastify";
import type { SessionRow, SessionStore, UserRow } from "../lib/sessions.js";
import { forbidden, unauthorized } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: { session: SessionRow; user: UserRow } | null;
    /** set when the request authenticated with an API token (Authorization: Bearer fudo_…) */
    apiToken: { id: string; name: string; tenantId: string | null; permission: "read" | "operate" | "manage" } | null;
  }
}

/** Loads the session (if any) on every API request. Route guards below enforce access. */
export const authPlugin = fp<{ sessions: SessionStore; pool: pg.Pool }>(async (app, { sessions, pool }) => {
  app.decorateRequest("auth", null);
  app.decorateRequest("apiToken", null);
  app.addHook("onRequest", async (req) => {
    if (!req.url.startsWith("/api/")) return;
    const h = req.headers.authorization;
    if (h?.startsWith("Bearer ")) {
      req.apiToken = await loadToken(pool, h.slice(7).trim());
      if (!req.apiToken) throw unauthorized("The API token is invalid, expired or revoked");
      return; // tokens never carry a user session
    }
    req.auth = await sessions.load(req);
  });
});

const lastTouch = new Map<string, number>();
async function loadToken(pool: pg.Pool, token: string) {
  if (!/^fudo_[A-Za-z0-9_-]{30,80}$/.test(token)) return null;
  const r = await pool.query(
    "SELECT id, name, tenant_id, permission FROM api_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())",
    [sha256(token)]);
  const t = r.rows[0];
  if (!t) return null;
  if (Date.now() - (lastTouch.get(t.id) ?? 0) > 300_000) {
    lastTouch.set(t.id, Date.now());
    await pool.query("UPDATE api_tokens SET last_used_at = now() WHERE id = $1", [t.id]);
  }
  return { id: t.id as string, name: t.name as string, tenantId: (t.tenant_id as string) ?? null, permission: t.permission as "read" };
}

/** Signed in with password AND second factor. */
export function requireUser(req: FastifyRequest): UserRow {
  if (!req.auth || !req.auth.session.mfaPassed) throw unauthorized();
  return req.auth.user;
}

export function requireSuperadmin(req: FastifyRequest): UserRow {
  const user = requireUser(req);
  if (!user.isSuperadmin) throw forbidden();
  return user;
}

/** Password verified, second factor still pending. */
export function requirePendingMfa(req: FastifyRequest): UserRow {
  if (!req.auth) throw unauthorized();
  return req.auth.user;
}
