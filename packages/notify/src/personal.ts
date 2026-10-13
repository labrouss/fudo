/**
 * Messages to one person's own contact methods (verification codes, tests, on-call alerts):
 * email through the configured SMTP server, a personal Teams workflow, or the organisation's
 * Telegram bot.
 */
import nodemailer from "nodemailer";
import { smtpErrorMessage } from "@fudo/shared";
import type { SmtpConfig } from "./senders.js";

export type PersonalType = "email" | "teams" | "telegram";

/** Email through the configured SMTP server, with the same TLS handling as email channels. */
export function smtpSender(s: SmtpConfig | null): PersonalDeps["sendEmail"] {
  return async (to, subject, text) => {
    if (!s) throw new Error("Email is not configured. Set up SMTP in Settings first.");
    const t = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.secure, auth: s.username ? { user: s.username, pass: s.password } : undefined, connectionTimeout: 10_000, greetingTimeout: 10_000, tls: { rejectUnauthorized: !s.allowUntrusted } });
    await t.sendMail({ from: s.from, to, subject, text }).catch((err) => { throw new Error(smtpErrorMessage(err, s)); });
  };
}
export interface PersonalMessage { title: string; text: string; link?: string; actions?: Array<{ title: string; url: string }> }
export interface PersonalDeps {
  sendEmail: (to: string, subject: string, text: string) => Promise<void>;
  telegramToken: string | null;
  /** for tests or an outbound proxy; default https://api.telegram.org */
  telegramApi?: string;
}

/**
 * Teams workflow URLs live on Microsoft's domains. Accepting only those keeps a signed-in user
 * from making the server call internal addresses (server-side request forgery).
 */
const TEAMS_HOSTS = [".logic.azure.com", ".powerplatform.com", ".webhook.office.com", ".azure-apim.net"];
export function teamsUrlAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && TEAMS_HOSTS.some((h) => u.hostname.endsWith(h)) && !u.username && !u.password;
  } catch { return false; }
}

export async function sendPersonal(type: PersonalType, target: string, m: PersonalMessage, deps: PersonalDeps): Promise<void> {
  const lines = [...(m.actions ?? []).map((a) => `${a.title}: ${a.url}`), ...(m.link ? [m.link] : [])];
  const body = lines.length ? `${m.text}\n\n${lines.join("\n")}` : m.text;
  if (type === "email") return deps.sendEmail(target, m.title, body);
  if (type === "teams") {
    if (!teamsUrlAllowed(target) && !process.env.FUDO_TEST_ALLOW_ANY_TEAMS_URL) throw new Error("This is not a Microsoft Teams workflow address");
    const card = {
      type: "AdaptiveCard", $schema: "http://adaptivecards.io/schemas/adaptive-card.json", version: "1.4",
      body: [{ type: "TextBlock", text: m.title, weight: "Bolder", size: "Medium", wrap: true }, { type: "TextBlock", text: m.text, wrap: true }],
      ...(m.actions?.length || m.link ? { actions: [...(m.actions ?? []).map((a) => ({ type: "Action.OpenUrl", title: a.title, url: a.url })), ...(m.link ? [{ type: "Action.OpenUrl", title: "Fudo", url: m.link }] : [])] } : {}),
    };
    const res = await fetch(target, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: card }] }), signal: AbortSignal.timeout(10_000), redirect: "error" });
    if (!res.ok) throw new Error(`Teams answered ${res.status}`);
    return;
  }
  if (!deps.telegramToken) throw new Error("No Telegram bot is configured");
  const api = deps.telegramApi ?? "https://api.telegram.org";
  const res = await fetch(`${api}/bot${deps.telegramToken}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: target, text: `${m.title}\n\n${body}`, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { description?: string };
    throw new Error(`Telegram: ${d.description ?? res.status}`);
  }
}

/** Checks a bot token with Telegram; returns the bot's @username. */
export async function telegramBotName(token: string, telegramApi = "https://api.telegram.org"): Promise<string> {
  const res = await fetch(`${telegramApi}/bot${token}/getMe`, { signal: AbortSignal.timeout(10_000) });
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { username?: string }; description?: string };
  if (!res.ok || !d.ok) throw new Error(d.description ?? `Telegram answered ${res.status}`);
  return d.result?.username ?? "bot";
}
