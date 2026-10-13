import { englishMessage, type MsgPart } from "@fudo/shared";
/**
 * Incident lifecycle planning (pure). Reconciles current entity statuses with open incidents:
 *  - applications open incidents when DOWN, or IMPACTED by an unplanned cause
 *  - assets open incidents when DOWN (they are roots by definition)
 *  - standalone monitors (not checking an asset, not an application member) open when DOWN
 * Impacted assets/monitors never open their own incident: the root's incident covers them.
 */
import type { Ref } from "./index.js";

export interface Candidate {
  type: "application" | "asset" | "monitor";
  id: string;
  tenantId: string | null;
  name: string;
  status: string;
  cause: Ref | null;
  criticality?: string;
}
export interface OpenIncident { id: string; entityType: string; entityId: string; entityStatus: string; causeId: string | null; title: string }
export interface RecentIncident { id: string; entityType: string; entityId: string; resolvedAt: Date }

export type IncidentAction =
  | { kind: "open"; c: Candidate; title: string; titleParts: MsgPart[]; severity: "minor" | "major" | "critical" }
  | { kind: "reopen"; incidentId: string; c: Candidate; title: string; titleParts: MsgPart[] }
  | { kind: "update"; incidentId: string; c: Candidate; title: string; titleParts: MsgPart[]; from: string }
  | { kind: "resolve"; incidentId: string; reason: string; reasonParts: MsgPart[] };

export const REOPEN_WINDOW_MS = 5 * 60_000;

export function isFailing(c: Candidate): boolean {
  if (c.type === "application") return c.status === "DOWN" || (c.status === "IMPACTED" && !c.cause?.planned);
  return c.status === "DOWN";
}

export function incidentTitleParts(c: Candidate): MsgPart[] {
  return [c.status === "IMPACTED" && c.cause ? ["incident.impacted", { name: c.name, cause: c.cause.name }] : ["incident.down", { name: c.name }]];
}
export const incidentTitle = (c: Candidate): string => englishMessage(incidentTitleParts(c));
const resolveAction = (incidentId: string, reasonParts: MsgPart[]): IncidentAction => ({ kind: "resolve", incidentId, reason: englishMessage(reasonParts), reasonParts });

export function severityFor(c: Candidate): "minor" | "major" | "critical" {
  if (c.type === "application") return c.criticality === "critical" ? "critical" : c.criticality === "high" ? "major" : "minor";
  return c.type === "asset" ? "major" : "minor";
}

export function planIncidents(cands: Candidate[], open: OpenIncident[], recent: RecentIncident[], now = new Date()): IncidentAction[] {
  const actions: IncidentAction[] = [];
  const k = (t: string, id: string) => `${t}:${id}`;
  const openBy = new Map(open.map((o) => [k(o.entityType, o.entityId), o]));
  const recentBy = new Map<string, RecentIncident>();
  for (const r of recent) {
    const cur = recentBy.get(k(r.entityType, r.entityId));
    if (!cur || r.resolvedAt > cur.resolvedAt) recentBy.set(k(r.entityType, r.entityId), r);
  }
  const seen = new Set<string>();
  for (const c of cands) {
    const key = k(c.type, c.id);
    seen.add(key);
    const inc = openBy.get(key);
    const failing = isFailing(c);
    if (failing && !inc) {
      const r = recentBy.get(key);
      if (r && now.getTime() - r.resolvedAt.getTime() < REOPEN_WINDOW_MS) actions.push({ kind: "reopen", incidentId: r.id, c, title: incidentTitle(c), titleParts: incidentTitleParts(c) });
      else actions.push({ kind: "open", c, title: incidentTitle(c), titleParts: incidentTitleParts(c), severity: severityFor(c) });
    } else if (failing && inc) {
      const title = incidentTitle(c);
      if (inc.entityStatus !== c.status || (inc.causeId ?? null) !== (c.cause?.id ?? null) || inc.title !== title) {
        actions.push({ kind: "update", incidentId: inc.id, c, title, titleParts: incidentTitleParts(c), from: inc.entityStatus });
      }
    } else if (!failing && inc) {
      actions.push(resolveAction(inc.id, c.status === "MAINTENANCE" || c.cause?.planned ? [["incident.plannedMaintenance"]] : [["incident.recovered", { status: `@state.${c.status}` }]]));
    }
  }
  for (const o of open) {
    if (!seen.has(k(o.entityType, o.entityId))) actions.push(resolveAction(o.id, [["incident.unmonitored"]]));
  }
  return actions;
}
