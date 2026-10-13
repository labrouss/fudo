import type pg from "pg";
import nodemailer from "nodemailer";
import { defaultLocale, loadSmtp } from "@fudo/notify/server";
import { smtpErrorMessage } from "@fudo/shared";
import { localDate } from "@fudo/engine";
import { gatherReport, type ReportData } from "./data.js";
import { reportPdf } from "./pdf.js";
import { reportLang, REPORT_EN, type ReportLang } from "./lang.js";
import { previousPeriod, rangeLabel, type Period } from "./period.js";
import { availabilityCsv, incidentsCsv } from "./csv.js";

export * from "./data.js";
export * from "./period.js";
export { reportPdf, visualOrder } from "./pdf.js";
export { incidentReportMarkdown, incidentReportPdf, type IncidentReportInput } from "./incident.js";
export { reportLang, REPORT_EN, type ReportLang } from "./lang.js";
export { REPORT_TEXTS } from "./texts.js";

/** The language of a report: the given locale, else the organisation's default. */
export async function reportLangFor(pool: pg.Pool, locale: string | null | undefined): Promise<ReportLang> {
  return reportLang(locale || (await defaultLocale(pool)));
}
/** The last complete week or month, labelled in the report's language. */
export const previousPeriodIn = (period: Period, tz: string, L: ReportLang, now = Date.now()) =>
  previousPeriod(period, tz, now, L.code, (n, range) => L.t("report.week", { n, range }));
/** Label of a custom range, or of the last 30 days, in the report's language. */
export const rangeLabelIn = (from: number, to: number, tz: string, L: ReportLang) => rangeLabel(from, to, tz, L.code);
export const last30LabelIn = (to: number, tz: string, L: ReportLang) => L.t("report.last30", { date: rangeLabel(to - 1, to, tz, L.code).split(" – ")[1] });
export { availabilityCsv, incidentsCsv } from "./csv.js";

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";

/** File name base, dated in the report's time zone (not UTC). */
export function reportFileBase(d: ReportData): string {
  const l = localDate(new Date(d.from).getTime(), d.timezone);
  return `fudo-${slug(d.scopeName)}-${l.y}-${String(l.m).padStart(2, "0")}-${String(l.d).padStart(2, "0")}`;
}

export async function reportFiles(d: ReportData, formats: string[], L: ReportLang = REPORT_EN) {
  const base = reportFileBase(d);
  const files: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  if (formats.includes("pdf")) files.push({ filename: `${base}.pdf`, content: await reportPdf(d, L), contentType: "application/pdf" });
  if (formats.includes("csv")) {
    files.push({ filename: `${base}-availability.csv`, content: Buffer.from(availabilityCsv(d)), contentType: "text/csv; charset=utf-8" });
    files.push({ filename: `${base}-incidents.csv`, content: Buffer.from(incidentsCsv(d)), contentType: "text/csv; charset=utf-8" });
  }
  return files;
}

function summaryText(d: ReportData, L: ReportLang): string {
  const s = d.summary, t = L.t;
  const pct = (v: number | null) => (v === null ? t("report.mail.noData") : `${new Intl.NumberFormat(L.numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(v)}%`);
  const lines = [
    t(d.isGlobal ? "report.mail.head.infrastructure" : "report.mail.head.availability", { scope: d.scopeName, label: d.label }),
    "",
    t("report.mail.availability", { value: pct(s.availability) }),
    ...(d.isGlobal ? [] : [t("report.mail.sla", { on: s.onTarget, total: s.onTarget + s.missed })]),
    t("report.mail.incidents", { opened: s.opened, resolved: s.resolved }),
    ...(s.missed ? ["", t("report.mail.below"), ...d.items.filter((i) => i.met === false).map((i) => `  - ${t("report.mail.belowItem", { name: i.name, value: pct(i.availability), target: i.target })}`)] : []),
    "",
    t("report.mail.attached"),
  ];
  return lines.join("\n");
}

/** Builds and emails a report through the SMTP server configured in Settings. */
export async function emailReport(pool: pg.Pool, appSecret: string, opts: Parameters<typeof gatherReport>[1] & { recipients: string[]; formats: string[]; lang?: ReportLang }): Promise<{ detail: string; data: ReportData }> {
  const smtp = await loadSmtp(pool, appSecret);
  if (!smtp) throw new Error("Email is not configured. Set up SMTP in Settings.");
  const data = await gatherReport(pool, opts);
  const L = opts.lang ?? REPORT_EN;
  const attachments = await reportFiles(data, opts.formats, L);
  const t = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, auth: smtp.username ? { user: smtp.username, pass: smtp.password } : undefined, connectionTimeout: 15_000, tls: { rejectUnauthorized: !smtp.allowUntrusted } });
  const info = await t.sendMail({ from: smtp.from, to: opts.recipients, subject: L.t("report.mail.subject", { scope: data.scopeName, label: data.label }), text: summaryText(data, L), attachments })
    .catch((err) => { throw new Error(smtpErrorMessage(err, smtp)); });
  return { detail: `sent to ${info.accepted.length} recipient(s), ${attachments.length} attachment(s)`, data };
}
