import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { and, asc, eq, ne } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { schema } from "@fudo/db";
import { userCreateSchema, userUpdateSchema, type Membership, type RoleAssignment, type UserDto, type Role } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { conflict, HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { requireSuperadmin } from "../plugins/auth.js";
import { userStatus } from "../lib/authz.js";
import { issueInvite } from "../lib/invites.js";
import type { UserRow } from "../lib/sessions.js";

/** User administration (superadmin). */
export const userRoutes =
  ({ db, env, sessions, totp }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    async function toDtos(users: UserRow[]): Promise<UserDto[]> {
      const roles = await db
        .select({ userId: schema.userTenantRoles.userId, tenantId: schema.userTenantRoles.tenantId, tenantName: schema.tenants.name, role: schema.userTenantRoles.role })
        .from(schema.userTenantRoles)
        .leftJoin(schema.tenants, eq(schema.tenants.id, schema.userTenantRoles.tenantId));
      const byUser = new Map<string, Membership[]>();
      for (const r of roles) {
        const list = byUser.get(r.userId) ?? [];
        list.push({ tenantId: r.tenantId, tenantName: r.tenantName ?? null, role: r.role as Role });
        byUser.set(r.userId, list);
      }
      return users.map((u) => ({
        id: u.id, email: u.email, displayName: u.displayName, isSuperadmin: u.isSuperadmin, isActive: u.isActive,
        status: userStatus(u), totpEnabled: u.totpEnabled,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString(),
        roles: byUser.get(u.id) ?? [],
      }));
    }

    async function getUser(id: string): Promise<UserRow> {
      const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
      if (!u) throw new HttpError(404, "not_found", "User not found");
      return u;
    }

    async function otherActiveSuperadmins(excludeId: string): Promise<number> {
      const rows = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.isSuperadmin, true), eq(schema.users.isActive, true), eq(schema.users.totpEnabled, true), ne(schema.users.id, excludeId)));
      return rows.length;
    }

    function notSelf(actor: UserRow, target: UserRow, what: string) {
      if (actor.id === target.id) throw conflict(`You cannot ${what} your own account here`);
    }

    async function replaceRoles(userId: string, roles: RoleAssignment[]) {
      const unique = new Map(roles.map((r) => [`${r.tenantId ?? "global"}`, r])); // one role per scope
      await db.delete(schema.userTenantRoles).where(eq(schema.userTenantRoles.userId, userId));
      if (unique.size) {
        await db.insert(schema.userTenantRoles).values([...unique.values()].map((r) => ({ userId, tenantId: r.tenantId, role: r.role })));
      }
    }

    app.get("/users", async (req) => {
      requireSuperadmin(req);
      return toDtos(await db.select().from(schema.users).orderBy(asc(schema.users.displayName)));
    });

    app.post("/users", async (req, reply) => {
      const actor = requireSuperadmin(req);
      const input = parse(userCreateSchema, req.body);
      const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, input.email));
      if (exists) throw new HttpError(409, "conflict", "Check the highlighted fields", { email: "A user with this email already exists" });
      const [user] = await db
        .insert(schema.users)
        .values({ email: input.email, displayName: input.displayName, isSuperadmin: input.isSuperadmin, passwordHash: null, totpSecretEnc: totp.newEncryptedSecret() })
        .returning();
      await replaceRoles(user!.id, input.roles);
      if (input.locale) await db.execute(sql`UPDATE users SET locale = ${input.locale} WHERE id = ${user!.id}`);
      const invite = await issueInvite(db, env, req, { user: user!, kind: "invite", createdBy: actor.id, sendEmail: input.sendEmail });
      await audit(db, { userId: actor.id, action: "user.created", entityType: "user", entityId: user!.id, diff: { email: input.email, isSuperadmin: input.isSuperadmin, roles: input.roles, emailed: invite.emailed } });
      reply.code(201);
      return { user: (await toDtos([user!]))[0], invite };
    });

    app.put<{ Params: { id: string } }>("/users/:id", async (req) => {
      const actor = requireSuperadmin(req);
      const target = await getUser(req.params.id);
      const input = parse(userUpdateSchema, req.body);
      if (input.isSuperadmin === false && target.isSuperadmin) {
        notSelf(actor, target, "remove superadmin from");
        if ((await otherActiveSuperadmins(target.id)) === 0) throw conflict("At least one active superadmin must remain");
      }
      const patch: Partial<UserRow> = {};
      if (input.displayName !== undefined) patch.displayName = input.displayName;
      if (input.isSuperadmin !== undefined) patch.isSuperadmin = input.isSuperadmin;
      if (Object.keys(patch).length) await db.update(schema.users).set(patch).where(eq(schema.users.id, target.id));
      if (input.roles) await replaceRoles(target.id, input.roles);
      await audit(db, { userId: actor.id, action: "user.updated", entityType: "user", entityId: target.id, diff: { email: target.email, ...input } });
      return { ok: true };
    });

    /** New invitation link for a user who has not accepted yet. */
    app.post<{ Params: { id: string } }>("/users/:id/invite", async (req) => {
      const actor = requireSuperadmin(req);
      const target = await getUser(req.params.id);
      const status = userStatus(target);
      if (status !== "invited" && status !== "reset_pending") throw conflict("This user has already finished signing up");
      const invite = await issueInvite(db, env, req, { user: target, kind: status === "invited" ? "invite" : "reset_2fa", createdBy: actor.id, sendEmail: true });
      await audit(db, { userId: actor.id, action: "user.invite_sent", entityType: "user", entityId: target.id, diff: { email: target.email, emailed: invite.emailed } });
      return invite;
    });

    async function signOutEverywhere(userId: string) {
      await sessions.destroyAllForUser(userId);
      await db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId));
    }

    /** Lost phone: keep the password, register a new authenticator via a one-time link. */
    app.post<{ Params: { id: string } }>("/users/:id/reset-2fa", async (req) => {
      const actor = requireSuperadmin(req);
      const target = await getUser(req.params.id);
      notSelf(actor, target, "reset 2FA for");
      if (!target.passwordHash) throw conflict("This user has not accepted the invitation yet. Send a new invitation instead.");
      await db.update(schema.users).set({ totpEnabled: false, totpSecretEnc: totp.newEncryptedSecret(), totpLastStep: null }).where(eq(schema.users.id, target.id));
      await signOutEverywhere(target.id);
      const invite = await issueInvite(db, env, req, { user: target, kind: "reset_2fa", createdBy: actor.id, sendEmail: true });
      await audit(db, { userId: actor.id, action: "user.2fa_reset", entityType: "user", entityId: target.id, diff: { email: target.email, emailed: invite.emailed } });
      return invite;
    });

    /** Forgotten password: clear password and 2FA, user starts over from a new invitation. */
    app.post<{ Params: { id: string } }>("/users/:id/reset-signin", async (req) => {
      const actor = requireSuperadmin(req);
      const target = await getUser(req.params.id);
      notSelf(actor, target, "reset sign-in for");
      await db
        .update(schema.users)
        .set({ passwordHash: null, totpEnabled: false, totpSecretEnc: totp.newEncryptedSecret(), totpLastStep: null, failedLoginCount: 0, lockedUntil: null })
        .where(eq(schema.users.id, target.id));
      await signOutEverywhere(target.id);
      const invite = await issueInvite(db, env, req, { user: target, kind: "invite", createdBy: actor.id, sendEmail: true });
      await audit(db, { userId: actor.id, action: "user.signin_reset", entityType: "user", entityId: target.id, diff: { email: target.email, emailed: invite.emailed } });
      return invite;
    });

    async function setActive(req: FastifyRequest<{ Params: { id: string } }>, active: boolean) {
      const actor = requireSuperadmin(req);
      const target = await getUser(req.params.id);
      notSelf(actor, target, active ? "activate" : "deactivate");
      if (!active && target.isSuperadmin && (await otherActiveSuperadmins(target.id)) === 0) throw conflict("At least one active superadmin must remain");
      await db.update(schema.users).set({ isActive: active, ...(active ? { failedLoginCount: 0, lockedUntil: null } : {}) }).where(eq(schema.users.id, target.id));
      if (!active) await sessions.destroyAllForUser(target.id);
      await audit(db, { userId: actor.id, action: active ? "user.activated" : "user.deactivated", entityType: "user", entityId: target.id, diff: { email: target.email } });
      return { ok: true };
    }
    /**
     * Deletes a user for good. Sessions, roles, recovery codes and invitations go with the account
     * (ON DELETE CASCADE); their past actions stay (incident notes, acknowledgements and created-by
     * fields are set to NULL; the audit log keeps the id and this entry records who it was).
     */
    app.delete<{ Params: { id: string } }>("/users/:id", async (req) => {
      const actor = requireSuperadmin(req);
      const target = await getUser(req.params.id);
      notSelf(actor, target, "delete");
      if (target.isSuperadmin && target.isActive && (await otherActiveSuperadmins(target.id)) === 0) throw conflict("At least one active superadmin must remain");
      await sessions.destroyAllForUser(target.id);
      await db.delete(schema.users).where(eq(schema.users.id, target.id));
      await audit(db, { userId: actor.id, action: "user.deleted", entityType: "user", entityId: target.id, diff: { email: target.email, displayName: target.displayName, wasSuperadmin: target.isSuperadmin } });
      return { ok: true };
    });

    app.post<{ Params: { id: string } }>("/users/:id/deactivate", (req) => setActive(req, false));
    app.post<{ Params: { id: string } }>("/users/:id/activate", (req) => setActive(req, true));
  };
