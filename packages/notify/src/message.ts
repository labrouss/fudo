/** Pure message building, shared by every channel type (and unit-tested). */
import { formatMessage, renderMessage, type MsgPart } from "@fudo/shared";
import { NOTIFY_TEXTS } from "./texts.js";

export type NotifyEvent = "opened" | "reopened" | "acknowledged" | "resolved" | "reminder" | "escalated" | "test";

export interface MessageContext {
  event: NotifyEvent;
  incident: {
    number: number;
    title: string;
    /** translatable title (0.15+); `title` is the stored English */
    titleParts?: MsgPart[] | null;
    severity: string;
    status: string;
    entityType: string;
    entityName: string;
    entityStatus: string;
    tenantName: string | null;
    openedAt: string;
    resolvedAt: string | null;
    cause: { name: string; planned?: boolean } | null;
    parentNumber: number | null;
    acknowledgedBy: string | null;
  };
  /** the most recent resolution of a similar incident, if any */
  similar: { number: number; resolvedAt: string; resolution: string } | null;
  link: string | null;
  orgName: string | null;
}

export interface Message {
  subject: string;
  headline: string;
  color: "attention" | "warning" | "good" | "accent";
  /** `key` identifies a fact independently of its translated title (e.g. "cause" for senders that pick facts) */
  facts: Array<{ key?: string; title: string; value: string }>;
  hint: string | null;
  link: string | null;
  text: string;
  /** "Open in Fudo" and the footer, in the message's language */
  openLabel: string;
  footer: string;
}

/** A language for building messages: the channel's, or English. */
export interface MessageLang {
  code: string;
  t: (key: string, params?: Record<string, unknown>) => string;
  render: (parts: MsgPart[] | null | undefined, fallback: string) => string;
  /** date and time in UTC, written the language's way */
  dateTime: (iso: string) => string;
  date: (iso: string) => string;
}

const EN_SEVERITY: Record<string, string> = { critical: "Critical", major: "Major", minor: "Minor" };
const EN_UNITS: Record<string, string> = { "unit.min": "{n} min", "unit.h": "{n} h", "unit.d": "{n} d" };

/** A message language from a key lookup; unknown keys fall back to the built-in English texts. */
export function langFor(code: string, lookup: (key: string) => string | undefined, numberLocale = code): MessageLang {
  const t = (key: string, params?: Record<string, unknown>) =>
    formatMessage(lookup(key) ?? NOTIFY_TEXTS[key] ?? EN_UNITS[key] ?? (key.startsWith("severity.") ? EN_SEVERITY[key.slice(9)] : undefined) ?? key, params, code, numberLocale);
  const fmt = (iso: string, withTime: boolean) => {
    try {
      return new Intl.DateTimeFormat(numberLocale, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(new Date(iso)) + (withTime ? " UTC" : "");
    } catch { return iso.slice(0, withTime ? 16 : 10).replace("T", " ") + (withTime ? " UTC" : ""); }
  };
  return {
    code, t,
    render: (parts, fallback) => (parts?.length ? renderMessage(parts, (c) => lookup(`msg.${c}`), code, numberLocale) : fallback),
    dateTime: (iso) => fmt(iso, true),
    date: (iso) => fmt(iso, false),
  };
}
/** Built-in English (used by tests and when no language files are available). */
export const ENGLISH: MessageLang = langFor("en", () => undefined);

export const incNo = (n: number) => `INC-${String(n).padStart(4, "0")}`;

function duration(L: MessageLang, fromIso: string, toIso: string | null): string {
  const s = Math.max(0, Math.round(((toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime()) / 1000));
  if (s < 90) return L.t("notify.seconds", { n: s });
  if (s < 5400) return L.t("unit.min", { n: Math.round(s / 60) });
  if (s < 172800) return L.t("unit.h", { n: Math.round(s / 360) / 10 });
  return L.t("unit.d", { n: Math.round(s / 86400) });
}

export function buildMessage(ctx: MessageContext, L: MessageLang = ENGLISH): Message {
  const i = ctx.incident;
  const openLabel = L.t("notify.openButton"), footer = L.t("notify.footer");
  if (ctx.event === "test") {
    return {
      subject: L.t("notify.test.subject"), headline: L.t("notify.test.headline"), color: "accent",
      facts: [{ title: L.t("notify.fact.org"), value: ctx.orgName ?? "Fudo" }], hint: L.t("notify.test.hint"), link: ctx.link,
      text: L.t("notify.test.text"), openLabel, footer,
    };
  }
  const title = L.render(i.titleParts, i.title);
  const verb = L.t(`notify.verb.${ctx.event}`);
  const severity = L.t(`severity.${i.severity}`);
  const tag = `${incNo(i.number)} ${severity.toLocaleUpperCase(L.code)}`;
  const subject = L.t("notify.subject", { verb, title, tag });
  const facts: Message["facts"] = [
    { title: L.t("notify.fact.incident"), value: `${incNo(i.number)} · ${severity}` },
    { title: L.t(i.entityType === "application" ? "notify.fact.application" : i.entityType === "asset" ? "notify.fact.asset" : "notify.fact.monitor"),
      value: L.t(i.entityStatus === "IMPACTED" ? "notify.entity.impacted" : "notify.entity.down", { name: i.entityName }) },
  ];
  if (i.tenantName) facts.push({ title: L.t("notify.fact.tenant"), value: i.tenantName });
  if (i.cause) {
    const cause = i.cause.planned ? L.t("notify.cause.planned", { name: i.cause.name }) : i.cause.name;
    facts.push({ key: "cause", title: L.t("notify.fact.cause"), value: `${cause}${i.parentNumber ? ` · ${incNo(i.parentNumber)}` : ""}` });
  }
  facts.push({ title: L.t("notify.fact.started"), value: L.dateTime(i.openedAt) });
  facts.push({ title: L.t(ctx.event === "resolved" ? "notify.fact.duration" : "notify.fact.openFor"), value: duration(L, i.openedAt, i.resolvedAt) });
  if (ctx.event === "acknowledged" && i.acknowledgedBy) facts.push({ title: L.t("notify.fact.ackBy"), value: i.acknowledgedBy });

  const hint = ctx.similar && ctx.event !== "resolved"
    ? L.t("notify.hint", { incident: incNo(ctx.similar.number), date: L.date(ctx.similar.resolvedAt), resolution: ctx.similar.resolution.slice(0, 400) })
    : null;
  const color = ctx.event === "resolved" ? "good" : ctx.event === "acknowledged" ? "accent" : i.severity === "minor" ? "warning" : "attention";
  const headline = L.t("notify.headline", { verb, title });
  const text = [headline, "", ...facts.map((f) => `${f.title}: ${f.value}`), ...(hint ? ["", hint] : []), ...(ctx.link ? ["", L.t("notify.open", { link: ctx.link })] : [])].join("\n");
  return { subject, headline, color, facts, hint, link: ctx.link, text, openLabel, footer };
}
