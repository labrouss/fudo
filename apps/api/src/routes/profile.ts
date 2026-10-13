/**
 * The signed-in user's own profile: name, password, a new 2FA device, recovery codes, sessions,
 * personal contact methods (verified with a code) and personal notification steps. Also the
 * organisation's Telegram bot (superadmins), which delivers to people's Telegram chats.
 */
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { withTenant } from "@fudo/db";
import { onCallAt, upcomingShifts } from "@fudo/shared";
import { rows } from "./common.js";
import { schema } from "@fudo/db";
import {
  changePasswordSchema, confirmPasswordSchema, contactMethodSchema, telegramBotSchema, decrypt, deriveKey, encrypt, notificationStepsSchema, profileSchema, totpCodeSchema,
  type ContactMethodDto, type ProfileDto, type SessionDto,
} from "@fudo/shared";
import { messageLang, sendPersonal, teamsUrlAllowed, telegramBotName, type PersonalType } from "@fudo/notify/server";
import { userLocale } from "../lib/invites.js";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { hashPassword, verifyPassword } from "../lib/passwords.js";
import { getSetting, setSetting, SETTING, type StoredSmtp } from "../lib/settings.js";
import { sendMail } from "../lib/mail.js";
import { requireSuperadmin, requireUser } from "../plugins/auth.js";
import { notFound } from "./common.js";

const TELEGRAM_KEY = "telegram";
const CODE_MINUTES = 15, CODE_ATTEMPTS = 5;
const telegramApi = () => process.env.TELEGRAM_API_URL || undefined;
const hashCode = (id: string, code: string) => createHash("sha256").update(`${id}:${code}`).digest("hex");
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
/** A Teams workflow URL is a secret: show only enough to recognise it. */
const shown = (type: string, target: string) => (type === "teams" ? `${new URL(target).hostname} …${target.slice(-6)}` : target);

