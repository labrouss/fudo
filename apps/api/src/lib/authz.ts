import { and, asc, eq } from "drizzle-orm";
import { schema, type Db } from "@fudo/db";
import type { Membership, Role, TenantSummary } from "@fudo/shared";
import type { UserRow } from "./sessions.js";

export async function loadMemberships(db: Db, userId: string): Promise<Membership[]> {
  const rows = await db
    .select({ tenantId: schema.userTenantRoles.tenantId, tenantName: schema.tenants.name, role: schema.userTenantRoles.role })
    .from(schema.userTenantRoles)
    .leftJoin(schema.tenants, eq(schema.tenants.id, schema.userTenantRoles.tenantId))
    .where(eq(schema.userTenantRoles.userId, userId));
  return rows.map((r) => ({ tenantId: r.tenantId, tenantName: r.tenantName ?? null, role: r.role as Role }));
}

/**
 * Tenants the user may switch to. Superadmins and global-scope users (infra-admin, global viewer)
 * see every active tenant; everyone else sees the tenants they hold a role in.
 */
export async function accessibleTenants(db: Db, user: UserRow, memberships: Membership[]): Promise<TenantSummary[]> {
  const all = await db
    .select({ id: schema.tenants.id, name: schema.tenants.name, slug: schema.tenants.slug })
    .from(schema.tenants)
    .where(eq(schema.tenants.isActive, true))
    .orderBy(asc(schema.tenants.name));
  if (user.isSuperadmin || memberships.some((m) => m.tenantId === null)) return all;
  const ids = new Set(memberships.map((m) => m.tenantId));
  return all.filter((t) => ids.has(t.id));
}

export async function hasTenantRole(db: Db, userId: string, tenantId: string, roles: Role[]): Promise<boolean> {
  const rows = await db
    .select({ role: schema.userTenantRoles.role })
    .from(schema.userTenantRoles)
    .where(and(eq(schema.userTenantRoles.userId, userId), eq(schema.userTenantRoles.tenantId, tenantId)));
  return rows.some((r) => roles.includes(r.role as Role));
}

export function userStatus(u: { isActive: boolean; passwordHash: string | null; totpEnabled: boolean }) {
  if (!u.isActive) return "deactivated" as const;
  if (!u.passwordHash) return "invited" as const;
  if (!u.totpEnabled) return "reset_pending" as const;
  return "active" as const;
}
