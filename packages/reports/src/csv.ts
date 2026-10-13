import type { ReportData } from "./data.js";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// UTF-8 BOM so Excel opens Greek and other non-Latin text correctly
const toCsv = (rows: unknown[][]) => "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export function availabilityCsv(d: ReportData): string {
  return toCsv([
    ["type", "name", "criticality", "sla_target_pct", "availability_pct", "business_hours_pct", "downtime_min", "planned_min", "incidents", "target_met", "period_from", "period_to"],
    ...d.items.map((i) => [i.type, i.name, i.criticality, i.target, i.availability, i.businessHours, i.downMin, i.plannedMin, i.incidents, i.met === null ? "" : i.met ? "yes" : "no", d.from, d.to]),
  ]);
}

export function incidentsCsv(d: ReportData): string {
  return toCsv([
    ["incident", "title", "severity", "affected", "opened_at", "acknowledged_at", "resolved_at", "duration_min", "time_to_acknowledge_min", "root_cause", "resolution"],
    ...d.incidents.map((i) => [i.key, i.title, i.severity, i.entity, i.openedAt, i.acknowledgedAt, i.resolvedAt, i.durationMin, i.ackMin, i.cause, i.resolution]),
  ]);
}
