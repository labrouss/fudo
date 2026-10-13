import { and, eq, isNull } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { schema, type Db } from "@fudo/db";
import { randomToken, sha256, type Env, type InviteLinkResponse } from "@fudo/shared";
import { getSetting, SETTING, type StoredSmtp } from "./settings.js";
import { sendMail } from "./mail.js";
import { messageLang } from "@fudo/notify/server";
import { sql } from "drizzle-orm";

export const userLocale = async (db: Db, userId: string) =>
  ((await db.execute(sql`SELECT locale FROM users WHERE id = ${userId}`)).rows[0]?.locale as string | null) ?? null;
import { publicOrigin } from "./origin.js";

export const INVITE_TTL_HOURS = 72;


/** Creates a one-time link (replacing any unused one for this user) and emails it if SMTP is set up. */
export async function issueInvite(
  db: Db,
  env: Env,
  req: FastifyRequest,
  opts: { user: { id: string; email: string; displayName: string }; kind: "invite" | "reset_2fa"; createdBy: string; sendEmail: boolean },
): Promise<InviteLinkResponse> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000);
  await db.delete(schema.invites).where(and(eq(schema.invites.userId, opts.user.id), isNull(schema.invites.usedAt)));
  await db.insert(schema.invites).values({ tokenHash: sha256(token), userId: opts.user.id, kind: opts.kind, createdBy: opts.createdBy, expiresAt });
  const link = `${publicOrigin(req, env)}/invite/${token}`;

  const result: InviteLinkResponse = { link, expiresAt: expiresAt.toISOString(), emailed: false };
  if (!opts.sendEmail) return result;
  const smtp = await getSetting<StoredSmtp>(db, SETTING.smtp);
  if (!smtp) return result;
  const org = (await getSetting<string>(db, SETTING.orgName)) ?? "Fudo";
  // the recipient's language (set in the invite dialog or by the user), else the organisation default
  const L = await messageLang(db.$client, await userLocale(db, opts.user.id));
  const kind = opts.kind === "invite" ? "invite" : "reset";
  const vars = { name: opts.user.displayName, org, link, hours: INVITE_TTL_HOURS };
  try {
    await sendMail(env, smtp, { to: opts.user.email, subject: L.t(`notify.mail.${kind}.subject`, vars), text: L.t(`notify.mail.${kind}.text`, vars) });
    result.emailed = true;
  } catch (err) {
    result.emailError = (err as Error).message;
  }
  return result;
}

export async function findValidInvite(db: Db, token: string) {
  const rows = await db
    .select({ invite: schema.invites, user: schema.users })
    .from(schema.invites)
    .innerJoin(schema.users, eq(schema.users.id, schema.invites.userId))
    .where(eq(schema.invites.tokenHash, sha256(token)));
  const row = rows[0];
  if (!row || row.invite.usedAt || row.invite.expiresAt < new Date() || !row.user.isActive) return null;
  return row;
}
