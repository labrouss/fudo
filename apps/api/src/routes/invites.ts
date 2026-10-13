import { issueMessage } from "@fudo/shared";
import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { schema } from "@fudo/db";
import { acceptInviteSchema, passwordSchema, type InviteInfo } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/passwords.js";
import { findValidInvite } from "../lib/invites.js";
import { audit } from "../lib/audit.js";
import { getSetting, SETTING } from "../lib/settings.js";

const INVALID = () => new HttpError(404, "invite_invalid", "This link is not valid anymore. It may have been used or expired. Ask an administrator for a new one.");

/** Public endpoints behind a one-time link. After accepting, the user continues with /enroll/totp. */
export const inviteRoutes =
  ({ db, sessions }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const limited = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

    app.get<{ Params: { token: string } }>("/invites/:token", limited, async (req): Promise<InviteInfo> => {
      const row = await findValidInvite(db, req.params.token);
      if (!row) throw INVALID();
      return { email: row.user.email, displayName: row.user.displayName, kind: row.invite.kind, orgName: await getSetting<string>(db, SETTING.orgName) };
    });

    app.post<{ Params: { token: string } }>("/invites/:token/accept", limited, async (req, reply) => {
      const row = await findValidInvite(db, req.params.token);
      if (!row) throw INVALID();
      const { password } = parse(acceptInviteSchema, req.body);
      const { user, invite } = row;

      if (invite.kind === "invite") {
        const check = passwordSchema.safeParse(password);
        if (!check.success) throw new HttpError(400, "validation_failed", "Check the highlighted fields", { password: issueMessage(check.error.issues[0]!) });
        if (password.toLowerCase().includes(user.email.split("@")[0]!.toLowerCase())) {
          throw new HttpError(400, "validation_failed", "Check the highlighted fields", { password: "The password must not contain your email name" });
        }
        await db.update(schema.users).set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date() }).where(eq(schema.users.id, user.id));
      } else if (!user.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
        await audit(db, { userId: user.id, action: "invite.password_failed", diff: { ip: req.ip } });
        throw new HttpError(401, "bad_credentials", "The password is incorrect", { password: "The password is incorrect" });
      }

      await db.update(schema.invites).set({ usedAt: new Date() }).where(eq(schema.invites.id, invite.id));
      await sessions.rotate(req, reply, user.id, false);
      await audit(db, { userId: user.id, action: "invite.accepted", entityType: "invite", entityId: invite.id, diff: { kind: invite.kind } });
      return { ok: true };
    });
  };
