import type { FastifyPluginAsync } from "fastify";
import { encrypt, smtpSchema, smtpTestSchema, smtpErrorMessage } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { getSetting, setSetting, SETTING, type StoredSmtp } from "../lib/settings.js";
import { sendMail, smtpKey } from "../lib/mail.js";
import { userLocale } from "../lib/invites.js";
import { messageLang, serverI18n } from "@fudo/notify/server";
import { z } from "zod";
import { requireSuperadmin, requireUser } from "../plugins/auth.js";

export const settingsRoutes =
  ({ db, env }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    /** Default language of notifications, emails and reports (channels and users can override it). */
    /** Read-only for every signed-in user: what "organisation default" means in channel forms. */
    app.get("/notify-locale", async (req) => {
      requireUser(req);
      return { locale: (await getSetting<string>(db, SETTING.notifyLocale)) ?? "en" };
    });
    app.get("/settings/notify-locale", async (req) => {
      requireSuperadmin(req);
      return { locale: (await getSetting<string>(db, SETTING.notifyLocale)) ?? "en" };
    });
    app.put("/settings/notify-locale", async (req) => {
      const user = requireSuperadmin(req);
      const { locale } = parse(z.object({ locale: z.string() }), req.body);
      if (!serverI18n().has(locale)) throw new HttpError(400, "validation_failed", "Check the highlighted fields", { locale: "Unknown language" });
      await setSetting(db, SETTING.notifyLocale, locale);
      await audit(db, { userId: user.id, action: "settings.notify_locale", diff: { locale } });
      return { locale };
    });

    app.get("/settings/smtp", async (req) => {
      requireSuperadmin(req);
      const s = await getSetting<StoredSmtp>(db, SETTING.smtp);
      if (!s) return { configured: false };
      const { passwordEnc, ...rest } = s;
      return { configured: true, ...rest, hasPassword: Boolean(passwordEnc) };
    });

    app.put("/settings/smtp", async (req) => {
      const user = requireSuperadmin(req);
      const input = parse(smtpSchema, req.body);
      const existing = await getSetting<StoredSmtp>(db, SETTING.smtp);
      // Empty/omitted password keeps the stored one.
      const passwordEnc = input.password ? encrypt(input.password, smtpKey(env)) : (existing?.passwordEnc ?? null);
      const stored: StoredSmtp = { host: input.host, port: input.port, secure: input.secure, username: input.username, passwordEnc, from: input.from, allowUntrusted: input.allowUntrusted };
      await setSetting(db, SETTING.smtp, stored);
      await audit(db, { userId: user.id, action: "settings.smtp_updated", diff: { host: input.host, port: input.port, secure: input.secure, from: input.from, allowUntrusted: input.allowUntrusted } });
      return { ok: true };
    });

    app.post("/settings/smtp/test", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req) => {
      const user = requireSuperadmin(req);
      const { to } = parse(smtpTestSchema, req.body);
      const smtp = await getSetting<StoredSmtp>(db, SETTING.smtp);
      if (!smtp) throw new HttpError(400, "smtp_not_configured", "Save the SMTP settings first");
      try {
        // in the sender's own language (they read it), else the organisation default
        const L = await messageLang(db.$client, await userLocale(db, user.id));
        await sendMail(env, smtp, { to, subject: L.t("notify.mail.test.subject"), text: L.t("notify.mail.test.text", { name: user.displayName }) });
      } catch (err) {
        throw new HttpError(502, "smtp_failed", smtpErrorMessage(err, smtp));
      }
      return { ok: true };
    });
  };
