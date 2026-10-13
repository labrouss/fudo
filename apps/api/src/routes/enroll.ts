import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { schema } from "@fudo/db";
import { totpCodeSchema } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { conflict, HttpError, parse, unauthorized } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { getSetting, setSetting, SETTING } from "../lib/settings.js";

/**
 * 2FA enrollment for a signed-in-by-password user who has no 2FA yet:
 * the first administrator (setup wizard), invited users and users whose 2FA was reset.
 */
export const enrollRoutes =
  ({ db, sessions, totp }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    function pendingUser(req: FastifyRequest) {
      const u = req.auth?.user;
      if (!u || !u.passwordHash) throw unauthorized("Open your invitation link or start the setup again");
      if (u.totpEnabled) throw conflict("Two-factor authentication is already set up");
      return u;
    }

    app.get("/enroll/totp", async (req) => {
      const user = pendingUser(req);
      const org = (await getSetting<string>(db, SETTING.orgName)) ?? "Fudo";
      return totp.enrollment(user, `Fudo (${org})`);
    });

    app.post("/enroll/totp", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
      const user = pendingUser(req);
      const { code } = parse(totpCodeSchema, req.body);
      if (!(await totp.verifyAndConsume(user, code))) {
        throw new HttpError(400, "invalid_code", "That code did not match. Check the time on your phone and try the next code.", { code: "Code did not match" });
      }
      await db.update(schema.users).set({ totpEnabled: true, lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null }).where(eq(schema.users.id, user.id));
      const recoveryCodes = await totp.regenerateRecoveryCodes(user.id);
      if (user.isSuperadmin && !(await getSetting<string>(db, SETTING.setupCompletedAt))) {
        await setSetting(db, SETTING.setupCompletedAt, new Date().toISOString());
        await audit(db, { userId: user.id, action: "setup.completed" });
      }
      await sessions.rotate(req, reply, user.id, true);
      await audit(db, { userId: user.id, action: "auth.2fa_enrolled", entityType: "user", entityId: user.id });
      return { recoveryCodes };
    });
  };
