import { createHmac } from "node:crypto";
import nodemailer from "nodemailer";
import { fetch } from "undici";
import kuma from "@fudo/kuma-notifications";
import type { Message } from "./message.js";
import { smtpErrorMessage } from "@fudo/shared";
import { KUMA_PREFIX } from "./definitions.js";

export interface SmtpConfig { host: string; port: number; secure: boolean; username: string; password: string; from: string; allowUntrusted?: boolean }
export interface SendDeps {
  smtp: SmtpConfig | null;
  payload: Record<string, unknown>;
  /** what Kuma providers see as the "monitor": the incident */
  kuma?: { incidentId: string; name: string; down: boolean; baseURL: string | null; openedAt: string } | null;
}

/** Kuma providers take one message line plus monitor/heartbeat objects; we map the incident onto them. */
async function sendKuma(id: string, cfg: Record<string, unknown>, m: Message, deps: SendDeps): Promise<string> {
  const k = deps.kuma;
  // find the root cause by key: titles are translated (since 0.16.0 the English title missed non-English channels)
  const cause = m.facts.find((f) => f.key === "cause");
  // "[Fudo]" first: chats are often shared with other tools, so the source is clear at a glance
  const msg = [`[Fudo] ${m.headline}`, cause && `${cause.title}: ${cause.value}`, m.hint?.slice(0, 200), m.link]
    .filter(Boolean).join("\n");
  if (!k) return String(await kuma.send(id, cfg, msg, null, null, {}));
  const time = new Date().toISOString().replace("T", " ").slice(0, 19);
  const monitorJSON = { id: k.incidentId, monitorID: k.incidentId, name: k.name, pathName: k.name, path: [k.name], type: "http", url: k.baseURL ? `${k.baseURL}/incidents/${k.incidentId}` : "", hostname: "", port: null, tags: [] };
  const heartbeatJSON = { status: k.down ? kuma.DOWN : kuma.UP, msg: m.headline, time, timezone: "UTC", timezoneOffset: "+00:00", localDateTime: time, important: true, ping: null, monitorID: k.incidentId, lastDownTime: k.openedAt };
  return String(await kuma.send(id, cfg, msg, monitorJSON, heartbeatJSON, { baseURL: k.baseURL }));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const COLOR_HEX = { attention: "#c0392b", warning: "#d9962b", good: "#2e8b63", accent: "#2f5fa7" } as const;

async function post(url: string, body: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "user-agent": "Fudo/1.0", ...headers }, body, signal: AbortSignal.timeout(15_000) });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  return `HTTP ${res.status}`;
}

function emailHtml(m: Message): string {
  const rows = m.facts.map((f) => `<tr><td style="padding:4px 12px 4px 0;color:#5f5d56">${esc(f.title)}</td><td style="padding:4px 0">${esc(f.value)}</td></tr>`).join("");
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#16181d;max-width:640px">
  <div style="border-left:4px solid ${COLOR_HEX[m.color]};padding:4px 12px;margin-bottom:12px"><strong style="font-size:16px">${esc(m.headline)}</strong></div>
  <table style="border-collapse:collapse">${rows}</table>
  ${m.hint ? `<p style="background:#fbf6e8;border:1px solid #ecd9a4;border-radius:6px;padding:10px;color:#7a4b06">${esc(m.hint)}</p>` : ""}
  ${m.link ? `<p><a href="${esc(m.link)}" style="background:#16181d;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">${esc(m.openLabel)}</a></p>` : ""}
  <p style="color:#9a988f;font-size:12px">${esc(m.footer)}</p></div>`;
}

export async function sendMessage(type: string, cfg: Record<string, unknown>, m: Message, deps: SendDeps): Promise<string> {
  if (type.startsWith(KUMA_PREFIX)) return sendKuma(type.slice(KUMA_PREFIX.length), cfg, m, deps);
  switch (type) {
    case "email": {
      if (!deps.smtp) throw new Error("Email is not configured. Set up SMTP in Settings first.");
      const s = deps.smtp;
      const t = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.secure, auth: s.username ? { user: s.username, pass: s.password } : undefined, connectionTimeout: 10_000, greetingTimeout: 10_000, tls: { rejectUnauthorized: !s.allowUntrusted } });
      const to = String(cfg.to).split(",").map((x) => x.trim()).filter(Boolean);
      const info = await t.sendMail({ from: s.from, to, subject: m.subject, text: m.text, html: emailHtml(m) }).catch((err) => { throw new Error(smtpErrorMessage(err, s)); });
      return `accepted by SMTP (${info.accepted.length} recipient${info.accepted.length === 1 ? "" : "s"})`;
    }
    case "teams": {
      const card = {
        type: "message",
        attachments: [{
          contentType: "application/vnd.microsoft.card.adaptive",
          contentUrl: null,
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4",
            body: [
              { type: "TextBlock", text: m.headline, weight: "Bolder", size: "Medium", wrap: true, color: m.color === "good" ? "Good" : m.color === "warning" ? "Warning" : m.color === "accent" ? "Accent" : "Attention" },
              { type: "FactSet", facts: m.facts },
              ...(m.hint ? [{ type: "TextBlock", text: m.hint, wrap: true, isSubtle: true }] : []),
            ],
            actions: m.link ? [{ type: "Action.OpenUrl", title: m.openLabel, url: m.link }] : [],
          },
        }],
      };
      return post(String(cfg.url), JSON.stringify(card));
    }
    case "slack": {
      const body = {
        text: m.subject,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `*${m.headline}*` } },
          { type: "section", fields: m.facts.map((f) => ({ type: "mrkdwn", text: `*${f.title}*\n${f.value}` })) },
          ...(m.hint ? [{ type: "context", elements: [{ type: "mrkdwn", text: m.hint }] }] : []),
          ...(m.link ? [{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: m.openLabel }, url: m.link }] }] : []),
        ],
      };
      return post(String(cfg.url), JSON.stringify(body));
    }
    case "webhook": {
      const body = JSON.stringify({ ...deps.payload, message: { subject: m.subject, text: m.text, facts: m.facts, hint: m.hint }, link: m.link });
      const headers: Record<string, string> = {};
      for (const line of String(cfg.headers ?? "").split(/\r?\n/)) {
        const i = line.indexOf(":");
        if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
      if (cfg.signingSecret) headers["x-fudo-signature"] = `sha256=${createHmac("sha256", String(cfg.signingSecret)).update(body).digest("hex")}`;
      return post(String(cfg.url), body, headers);
    }
  }
  throw new Error(`Unknown channel type "${type}"`);
}
