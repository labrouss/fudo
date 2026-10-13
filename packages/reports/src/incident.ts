/**
 * Post-incident reports (PDF and Markdown) from an incident's details: summary, impact, timeline,
 * resolution and actions, notifications and similar past incidents, in the reader's language.
 */
import type { IncidentDetail } from "@fudo/shared";
import type { ReportLang } from "./lang.js";
import { C, createPdf } from "./layout.js";

export interface IncidentReportInput { incident: IncidentDetail; organization: string; timezone: string; generatedAt?: Date }

/** Everything both formats show, already as text in the report language. */
function contents(x: IncidentReportInput, L: ReportLang) {
  const d = x.incident, t = L.t;
  const tz = x.timezone;
  const when = (iso: string | null) => iso ? new Intl.DateTimeFormat(L.dateLocale, { timeZone: tz, dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(new Date(iso)) : "—";
  const mins = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
  const fmtMin = (m: number) => m < 120 ? t("unit.min", { n: m }) : m < 2880 ? t("unit.h", { n: Math.round(m / 6) / 10 }) : t("unit.d", { n: Math.round(m / 144) / 10 });
  const status = (s: string) => s === "resolved" ? t("incidents.resolved") : s === "acknowledged" ? t("incidents.kind.acknowledged") : t("incidents.open");
  const item = t(d.entityType === "application" ? "notify.fact.application" : d.entityType === "asset" ? "notify.fact.asset" : "notify.fact.monitor");
  const title = L.render(d.titleParts, d.title);
  const facts: Array<[string, string]> = [
    [t("pm.f.incident"), `${d.key} · ${title}`],
    [t("pm.f.status"), status(d.status)],
    [t("pm.f.severity"), t(`severity.${d.severity}`)],
    [t("pm.f.item"), `${item}: ${d.entityName}`],
    ...(d.owner ? [[t("pm.f.owner"), d.owner.team + (d.owner.leads.length ? ` · ${t("teams.lead_names", { names: d.owner.leads.join(", ") })}` : "")] as [string, string]] : []),
    ...(d.tenantName ? [[t("pm.f.tenant"), d.tenantName] as [string, string]] : []),
    ...(d.cause ? [[t("pm.f.cause"), d.cause.name] as [string, string]] : []),
    ...(d.parent ? [[t("pm.f.causedBy"), `${d.parent.key} · ${L.render(d.parent.titleParts, d.parent.title)}`] as [string, string]] : []),
    [t("pm.f.opened"), when(d.openedAt)],
    [t("pm.f.acknowledged"), d.acknowledgedAt ? t("pm.ack_detail", { time: when(d.acknowledgedAt), who: d.acknowledgedBy ?? "—", after: fmtMin(mins(d.openedAt, d.acknowledgedAt)) }) : t("pm.not_acknowledged")],
    [t("pm.f.resolved"), d.resolvedAt ? t("pm.resolved_by", { time: when(d.resolvedAt), who: d.resolvedBy ?? "Fudo" }) : t("pm.still_open")],
    [t("pm.f.duration"), d.resolvedAt ? fmtMin(mins(d.openedAt, d.resolvedAt)) : `${fmtMin(mins(d.openedAt, new Date().toISOString()))} (${t("pm.still_open")})`],
    ...(d.tags.length ? [[t("pm.f.tags"), d.tags.join(", ")] as [string, string]] : []),
  ];
  const label = (e: IncidentDetail["events"][0]) => e.kind === "note" ? t(`incidents.note.${e.noteType ?? "comment"}`) : t(`incidents.kind.${e.kind}`);
  const timeline = d.events.map((e) => [when(e.ts), label(e), e.userName ?? "", L.render(e.bodyParts, e.body)]);
  const lessons = d.events.filter((e) => e.kind === "note" && (e.noteType === "resolution" || e.noteType === "action"))
    .map((e) => ({ label: label(e), meta: `${when(e.ts)}${e.userName ? ` · ${e.userName}` : ""}`, body: e.body }));
  const impact = d.children.map((c) => [c.key, L.render(c.titleParts, c.title), c.tenantName ?? "", status(c.status)]);
  const count = (s: string) => d.deliveries.filter((x) => x.status === s).length;
  const notifications = d.deliveries.length ? t("pm.notifications_summary", { sent: count("sent"), failed: count("failed"), suppressed: count("suppressed") }) : null;
  const channels = [...new Set(d.deliveries.filter((x) => x.status === "sent").map((x) => x.channelName))];
  const similar = d.similar.slice(0, 3).map((s) => [s.key, L.render(s.titleParts, s.title), when(s.resolvedAt), s.resolution ?? ""]);
  return { t, title, facts, timeline, lessons, impact, hidden: d.hiddenChildren, notifications, channels, similar, generated: when((x.generatedAt ?? new Date()).toISOString()) };
}

export function incidentReportPdf(x: IncidentReportInput, L: ReportLang): Promise<Buffer> {
  const c = contents(x, L), t = c.t;
  const P = createPdf(L, t("pm.docTitle", { key: x.incident.key }));
  const { doc, W, X, text, heading, table } = P;
  P.header(t("pm.title", { key: x.incident.key }), `${x.organization} · ${c.title}`);

  heading(t("pm.h.summary"));
  table([{ title: "", width: 28 }, { title: "", width: 72 }], c.facts);

  heading(t("pm.h.impact"));
  if (c.impact.length) table([{ title: t("pm.col.incident"), width: 14 }, { title: t("pm.col.title"), width: 50 }, { title: t("pm.col.tenant"), width: 20 }, { title: t("pm.f.status"), width: 16 }], c.impact);
  else { doc.fill(C.muted).font("r").fontSize(9); text(t("pm.no_impact"), X, doc.y, { width: W }); doc.moveDown(1); }
  if (c.hidden) { doc.fill(C.muted).font("r").fontSize(8.5); text(t("pm.hidden_children", { n: c.hidden }), X, doc.y, { width: W }); doc.moveDown(1); }

  heading(t("pm.h.lessons"));
  if (!c.lessons.length) { doc.fill(C.muted).font("r").fontSize(9); text(t("pm.no_lessons"), X, doc.y, { width: W }); doc.moveDown(1); }
  for (const n of c.lessons) {
    doc.fill(C.ink).font("b").fontSize(9.5); text(n.label, X, doc.y, { width: W });
    doc.fill(C.muted).font("r").fontSize(8); text(n.meta, X, doc.y, { width: W });
    doc.fill(C.ink).font("r").fontSize(9.5); text(n.body, X, doc.y + 2, { width: W });
    doc.moveDown(0.8);
  }

  heading(t("pm.h.timeline"));
  table([{ title: t("pm.col.time"), width: 17 }, { title: t("pm.col.event"), width: 15 }, { title: t("pm.col.by"), width: 15 }, { title: t("pm.col.details"), width: 53 }], c.timeline);

  if (c.notifications) {
    heading(t("pm.h.notifications"));
    doc.fill(C.ink).font("r").fontSize(9); text(c.notifications + (c.channels.length ? ` · ${c.channels.join(", ")}` : ""), X, doc.y, { width: W });
    doc.moveDown(1);
  }
  if (c.similar.length) {
    heading(t("pm.h.similar"));
    table([{ title: t("pm.col.incident"), width: 12 }, { title: t("pm.col.title"), width: 34 }, { title: t("pm.f.resolved"), width: 18 }, { title: t("pm.col.resolution"), width: 36 }], c.similar);
  }
  return P.finish(c.generated);
}

/** Markdown for wikis and tickets: same sections; table cells and text are escaped. */
export function incidentReportMarkdown(x: IncidentReportInput, L: ReportLang): string {
  const c = contents(x, L), t = c.t;
  const cell = (s: string) => (s || "—").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  const headCell = (s: string) => s.replace(/\|/g, "\\|");
  const tableMd = (head: string[], rows: string[][]) => [`| ${head.map(headCell).join(" | ")} |`, `|${head.map(() => " --- ").join("|")}|`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
  const out: string[] = [];
  out.push(`# ${t("pm.title", { key: x.incident.key })}`, "", `**${x.organization}** · ${c.title}`, "");
  out.push(`## ${t("pm.h.summary")}`, "", tableMd(["", ""], c.facts), "");
  out.push(`## ${t("pm.h.impact")}`, "");
  out.push(c.impact.length ? tableMd([t("pm.col.incident"), t("pm.col.title"), t("pm.col.tenant"), t("pm.f.status")], c.impact) : `_${t("pm.no_impact")}_`, "");
  if (c.hidden) out.push(`_${t("pm.hidden_children", { n: c.hidden })}_`, "");
  out.push(`## ${t("pm.h.lessons")}`, "");
  if (!c.lessons.length) out.push(`_${t("pm.no_lessons")}_`, "");
  for (const n of c.lessons) out.push(`**${n.label}** · ${n.meta}`, "", n.body.split(/\r?\n/).map((l) => `> ${l}`).join("\n"), "");
  out.push(`## ${t("pm.h.timeline")}`, "", tableMd([t("pm.col.time"), t("pm.col.event"), t("pm.col.by"), t("pm.col.details")], c.timeline), "");
  if (c.notifications) out.push(`## ${t("pm.h.notifications")}`, "", c.notifications + (c.channels.length ? ` · ${c.channels.join(", ")}` : ""), "");
  if (c.similar.length) out.push(`## ${t("pm.h.similar")}`, "", tableMd([t("pm.col.incident"), t("pm.col.title"), t("pm.f.resolved"), t("pm.col.resolution")], c.similar), "");
  out.push("---", `_${t("pm.md_generated", { date: c.generated })}_`, "");
  return out.join("\n");
}
