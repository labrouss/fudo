import type pg from "pg";
import { availability, availabilityWithin, businessWindows, type BusinessHours } from "@fudo/engine";

export interface ReportItem {
  type: "application" | "asset";
  name: string;
  criticality: string | null;
  target: number | null;
  availability: number | null;
  businessHours: number | null;
  downMin: number;
  plannedMin: number;
  incidents: number;
  met: boolean | null;
}
export interface ReportIncident {
  key: string; title: string; titleParts?: import("@fudo/shared").MsgPart[] | null; severity: string; entity: string; openedAt: string; acknowledgedAt: string | null;
  resolvedAt: string | null; durationMin: number; ackMin: number | null; cause: string | null; resolution: string | null;
}
export interface ReportData {
  org: string;
  scopeName: string;
  isGlobal: boolean;
  from: string;
  to: string;
  label: string;
  timezone: string;
  businessHours: Omit<BusinessHours, "tz"> | null;
  generatedAt: string;
  summary: { items: number; onTarget: number; missed: number; availability: number | null; opened: number; resolved: number; mttaMin: number | null; mttrMin: number | null; downMin: number };
  items: ReportItem[];
  incidents: ReportIncident[];
  topCauses: Array<{ name: string; incidents: number; downMin: number }>;
}

const key = (n: number) => `INC-${String(n).padStart(4, "0")}`;
const r3 = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);

/**
 * Collects everything a report shows for one scope and period. Runs in all-tenants mode and
 * filters by tenant explicitly (the caller has already checked access).
 */
