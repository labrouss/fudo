import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { eq, sql } from "drizzle-orm";
import { schema } from "@fudo/db";
import { loginSchema, mfaSchema, type MeResponse } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { burnPasswordCheck, verifyPassword } from "../lib/passwords.js";
import { audit } from "../lib/audit.js";
import { getSetting, setSetting, SETTING } from "../lib/settings.js";
import { publicOrigin } from "../lib/origin.js";
import { requirePendingMfa, requireUser } from "../plugins/auth.js";
import { accessibleTenants, loadMemberships } from "../lib/authz.js";

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const BAD_CREDENTIALS = "The email or password is incorrect";

let lastBase = "";

export const authRoutes =
  ({ db, sessions, totp, env }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const limited = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

    /** Increments the failure counter; locks the account after MAX_FAILURES. */
    async function registerFailure(userId: string, req: FastifyRequest, action: string) {
      const [row] = await db
        .update(schema.users)
        .set({ failedLoginCount: sql`${schema.users.failedLoginCount} + 1` })
        .where(eq(schema.users.id, userId))
        .returning({ n: schema.users.failedLoginCount });
      if ((row?.n ?? 0) >= MAX_FAILURES) {
        await db
          .update(schema.users)
          .set({ failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) })
          .where(eq(schema.users.id, userId));
        await audit(db, { userId, action: "auth.locked", diff: { ip: req.ip, minutes: LOCK_MINUTES } });
      }
      await audit(db, { userId, action, diff: { ip: req.ip } });
    }

    function assertNotLocked(user: { lockedUntil: Date | null }) {
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
        throw new HttpError(429, "locked", `Too many failed attempts. Try again in ${mins} min.`);
      }
    }

    app.post("/auth/login", limited, async (req, reply) => {
      const { email, password } = parse(loginSchema, req.body);
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
      if (!user || !user.isActive || !user.passwordHash) {
        await burnPasswordCheck(password);
        throw new HttpError(401, "bad_credentials", BAD_CREDENTIALS);
      }
      assertNotLocked(user);
      if (!(await verifyPassword(user.passwordHash, password))) {
        await registerFailure(user.id, req, "auth.login_failed");
        throw new HttpError(401, "bad_credentials", BAD_CREDENTIALS);
      }
      if (!user.totpEnabled) {
        throw new HttpError(403, "mfa_not_enrolled", "Two-factor authentication is not set up for this account yet. Use the link from your invitation email, or ask an administrator for a new one.");
      }
      await sessions.rotate(req, reply, user.id, false);
      return { mfaRequired: true };
    });

    app.post("/auth/mfa", limited, async (req, reply) => {
      const user = requirePendingMfa(req);
      assertNotLocked(user);
      const input = parse(mfaSchema, req.body);
      const ok =
        "code" in input
          ? await totp.verifyAndConsume(user, input.code)
          : await totp.consumeRecoveryCode(user.id, input.recoveryCode);
      if (!ok) {
        await registerFailure(user.id, req, "auth.mfa_failed");
        throw new HttpError(401, "invalid_code", "That code did not match", "code" in input ? { code: "Code did not match" } : { recoveryCode: "Recovery code not valid or already used" });
      }
      await db.update(schema.users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
      await sessions.rotate(req, reply, user.id, true);
      await audit(db, { userId: user.id, action: "auth.login", diff: { ip: req.ip, method: "code" in input ? "totp" : "recovery_code" } });
      return { ok: true };
    });

    app.get("/auth/me", async (req): Promise<MeResponse> => {
      const u = requireUser(req);
      const memberships = await loadMemberships(db, u.id);
      // the worker has no request to derive links from: remember the address users reach us at
      const base = publicOrigin(req, env);
      if (base !== lastBase) { lastBase = base; await setSetting(db, "app.baseUrl", base); }
      return {
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        isSuperadmin: u.isSuperadmin,
        orgName: await getSetting<string>(db, SETTING.orgName),
        memberships,
        tenants: await accessibleTenants(db, u, memberships),
        ...(await (async () => {
          const r = (await db.execute(sql`SELECT locale, theme FROM users WHERE id = ${u.id}`)).rows[0];
          return { locale: (r?.locale as string | null) ?? null, theme: (r?.theme as string | null) ?? null };
        })()),
      };
    });

    app.post("/auth/logout", async (req, reply) => {
      const userId = req.auth?.user.id;
      await sessions.destroy(req, reply);
      if (userId) await audit(db, { userId, action: "auth.logout" });
      return { ok: true };
    });
  };
