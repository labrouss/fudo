import type { FastifyPluginAsync } from "fastify";
import { asc, eq, sql } from "drizzle-orm";
import { schema } from "@fudo/db";
import { tenantSchema, type TenantDto } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { requireSuperadmin, requireUser } from "../plugins/auth.js";
import { accessibleTenants, loadMemberships } from "../lib/authz.js";

const uniqueViolation = (err: unknown) => (err as { code?: string }).code === "23505" || (err as { cause?: { code?: string } }).cause?.code === "23505";

export const tenantRoutes =
  ({ db }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const memberCount = sql<number>`(SELECT count(DISTINCT user_id)::int FROM user_tenant_roles r WHERE r.tenant_id = ${schema.tenants.id})`;

    async function list(): Promise<TenantDto[]> {
      const rows = await db.select({ t: schema.tenants, memberCount }).from(schema.tenants).orderBy(asc(schema.tenants.name));
      return rows.map(({ t, memberCount }) => ({
        id: t.id, name: t.name, slug: t.slug, description: t.description, isActive: t.isActive,
        createdAt: t.createdAt.toISOString(), memberCount,
      }));
    }

    /** Superadmins get every tenant (incl. inactive) with details; others get the tenants they can access. */
    app.get("/tenants", async (req) => {
      const user = requireUser(req);
      if (user.isSuperadmin) return list();
      return accessibleTenants(db, user, await loadMemberships(db, user.id));
    });

    app.post("/tenants", async (req, reply) => {
      const actor = requireSuperadmin(req);
      const input = parse(tenantSchema, req.body);
      try {
        const [t] = await db.insert(schema.tenants).values(input).returning();
        await audit(db, { userId: actor.id, tenantId: t!.id, action: "tenant.created", entityType: "tenant", entityId: t!.id, diff: { ...input } });
        reply.code(201);
        return { id: t!.id };
      } catch (err) {
        if (uniqueViolation(err)) throw new HttpError(409, "conflict", "Check the highlighted fields", { slug: "This short name is already used" });
        throw err;
      }
    });

    app.put<{ Params: { id: string } }>("/tenants/:id", async (req) => {
      const actor = requireSuperadmin(req);
      const input = parse(tenantSchema, req.body);
      const [before] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, req.params.id));
      if (!before) throw new HttpError(404, "not_found", "Tenant not found");
      try {
        await db.update(schema.tenants).set({ ...input, updatedAt: new Date() }).where(eq(schema.tenants.id, before.id));
      } catch (err) {
        if (uniqueViolation(err)) throw new HttpError(409, "conflict", "Check the highlighted fields", { slug: "This short name is already used" });
        throw err;
      }
      const changed = Object.fromEntries(
        (Object.keys(input) as Array<keyof typeof input>).filter((k) => input[k] !== before[k]).map((k) => [k, { from: before[k], to: input[k] }]),
      );
      await audit(db, { userId: actor.id, tenantId: before.id, action: "tenant.updated", entityType: "tenant", entityId: before.id, diff: changed });
      return { ok: true };
    });
  };