export const profileRoutes =
  ({ db, pool, env, sessions, totp }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const contactKey = deriveKey(env.APP_SECRET, "contact-target");
    const telegramKey = deriveKey(env.APP_SECRET, "telegram-bot");
    const limited = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

    const telegramToken = async () => { const t = await getSetting<{ botTokenEnc?: string }>(db, TELEGRAM_KEY); return t?.botTokenEnc ? decrypt(t.botTokenEnc, telegramKey) : null; };
    const deps = async () => ({
      sendEmail: async (to: string, subject: string, text: string) => {
        const smtp = await getSetting<StoredSmtp>(db, SETTING.smtp);
        if (!smtp) throw new HttpError(409, "smtp_missing", "Email is not set up yet");
        await sendMail(env, smtp, { to, subject, text });
      },
      telegramToken: await telegramToken(), telegramApi: telegramApi(),
    });
    /** Sends, and turns delivery problems into a clear 502 instead of a server error. */
    async function deliver(type: PersonalType, target: string, title: string, text: string) {
      try { await sendPersonal(type, target, { title, text }, await deps()); }
      catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(502, "delivery_failed", "The message could not be delivered: {reason}".replace("{reason}", (e as Error).message)); }
    }
    async function checkPassword(userId: string, password: string) {
      const u = (await db.select().from(schema.users).where(eq(schema.users.id, userId)))[0]!;
      if (!(await verifyPassword(u.passwordHash ?? "", password))) throw new HttpError(400, "validation_failed", "Check the highlighted fields", { password: "Incorrect password" });
      return u;
    }
    const endOtherSessions = (req: FastifyRequest, userId: string) => db.delete(schema.sessions).where(and(eq(schema.sessions.userId, userId), ne(schema.sessions.id, req.auth!.session.id)));
    async function contacts(userId: string): Promise<ContactMethodDto[]> {
      const rows = await db.select().from(schema.userContactMethods).where(eq(schema.userContactMethods.userId, userId)).orderBy(schema.userContactMethods.createdAt);
      return rows.map((r) => ({ id: r.id, type: r.type as PersonalType, label: r.label, target: shown(r.type, decrypt(r.targetEnc, contactKey)), verified: !!r.verifiedAt }));
    }
    async function ownContact(userId: string, id: string) {
      const r = (await db.select().from(schema.userContactMethods).where(and(eq(schema.userContactMethods.id, id), eq(schema.userContactMethods.userId, userId))))[0];
      if (!r) throw notFound("Contact method");
      return r;
    }
    /** Messages to a person are in that person's language. */
    const langOf = async (userId: string) => messageLang(db.$client, await userLocale(db, userId));
    async function sendCode(userId: string, id: string, type: PersonalType, target: string) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await db.update(schema.userContactMethods).set({ codeHash: hashCode(id, code), codeExpiresAt: new Date(Date.now() + CODE_MINUTES * 60_000), codeAttempts: 0 }).where(eq(schema.userContactMethods.id, id));
      const L = await langOf(userId);
      await deliver(type, target, L.t("notify.contact.code_title"), L.t("notify.contact.code_text", { code, minutes: CODE_MINUTES }));
    }

    app.get("/profile", async (req): Promise<ProfileDto> => {
      const user = requireUser(req);
      const u = (await db.select().from(schema.users).where(eq(schema.users.id, user.id)))[0]!;
      const left = Number((await pool.query("SELECT count(*) AS n FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL", [user.id])).rows[0].n);
      return {
        displayName: u.displayName, email: u.email, passwordChangedAt: u.passwordChangedAt?.toISOString() ?? null, recoveryCodesLeft: left,
        contacts: await contacts(user.id), steps: (u.notificationSteps as ProfileDto["steps"]) ?? [],
        telegramBot: (await telegramToken()) ? ((await getSetting<{ botName?: string }>(db, TELEGRAM_KEY))?.botName ?? "bot") : null,
      };
    });

    app.put("/profile", async (req) => {
      const user = requireUser(req);
      const { displayName } = parse(profileSchema, req.body);
      await db.update(schema.users).set({ displayName }).where(eq(schema.users.id, user.id));
      await audit(db, { userId: user.id, action: "profile.updated", entityType: "user", entityId: user.id, diff: { displayName } });
      return { ok: true };
    });

    app.post("/profile/password", limited, async (req) => {
      const user = requireUser(req);
      const input = parse(changePasswordSchema, req.body);
      const u = (await db.select().from(schema.users).where(eq(schema.users.id, user.id)))[0]!;
      if (!(await verifyPassword(u.passwordHash ?? "", input.currentPassword))) throw new HttpError(400, "validation_failed", "Check the highlighted fields", { currentPassword: "Incorrect password" });
      await db.update(schema.users).set({ passwordHash: await hashPassword(input.newPassword), passwordChangedAt: new Date() }).where(eq(schema.users.id, user.id));
      await endOtherSessions(req, user.id);
      await audit(db, { userId: user.id, action: "auth.password_changed", entityType: "user", entityId: user.id });
      return { ok: true };
    });

    /* new 2FA device: the old one keeps working until the new one is confirmed */
    app.post("/profile/2fa/start", limited, async (req) => {
      const user = requireUser(req);
      await checkPassword(user.id, parse(confirmPasswordSchema, req.body).password);
      const pending = totp.newEncryptedSecret();
      await db.update(schema.users).set({ pendingTotpSecretEnc: pending }).where(eq(schema.users.id, user.id));
      const org = (await getSetting<string>(db, SETTING.orgName)) ?? "Fudo";
      return totp.enrollment({ email: user.email, totpSecretEnc: pending }, `Fudo (${org})`);
    });
    app.post("/profile/2fa/confirm", limited, async (req) => {
      const user = requireUser(req);
      const { code } = parse(totpCodeSchema, req.body);
      const u = (await db.select().from(schema.users).where(eq(schema.users.id, user.id)))[0]!;
      if (!u.pendingTotpSecretEnc) throw new HttpError(409, "conflict", "Start again: no new device is waiting to be confirmed");
      if (!(await totp.verifyAndConsume({ id: u.id, totpSecretEnc: u.pendingTotpSecretEnc, totpLastStep: null }, code))) {
        throw new HttpError(400, "invalid_code", "That code did not match. Check the time on your phone and try the next code.", { code: "Code did not match" });
      }
      await db.update(schema.users).set({ totpSecretEnc: u.pendingTotpSecretEnc, pendingTotpSecretEnc: null }).where(eq(schema.users.id, user.id));
      const recoveryCodes = await totp.regenerateRecoveryCodes(user.id);
      await endOtherSessions(req, user.id);
      await audit(db, { userId: user.id, action: "auth.2fa_device_changed", entityType: "user", entityId: user.id });
      return { recoveryCodes };
    });
    app.post("/profile/recovery-codes", limited, async (req) => {
      const user = requireUser(req);
      await checkPassword(user.id, parse(confirmPasswordSchema, req.body).password);
      const recoveryCodes = await totp.regenerateRecoveryCodes(user.id);
      await audit(db, { userId: user.id, action: "auth.recovery_codes_regenerated", entityType: "user", entityId: user.id });
      return { recoveryCodes };
    });

    /* sessions */
    app.get("/profile/sessions", async (req): Promise<SessionDto[]> => {
      const user = requireUser(req);
      const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, user.id)).orderBy(sql`${schema.sessions.createdAt} DESC`);
      return rows.filter((s) => s.expiresAt > new Date()).map((s) => ({ id: s.id, createdAt: s.createdAt.toISOString(), expiresAt: s.expiresAt.toISOString(), ip: s.ip ?? null, userAgent: s.userAgent ?? null, current: s.id === req.auth!.session.id }));
    });
    app.delete<{ Params: { id: string } }>("/profile/sessions/:id", async (req, reply) => {
      const user = requireUser(req);
      if (req.params.id === req.auth!.session.id) { await sessions.destroy(req, reply); return { ok: true, signedOut: true }; }
      await db.delete(schema.sessions).where(and(eq(schema.sessions.id, req.params.id), eq(schema.sessions.userId, user.id)));
      await audit(db, { userId: user.id, action: "auth.session_ended", entityType: "user", entityId: user.id });
      return { ok: true };
    });
    app.post("/profile/sessions/end-others", async (req) => {
      const user = requireUser(req);
      await endOtherSessions(req, user.id);
      await audit(db, { userId: user.id, action: "auth.other_sessions_ended", entityType: "user", entityId: user.id });
      return { ok: true };
    });

    /* contact methods */
    app.post("/profile/contacts", limited, async (req, reply) => {
      const user = requireUser(req);
      const input = parse(contactMethodSchema, req.body);
      if (input.type === "teams" && !teamsUrlAllowed(input.target) && !process.env.FUDO_TEST_ALLOW_ANY_TEAMS_URL) {
        throw new HttpError(400, "validation_failed", "Check the highlighted fields", { target: "Use the address of a Teams workflow (Microsoft domain)" });
      }
      if (input.type === "telegram" && !(await telegramToken())) throw new HttpError(409, "conflict", "No Telegram bot is configured: ask an administrator");
      const count = (await db.select().from(schema.userContactMethods).where(eq(schema.userContactMethods.userId, user.id))).length;
      if (count >= 10) throw new HttpError(409, "conflict", "You can have at most 10 contact methods");
      const id = (await db.insert(schema.userContactMethods).values({ userId: user.id, type: input.type, label: input.label, targetEnc: encrypt(input.target, contactKey) }).returning({ id: schema.userContactMethods.id }))[0]!.id;
      try { await sendCode(user.id, id, input.type, input.target); }
      catch (e) { await db.delete(schema.userContactMethods).where(eq(schema.userContactMethods.id, id)); throw e; }
      await audit(db, { userId: user.id, action: "profile.contact_added", entityType: "user", entityId: user.id, diff: { type: input.type } });
      reply.code(201);
      return { id };
    });
    app.post<{ Params: { id: string } }>("/profile/contacts/:id/verify", limited, async (req) => {
      const user = requireUser(req);
      const { code } = parse(totpCodeSchema, req.body);
      const c = await ownContact(user.id, req.params.id);
      if (c.verifiedAt) return { ok: true };
      const expired = !c.codeHash || !c.codeExpiresAt || c.codeExpiresAt < new Date() || c.codeAttempts >= CODE_ATTEMPTS;
      if (expired) throw new HttpError(400, "invalid_code", "This code has expired: send a new one", { code: "Send a new code" });
      if (!sameHash(c.codeHash!, hashCode(c.id, code))) {
        await db.update(schema.userContactMethods).set({ codeAttempts: c.codeAttempts + 1 }).where(eq(schema.userContactMethods.id, c.id));
        throw new HttpError(400, "invalid_code", "Check the highlighted fields", { code: "Code did not match" });
      }
      await db.update(schema.userContactMethods).set({ verifiedAt: new Date(), codeHash: null, codeExpiresAt: null }).where(eq(schema.userContactMethods.id, c.id));
      await audit(db, { userId: user.id, action: "profile.contact_verified", entityType: "user", entityId: user.id, diff: { type: c.type } });
      return { ok: true };
    });
    app.post<{ Params: { id: string } }>("/profile/contacts/:id/resend", limited, async (req) => {
      const user = requireUser(req);
      const c = await ownContact(user.id, req.params.id);
      if (c.verifiedAt) return { ok: true };
      await sendCode(user.id, c.id, c.type as PersonalType, decrypt(c.targetEnc, contactKey));
      return { ok: true };
    });
    app.post<{ Params: { id: string } }>("/profile/contacts/:id/test", limited, async (req) => {
      const user = requireUser(req);
      const c = await ownContact(user.id, req.params.id);
      if (!c.verifiedAt) throw new HttpError(409, "conflict", "Verify this contact method first");
      const L = await langOf(user.id);
      await deliver(c.type as PersonalType, decrypt(c.targetEnc, contactKey), L.t("notify.contact.test_title"), L.t("notify.contact.test_text"));
      return { ok: true };
    });
    app.delete<{ Params: { id: string } }>("/profile/contacts/:id", async (req) => {
      const user = requireUser(req);
      await ownContact(user.id, req.params.id);
      await db.delete(schema.userContactMethods).where(eq(schema.userContactMethods.id, req.params.id));
      // steps that used it go too
      const u = (await db.select().from(schema.users).where(eq(schema.users.id, user.id)))[0]!;
      const steps = ((u.notificationSteps as Array<{ contactId: string }>) ?? []).filter((s) => s.contactId !== req.params.id);
      await db.update(schema.users).set({ notificationSteps: steps }).where(eq(schema.users.id, user.id));
      return { ok: true };
    });

    app.put("/profile/notification-steps", async (req) => {
      const user = requireUser(req);
      const { steps } = parse(notificationStepsSchema, req.body);
      const mine = new Map((await db.select().from(schema.userContactMethods).where(eq(schema.userContactMethods.userId, user.id))).map((c) => [c.id, c]));
      if (steps.some((s) => !mine.get(s.contactId)?.verifiedAt)) throw new HttpError(400, "validation_failed", "Use only your verified contact methods");
      await db.update(schema.users).set({ notificationSteps: steps }).where(eq(schema.users.id, user.id));
      return { ok: true };
    });

    /** Your own coming on-call shifts, across every team you rotate in (overrides included). */
    app.get("/profile/oncall", async (req) => {
      const user = requireUser(req);
      return withTenant(db, "all", async (tx) => {
        const scheds = await rows(tx, sql`SELECT s.*, t.name AS team FROM oncall_schedules s JOIN teams t ON t.id = s.team_id
                                          WHERE s.enabled AND ${user.id}::uuid = ANY(s.participants)`);
        const overrides = await rows(tx, sql`SELECT o.*, t.name AS team FROM oncall_overrides o JOIN teams t ON t.id = o.team_id
                                             WHERE o.ends_at > now() ORDER BY o.starts_at`);
        const out: Array<{ team: string; start: string; end: string; source: "rotation" | "override"; now: boolean }> = [];
        const now = new Date();
        for (const s of scheds) {
          const sched = { participants: s.participants as string[], shiftDays: s.shift_days as number, handoverTime: s.handover_time as string, timezone: s.timezone as string, startDate: new Date(s.start_date as string).toISOString().slice(0, 10) };
          const own = overrides.filter((o) => o.team_id === s.team_id).map((o) => ({ userId: o.user_id as string, startsAt: new Date(o.starts_at as string), endsAt: new Date(o.ends_at as string), createdAt: new Date(o.created_at as string) }));
          const cur = onCallAt(sched, own, now);
          // rotation shifts where someone else covers by override are left out
          for (const sh of upcomingShifts(sched, now, 30).filter((x) => x.userId === user.id).slice(0, 3)) {
            const covered = own.some((o) => o.userId !== user.id && o.startsAt <= sh.start && o.endsAt >= sh.end);
            if (!covered) out.push({ team: s.team as string, start: sh.start.toISOString(), end: sh.end.toISOString(), source: "rotation", now: cur?.userId === user.id && cur.source === "rotation" && cur.start.getTime() === sh.start.getTime() });
          }
        }
        for (const o of overrides.filter((x) => x.user_id === user.id)) {
          out.push({ team: o.team as string, start: new Date(o.starts_at as string).toISOString(), end: new Date(o.ends_at as string).toISOString(), source: "override", now: new Date(o.starts_at as string) <= now });
        }
        return out.sort((a, b) => a.start.localeCompare(b.start)).slice(0, 8);
      });
    });

    /* the organisation's Telegram bot */
    app.get("/settings/telegram", async (req) => {
      requireSuperadmin(req);
      const t = await getSetting<{ botTokenEnc?: string; botName?: string }>(db, TELEGRAM_KEY);
      return { configured: !!t?.botTokenEnc, botName: t?.botName ?? null };
    });
    app.put("/settings/telegram", async (req) => {
      const user = requireSuperadmin(req);
      const { botToken } = parse(telegramBotSchema, req.body);
      if (!botToken) { await setSetting(db, TELEGRAM_KEY, {}); await audit(db, { userId: user.id, action: "settings.telegram", diff: { configured: false } }); return { configured: false }; }
      let botName: string;
      try { botName = await telegramBotName(botToken, telegramApi()); }
      catch (e) { throw new HttpError(400, "validation_failed", "Check the highlighted fields", { botToken: (e as Error).message }); }
      await setSetting(db, TELEGRAM_KEY, { botTokenEnc: encrypt(botToken, telegramKey), botName });
      await audit(db, { userId: user.id, action: "settings.telegram", diff: { configured: true, botName } });
      return { configured: true, botName };
    });
  };

