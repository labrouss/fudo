import type { FastifyPluginAsync } from "fastify";
import { and, desc, eq, inArray, like, lt, type SQL } from "drizzle-orm";
import { schema } from "@fudo/db";
import { auditQuerySchema, type AuditPage } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { forbidden, parse } from "../lib/errors.js";
import { requireUser } from "../plugins/auth.js";
import { hasTenantRole } from "../lib/authz.js";

/** Superadmins see everything; tenant admins see entries of a tenant they administer (tenantId required). */
export const auditRoutes =
  ({ db }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get("/audit", async (req): Promise<AuditPage> => {
      const user = requireUser(req);
      const q = parse(auditQuerySchema, req.query);
      if (!user.isSuperadmin) {
        if (!q.tenantId || !(await hasTenantRole(db, user.id, q.tenantId, ["tenant-admin"]))) throw forbidden();
      }
      const where: SQL[] = [];
      if (q.before) where.push(lt(schema.auditLog.id, q.before));
      if (q.action) where.push(like(schema.auditLog.action, `${q.action.replace(/[%_]/g, "")}%`));
      if (q.userId) where.push(eq(schema.auditLog.userId, q.userId));
      if (q.tenantId) where.push(eq(schema.auditLog.tenantId, q.tenantId));
      const rows = await db
        .select({ a: schema.auditLog, userEmail: schema.users.email, tenantName: schema.tenants.name })
        .from(schema.auditLog)
        .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
        .leftJoin(schema.tenants, eq(schema.tenants.id, schema.auditLog.tenantId))
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(schema.auditLog.id))
        .limit(q.limit + 1);
      const more = rows.length > q.limit;
      const page = rows.slice(0, q.limit);
      // actors that were deleted since: name them from the deletion entry
      const gone = [...new Set(page.filter((r) => r.a.userId && !r.userEmail).map((r) => r.a.userId!))];
      const formerEmail = new Map<string, string>();
      if (gone.length) {
        const del = await db.select({ entityId: schema.auditLog.entityId, diff: schema.auditLog.diff }).from(schema.auditLog)
          .where(and(eq(schema.auditLog.action, "user.deleted"), inArray(schema.auditLog.entityId, gone)));
        for (const d of del) if (d.entityId) formerEmail.set(d.entityId, String((d.diff as { email?: string } | null)?.email ?? ""));
      }
      return {
        entries: page.map(({ a, userEmail, tenantName }) => ({
          id: a.id, ts: a.ts.toISOString(), action: a.action, userId: a.userId, userEmail: userEmail ?? null,
          userDeleted: Boolean(a.userId && !userEmail), formerEmail: a.userId && !userEmail ? formerEmail.get(a.userId) || null : null,
          tenantId: a.tenantId, tenantName: tenantName ?? null, entityType: a.entityType, entityId: a.entityId,
          diff: (a.diff as Record<string, unknown> | null) ?? null,
        })),
        nextBefore: more ? page[page.length - 1]!.a.id : null,
      };
    });
  };
