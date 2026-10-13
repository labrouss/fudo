import type pg from "pg";
import type { Logger } from "pino";
import { planIncidents, type Candidate, type IncidentAction } from "@fudo/engine";
import { enqueueNotifications } from "@fudo/notify/server";

/**
 * Keeps incidents in sync with entity statuses (runs after every evaluation), links impacted
 * incidents to their root incident, and queues notifications for what changed.
 */
export class IncidentManager {
  constructor(private pool: pg.Pool, private log: Logger) {}

  async reconcile(): Promise<void> {
    const c = await this.pool.connect();
    const notify: Array<{ id: string; event: "opened" | "reopened" | "resolved" }> = [];
    try {
      await c.query("BEGIN");
      // one query at a time on this connection (pg does not run overlapping queries on one client)
      const apps = await c.query("SELECT id, tenant_id, name, status, cause, criticality FROM applications");
      const assets = await c.query("SELECT id, tenant_id, name, status, cause FROM assets");
      // standalone monitors only: others are covered by their asset's or application's incident
      const mons = await c.query(`SELECT m.id, m.tenant_id, m.name, m.effective_status AS status, m.cause FROM monitors m
                  WHERE m.asset_id IS NULL AND NOT m.paused AND NOT EXISTS (SELECT 1 FROM application_members am WHERE am.monitor_id = m.id)`);
      const open = await c.query("SELECT id, entity_type, entity_id, entity_status, cause->>'id' AS cause_id, title FROM incidents WHERE status <> 'resolved'");
      const recent = await c.query("SELECT id, entity_type, entity_id, resolved_at FROM incidents WHERE status = 'resolved' AND resolved_at > now() - interval '10 minutes'");
      const cand = (type: Candidate["type"]) => (r: Record<string, unknown>): Candidate => ({
        type, id: r.id as string, tenantId: (r.tenant_id as string) ?? null, name: r.name as string, status: r.status as string,
        cause: (r.cause as Candidate["cause"]) ?? null, criticality: r.criticality as string | undefined,
      });
      const actions = planIncidents(
        [...apps.rows.map(cand("application")), ...assets.rows.map(cand("asset")), ...mons.rows.map(cand("monitor"))],
        open.rows.map((o) => ({ id: o.id, entityType: o.entity_type, entityId: o.entity_id, entityStatus: o.entity_status, causeId: o.cause_id, title: o.title })),
        recent.rows.map((r) => ({ id: r.id, entityType: r.entity_type, entityId: r.entity_id, resolvedAt: new Date(r.resolved_at) })),
      );
      for (const a of actions) await this.apply(c, a, notify);

      // Link impacted incidents to the open incident of their root cause.
      const linked = await c.query(
        `UPDATE incidents ch SET parent_id = p.id FROM incidents p
          WHERE ch.status <> 'resolved' AND p.status <> 'resolved' AND ch.cause IS NOT NULL
            AND p.entity_id::text = ch.cause->>'id' AND p.id <> ch.id AND ch.parent_id IS DISTINCT FROM p.id
          RETURNING ch.id, ch.tenant_id, p.number`);
      for (const l of linked.rows) {
        await c.query("INSERT INTO incident_events (incident_id, tenant_id, kind, body, data) VALUES ($1, $2, 'linked', $3, $4)",
          [l.id, l.tenant_id, `Caused by INC-${String(l.number).padStart(4, "0")}`, JSON.stringify({ parentNumber: l.number })]);
      }
      const touched = new Set<string | null>([...actions.map((a) => ("c" in a ? a.c.tenantId : undefined)).filter((t) => t !== undefined), ...linked.rows.map((l) => l.tenant_id ?? null)] as Array<string | null>);
      if (actions.some((a) => a.kind === "resolve")) touched.add(null); // tenant unknown for resolves: global event reaches everyone
      for (const t of touched) await c.query("SELECT pg_notify('fudo_live', json_build_object('t', $1::uuid, 'k', 'incident')::text)", [t]);
      await c.query("COMMIT");
      if (actions.length) this.log.info({ actions: actions.map((a) => a.kind) }, "incidents reconciled");
    } catch (err) {
      await c.query("ROLLBACK").catch(() => {});
      this.log.error({ err }, "incident reconciliation failed");
      return;
    } finally {
      c.release();
    }
    for (const n of notify) await enqueueNotifications(this.pool, n.id, n.event).catch((err) => this.log.error({ err }, "enqueue failed"));
  }

  private async apply(c: pg.PoolClient, a: IncidentAction, notify: Array<{ id: string; event: "opened" | "reopened" | "resolved" }>) {
    const ev = (id: string, tenant: string | null, kind: string, body: string, data?: unknown) =>
      c.query("INSERT INTO incident_events (incident_id, tenant_id, kind, body, data) VALUES ($1, $2, $3, $4, $5)", [id, tenant, kind, body, data ? JSON.stringify(data) : null]);
    switch (a.kind) {
      case "open": {
        const r = await c.query(
          `INSERT INTO incidents (tenant_id, entity_type, entity_id, entity_name, title, severity, entity_status, cause, title_parts)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [a.c.tenantId, a.c.type, a.c.id, a.c.name, a.title, a.severity, a.c.status, a.c.cause ? JSON.stringify(a.c.cause) : null, JSON.stringify(a.titleParts)]);
        const id = r.rows[0].id as string;
        await ev(id, a.c.tenantId, "opened", a.title, { status: a.c.status, cause: a.c.cause, bodyParts: a.titleParts });
        notify.push({ id, event: "opened" });
        break;
      }
      case "reopen": {
        await c.query(
          `UPDATE incidents SET status = 'open', resolved_at = NULL, resolved_by = NULL, acknowledged_at = NULL, acknowledged_by = NULL,
                  snoozed_until = NULL, title = $2, entity_status = $3, cause = $4, title_parts = $5 WHERE id = $1`,
          [a.incidentId, a.title, a.c.status, a.c.cause ? JSON.stringify(a.c.cause) : null, JSON.stringify(a.titleParts)]);
        await ev(a.incidentId, a.c.tenantId, "reopened", `Failed again within minutes of recovering: ${a.title}`, { bodyParts: [["incident.reopened"], ...a.titleParts] });
        notify.push({ id: a.incidentId, event: "reopened" });
        break;
      }
      case "update": {
        await c.query("UPDATE incidents SET title = $2, entity_status = $3, cause = $4, title_parts = $5 WHERE id = $1",
          [a.incidentId, a.title, a.c.status, a.c.cause ? JSON.stringify(a.c.cause) : null, JSON.stringify(a.titleParts)]);
        await ev(a.incidentId, a.c.tenantId, "status", a.title, { from: a.from, to: a.c.status, cause: a.c.cause, bodyParts: a.titleParts });
        break;
      }
      case "resolve": {
        const r = await c.query("UPDATE incidents SET status = 'resolved', resolved_at = now() WHERE id = $1 AND status <> 'resolved' RETURNING tenant_id", [a.incidentId]);
        if (r.rowCount) {
          await ev(a.incidentId, r.rows[0].tenant_id, "resolved", a.reason, { bodyParts: a.reasonParts });
          notify.push({ id: a.incidentId, event: "resolved" });
        }
        break;
      }
    }
  }
}
