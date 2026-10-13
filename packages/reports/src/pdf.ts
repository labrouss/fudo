import type { ReportData } from "./data.js";
import { REPORT_EN, type ReportLang } from "./lang.js";
import { C, createPdf } from "./layout.js";

export { visualOrder } from "./layout.js";

export function reportPdf(d: ReportData, L: ReportLang = REPORT_EN): Promise<Buffer> {
  const P = createPdf(L, L.t("report.docTitle", { scope: d.scopeName, label: d.label }));
  const { doc, t, rtl, W, X, num, fmtPct, fmtMin, text, heading, table } = P;
  P.header(t(d.isGlobal ? "report.title.infrastructure" : "report.title.availability", { scope: d.scopeName }), `${d.org} · ${d.label} · ${d.timezone}`);

    // KPI boxes (mirrored in right-to-left)
    const s = d.summary;
    const kpis: Array<{ label: string; value: string; sub?: string; bad?: boolean }> = [
      { label: t("report.kpi.availability"), value: fmtPct(s.availability), sub: t(d.isGlobal ? "report.kpi.avgAssets" : "report.kpi.avgApps") },
      ...(d.isGlobal ? [] : [{ label: t("report.kpi.slaOnTarget"), value: `${s.onTarget}/${s.onTarget + s.missed}`, sub: s.missed ? t("report.kpi.missed", { n: s.missed }) : t("report.kpi.allMet"), bad: s.missed > 0 }]),
      { label: t("report.kpi.incidents"), value: String(s.opened), sub: t("report.kpi.resolved", { n: s.resolved }) },
      { label: t("report.kpi.mtta"), value: fmtMin(s.mttaMin), sub: t("report.kpi.mttaSub") },
      { label: t("report.kpi.mttr"), value: fmtMin(s.mttrMin), sub: t("report.kpi.mttrSub") },
    ];
    const kw = (W - (kpis.length - 1) * 8) / kpis.length, ky = doc.y;
    kpis.forEach((k, i) => {
      const x = X + (rtl ? kpis.length - 1 - i : i) * (kw + 8);
      doc.roundedRect(x, ky, kw, 58, 6).fillAndStroke(C.soft, C.line);
      doc.fill(C.muted).font("r").fontSize(8); text(k.label.toLocaleUpperCase(L.code), x + 8, ky + 8, { width: kw - 16 });
      doc.fill(k.bad ? C.down : C.ink).font("b").fontSize(16); text(k.value, x + 8, ky + 20, { width: kw - 16 });
      if (k.sub) { doc.fill(C.muted).font("r").fontSize(7.5); text(k.sub, x + 8, ky + 42, { width: kw - 16 }); }
    });
    doc.y = ky + 72;
    doc.fill(C.muted).font("r").fontSize(8.5);
    if (d.businessHours) {
      const wd = new Intl.DateTimeFormat(L.dateLocale, { weekday: "short", timeZone: "UTC" });
      const dayName = (n: number) => wd.format(new Date(Date.UTC(2024, 0, n))); // 1 Jan 2024 was a Monday
      const bd = d.businessHours.days;
      const days = bd.length === 5 && bd.join() === "1,2,3,4,5" ? `${dayName(1)}–${dayName(5)}` : bd.map(dayName).join(", ");
      text(t("report.businessHours", { days, start: d.businessHours.start, end: d.businessHours.end, tz: d.timezone }), X, doc.y, { width: W });
    } else {
      text(t("report.noBusinessHours"), X, doc.y, { width: W });
    }
    doc.moveDown(0.8);

    heading(t(d.isGlobal ? "report.h.infrastructure" : "report.h.applications"));
    const MET = t("report.met"), MISSED = t("report.missed");
    const metColor = (row: string[]) => (row[row.length - 1] === MISSED ? C.down : row[row.length - 1] === MET ? C.up : undefined);
    table(
      [
        { title: t(d.isGlobal ? "report.col.asset" : "report.col.application"), width: 22 },
        ...(d.isGlobal ? [] : [{ title: t("report.col.criticality"), width: 12 }, { title: t("report.col.target"), width: 8, align: "end" as const }]),
        { title: t("report.col.allHours"), width: 9, align: "end" }, ...(d.businessHours ? [{ title: t("report.col.businessHours"), width: 10, align: "end" as const }] : []),
        { title: t("report.col.down"), width: 9, align: "end" }, { title: t("report.col.planned"), width: 9, align: "end" }, { title: t("report.col.inc"), width: 7, align: "end" },
        ...(d.isGlobal ? [] : [{ title: t("report.col.sla"), width: 13, color: metColor }]),
      ],
      d.items.map((i) => [
        i.name, ...(d.isGlobal ? [] : [i.criticality ? t(`report.crit.${i.criticality}`) : "", i.target === null ? "" : `${num(i.target, i.target % 1 ? 1 : 0)}%`]),
        fmtPct(i.availability), ...(d.businessHours ? [fmtPct(i.businessHours)] : []),
        i.downMin ? fmtMin(i.downMin) : "0", i.plannedMin ? fmtMin(i.plannedMin) : "0", String(i.incidents),
        ...(d.isGlobal ? [] : [i.met === null ? "" : i.met ? MET : MISSED]),
      ]),
    );

    heading(t("report.h.incidents"));
    // operations reports use the 24-hour clock in every language
    const when = new Intl.DateTimeFormat(L.dateLocale, { timeZone: d.timezone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    table(
      [{ title: t("report.col.incident"), width: 11 }, { title: t("report.col.title"), width: 23 }, { title: t("report.col.severity"), width: 9 }, { title: t("report.col.started"), width: 12 },
        { title: t("report.col.duration"), width: 9, align: "end" }, { title: t("report.col.ackAfter"), width: 9, align: "end" }, { title: t("report.col.causeFix"), width: 27 }],
      d.incidents.map((i) => [
        i.key, L.render(i.titleParts, i.title), t(`severity.${i.severity}`), when.format(new Date(i.openedAt)),
        i.resolvedAt ? fmtMin(i.durationMin) : t("report.open"), i.ackMin === null ? "" : fmtMin(i.ackMin),
        [i.cause && t("report.cause", { cause: i.cause }), i.resolution && t("report.fix", { fix: i.resolution })].filter(Boolean).join("\n"),
      ]),
    );

    if (d.topCauses.length) {
      heading(t("report.h.causes"));
      table([{ title: t("report.col.cause"), width: 60 }, { title: t("report.col.incidents"), width: 20, align: "end" }, { title: t("report.col.timeDown"), width: 20, align: "end" }],
        d.topCauses.map((c) => [c.name, String(c.incidents), fmtMin(c.downMin)]));
    }

    const generated = new Intl.DateTimeFormat(L.dateLocale, { timeZone: d.timezone, dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(new Date(d.generatedAt));
    return P.finish(generated);
}
