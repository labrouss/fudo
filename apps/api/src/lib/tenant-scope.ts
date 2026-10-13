import type { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { schema, type Db } from "@fudo/db";
import { GLOBAL_SCOPE, tenantPermissions, type TenantPermissions } from "@fudo/shared";
import { forbidden, HttpError } from "./errors.js";
import { requireUser } from "../plugins/auth.js";
import { loadMemberships } from "./authz.js";

export const TENANT_HEADER = "x-fudo-tenant";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TenantScope {
  /** value for withTenant(): a tenant id or "global" */
  scopeId: string;
  /** owner written to new rows: tenant id, or null for global */
  tenantId: string | null;
  isGlobal: boolean;
  /** null for API-token requests */
  userId: string | null;
  /** name of the API token, when the request used one */
  tokenName: string | null;
  isSuperadmin: boolean;
  /** true when the user may read the global scope too (for cross-tenant impact views) */
  globalRead: boolean;
  perms: TenantPermissions;
}

/** Resolves the scope selected in the UI (X-Fudo-Tenant: tenant id or "global") and the user's permissions in it. */
export async function tenantScope(req: FastifyRequest, db: Db, need: keyof TenantPermissions = "read"): Promise<TenantScope> {
  if (req.apiToken) return tokenScope(req, need);
  const user = requireUser(req);
  const raw = String(req.headers[TENANT_HEADER] ?? "");
  const isGlobal = raw === GLOBAL_SCOPE;
  if (!isGlobal && !UUID.test(raw)) throw new HttpError(400, "tenant_required", "Select a tenant first");
  if (!isGlobal) {
    const [tenant] = await db.select({ id: schema.tenants.id, isActive: schema.tenants.isActive }).from(schema.tenants).where(eq(schema.tenants.id, raw));
    if (!tenant || (!tenant.isActive && !user.isSuperadmin)) throw new HttpError(404, "tenant_not_found", "This tenant does not exist or is inactive");
  }
  const memberships = await loadMemberships(db, user.id);
  const perms = tenantPermissions({ isSuperadmin: user.isSuperadmin, memberships }, raw);
  if (!perms[need]) throw forbidden(need === "read" ? "You have no access to this scope" : "Your role here does not allow this");
  const globalRead = tenantPermissions({ isSuperadmin: user.isSuperadmin, memberships }, GLOBAL_SCOPE).read;
  return { scopeId: raw, tenantId: isGlobal ? null : raw, isGlobal, userId: user.id, tokenName: null, isSuperadmin: user.isSuperadmin, globalRead, perms };
}

/** Tells the worker's evaluator that the dependency graph or its inputs changed. */
export async function notifyGraph(pool: pg.Pool): Promise<void> {
  await pool.query("NOTIFY fudo_graph").catch(() => {});
}

/** API tokens act in exactly one scope, with the permission they were created with. */
function tokenScope(req: FastifyRequest, need: keyof TenantPermissions): TenantScope {
  const t = req.apiToken!;
  const own = t.tenantId ?? GLOBAL_SCOPE;
  const asked = String(req.headers[TENANT_HEADER] ?? "") || own;
  if (asked !== own) throw forbidden("This API token belongs to another scope");
  const perms = { read: true, operate: t.permission !== "read", manage: t.permission === "manage" };
  if (!perms[need]) throw forbidden(`This API token has "${t.permission}" permission; "${need}" is required`);
  return { scopeId: own, tenantId: t.tenantId, isGlobal: t.tenantId === null, userId: null, tokenName: t.name, isSuperadmin: false, globalRead: t.tenantId === null, perms };
}