export async function gatherReport(pool: pg.Pool, opts: { tenantId: string | null; from: number; to: number; label: string; timezone: string; businessHours: Omit<BusinessHours, "tz"> | null }): Promise<ReportData> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('fudo.all_tenants', 'on', true)");
    const from = new Date(opts.from).toISOString(), to = new Date(opts.to).toISOString();
    const org = (await c.query("SELECT value FROM settings WHERE key = 'org.name'")).rows[0]?.value ?? "Fudo";
    const scopeName = opts.tenantId ? (await c.query("SELECT name FROM tenants WHERE id = $1", [opts.tenantId])).rows[0]?.name ?? "Tenant" : "Global infrastructure";
    const isGlobal = opts.tenantId === null;
    const ents = (isGlobal
      ? await c.query("SELECT id, name, NULL AS criticality, NULL AS sla_target, status, created_at FROM assets WHERE tenant_id IS NULL ORDER BY name")
      : await c.query("SELECT id, name, criticality, sla_target, status, created_at FROM applications WHERE tenant_id = $1 ORDER BY name", [opts.tenantId])).rows;
    const type = isGlobal ? "asset" : "application";
    const ids = ents.map((e) => e.id);
    const changes = ids.length ? (await c.query(
      `SELECT entity_id, ts, to_status, coalesce((cause->>'planned')::boolean, false) AS planned FROM state_changes
        WHERE entity_type = $1 AND entity_id = ANY($2::uuid[]) AND ts < $3 AND ts >= $4 ORDER BY ts`, [type, ids, to, from])).rows : [];
    const before = ids.length ? (await c.query(
      `SELECT DISTINCT ON (entity_id) entity_id, to_status, coalesce((cause->>'planned')::boolean, false) AS planned FROM state_changes
        WHERE entity_type = $1 AND entity_id = ANY($2::uuid[]) AND ts < $3 ORDER BY entity_id, ts DESC`, [type, ids, from])).rows : [];
    const counts = ids.length ? (await c.query(
      `SELECT entity_id, count(*)::int AS n FROM incidents WHERE entity_id = ANY($1::uuid[]) AND opened_at >= $2 AND opened_at < $3 GROUP BY 1`, [ids, from, to])).rows : [];
    const windows = opts.businessHours ? businessWindows(opts.from, opts.to, { ...opts.businessHours, tz: opts.timezone }) : null;

    const items: ReportItem[] = ents.map((e) => {
      const own = changes.filter((x) => x.entity_id === e.id).map((x) => ({ ts: new Date(x.ts).getTime(), to: x.to_status, planned: x.planned }));
      const prev = before.find((b) => b.entity_id === e.id);
      const initial = prev ? { status: prev.to_status, planned: prev.planned } : new Date(e.created_at).getTime() > opts.from || own.length ? { status: "UNKNOWN" } : { status: e.status };
      const all = availability(initial, own, opts.from, opts.to).totals;
      const bh = windows ? availabilityWithin(initial, own, opts.from, opts.to, windows) : null;
      const target = e.sla_target === null ? null : Number(e.sla_target);
      return {
        type, name: e.name, criticality: e.criticality, target, availability: r3(all.pct), businessHours: bh ? r3(bh.pct) : null,
        downMin: Math.round(all.down / 60000), plannedMin: Math.round(all.planned / 60000),
        incidents: counts.find((x) => x.entity_id === e.id)?.n ?? 0,
        met: target === null || all.pct === null ? null : all.pct >= target,
      };
    });

    const scopeCond = isGlobal ? "i.tenant_id IS NULL" : "i.tenant_id = $3";
    const params = isGlobal ? [from, to] : [from, to, opts.tenantId];
    const incs = (await c.query(
      `SELECT i.*, (SELECT body FROM incident_events e WHERE e.incident_id = i.id AND e.kind = 'note' AND e.note_type = 'resolution' ORDER BY ts DESC LIMIT 1) AS resolution
         FROM incidents i WHERE ${scopeCond} AND i.opened_at < $2 AND (i.resolved_at IS NULL OR i.resolved_at >= $1) ORDER BY i.opened_at`, params)).rows;
    const clip = (i: Record<string, any>) => Math.max(0, Math.min(i.resolved_at ? new Date(i.resolved_at).getTime() : opts.to, opts.to) - Math.max(new Date(i.opened_at).getTime(), opts.from));
    const incidents: ReportIncident[] = incs.map((i) => ({
      key: key(i.number), title: i.title, titleParts: i.title_parts ?? null, severity: i.severity, entity: i.entity_name,
      openedAt: new Date(i.opened_at).toISOString(), acknowledgedAt: i.acknowledged_at ? new Date(i.acknowledged_at).toISOString() : null,
      resolvedAt: i.resolved_at ? new Date(i.resolved_at).toISOString() : null,
      durationMin: Math.round(((i.resolved_at ? new Date(i.resolved_at).getTime() : Date.now()) - new Date(i.opened_at).getTime()) / 60000),
      ackMin: i.acknowledged_at ? Math.round((new Date(i.acknowledged_at).getTime() - new Date(i.opened_at).getTime()) / 60000) : null,
      cause: i.cause?.name ?? null, resolution: i.resolution ?? null,
    }));
    const inRange = (t: string | null) => t !== null && new Date(t).getTime() >= opts.from && new Date(t).getTime() < opts.to;
    const opened = incidents.filter((i) => inRange(i.openedAt));
    const resolved = incidents.filter((i) => inRange(i.resolvedAt));
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    const causes = new Map<string, { incidents: number; down: number }>();
    for (const i of incs) {
      const name = i.cause?.name ?? i.entity_name;
      const cur = causes.get(name) ?? { incidents: 0, down: 0 };
      cur.incidents++; cur.down += clip(i);
      causes.set(name, cur);
    }
    const withPct = items.filter((i) => i.availability !== null);
    await c.query("COMMIT");
    return {
      org, scopeName, isGlobal, from, to, label: opts.label, timezone: opts.timezone, businessHours: opts.businessHours, generatedAt: new Date().toISOString(),
      summary: {
        items: items.length, onTarget: items.filter((i) => i.met === true).length, missed: items.filter((i) => i.met === false).length,
        availability: withPct.length ? r3(withPct.reduce((a, i) => a + i.availability!, 0) / withPct.length) : null,
        opened: opened.length, resolved: resolved.length,
        mttaMin: avg(opened.filter((i) => i.ackMin !== null).map((i) => i.ackMin!)), mttrMin: avg(resolved.map((i) => i.durationMin)),
        downMin: items.reduce((a, i) => a + i.downMin, 0),
      },
      items, incidents,
      topCauses: [...causes.entries()].map(([name, v]) => ({ name, incidents: v.incidents, downMin: Math.round(v.down / 60000) })).sort((a, b) => b.downMin - a.downMin || b.incidents - a.incidents).slice(0, 10),
    };
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}
