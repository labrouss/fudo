import type { FastifyPluginAsync } from "fastify";
import { partsOf } from "../lib/parts.js";
import type { MsgPart } from "@fudo/shared";
import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@fudo/db";
import { enqueueNotifications } from "@fudo/notify/server";
import { incidentTagsSchema, noteSchema, resolveSchema, snoozeSchema, type IncidentDetail, type IncidentDto } from "@fudo/shared";
import { z } from "zod";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { tenantScope, type TenantScope } from "../lib/tenant-scope.js";
import { assertOwned, iso, notFound, rows, textArray, type Row } from "./common.js";
import { incidentReportMarkdown, incidentReportPdf, reportLangFor } from "@fudo/reports";
import { userLocale } from "../lib/invites.js";
import { ownerOf } from "./teams.js";
import { getSetting, SETTING } from "../lib/settings.js";

const validTz = (tz: string) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };

const key = (n: number) => `INC-${String(n).padStart(4, "0")}`;

const LIST_SQL = (where: ReturnType<typeof sql>, limit = 200) => sql`
  SELECT i.*, t.name AS tenant_name, p.id AS p_id, p.number AS p_number, p.title AS p_title, p.title_parts AS p_title_parts, p.status AS p_status,
         ua.display_name AS ack_name, ur.display_name AS res_name,
         (SELECT count(*)::int FROM incidents c WHERE c.parent_id = i.id) AS child_count
    FROM incidents i
    LEFT JOIN tenants t ON t.id = i.tenant_id
    LEFT JOIN incidents p ON p.id = i.parent_id
    LEFT JOIN users ua ON ua.id = i.acknowledged_by
    LEFT JOIN users ur ON ur.id = i.resolved_by
   WHERE ${where}
   -- open ones by severity, then newest; resolved ones most recently resolved first (the limit keeps the newest)
   ORDER BY (i.status = 'resolved'), CASE WHEN i.status = 'resolved' THEN 0 WHEN i.severity = 'critical' THEN 0 WHEN i.severity = 'major' THEN 1 ELSE 2 END,
            coalesce(i.resolved_at, i.opened_at) DESC
   LIMIT ${limit}`;

function toDto(r: Row): IncidentDto {
  return {
    id: r.id as string, number: r.number as number, key: key(r.number as number), scope: r.tenant_id ? "tenant" : "global",
    tenantName: (r.tenant_name as string) ?? null, entityType: r.entity_type as IncidentDto["entityType"], entityId: r.entity_id as string,
    entityName: r.entity_name as string, title: r.title as string, titleParts: partsOf(r.title_parts), severity: r.severity as IncidentDto["severity"], status: r.status as IncidentDto["status"],
    entityStatus: r.entity_status as string, cause: (r.cause as IncidentDto["cause"]) ?? null,
    parent: r.p_id ? { id: r.p_id as string, key: key(r.p_number as number), title: r.p_title as string, titleParts: partsOf(r.p_title_parts), status: r.p_status as IncidentDto["status"] } : null,
    tags: (r.tags as string[]) ?? [], openedAt: iso(r.opened_at)!, acknowledgedAt: iso(r.acknowledged_at), acknowledgedBy: (r.ack_name as string) ?? null,
    snoozedUntil: iso(r.snoozed_until), resolvedAt: iso(r.resolved_at), resolvedBy: (r.res_name as string) ?? null, childCount: Number(r.child_count ?? 0),
  };
}

const listQuery = z.object({ status: z.enum(["active", "resolved", "all"]).default("active"), q: z.string().trim().max(100).optional() });

/** Acknowledges an open incident as a user (the button, and the acknowledge link in on-call messages). */
export async function acknowledgeIncident(tx: Tx, r: Row, userId: string | null, data: Record<string, unknown> | null) {
  await tx.execute(sql`UPDATE incidents SET status = 'acknowledged', acknowledged_at = now(), acknowledged_by = ${userId} WHERE id = ${r.id as string}`);
  await tx.execute(sql`INSERT INTO incident_events (incident_id, tenant_id, kind, note_type, user_id, body, data)
                       VALUES (${r.id as string}, ${(r.tenant_id as string) ?? null}::uuid, 'acknowledged', NULL, ${userId}, 'Acknowledged', ${data ? JSON.stringify(data) : null}::jsonb)`);
  await tx.execute(sql`SELECT pg_notify('fudo_live', json_build_object('t', ${(r.tenant_id as string) ?? null}::uuid, 'k', 'incident')::text)`);
}

export const incidentRoutes =
  ({ db, pool }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const own = (scope: TenantScope) => sql`i.tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid`;

    async function one(tx: Tx, id: string): Promise<Row> {
      const r = (await rows(tx, LIST_SQL(sql`i.id = ${id}`, 1)))[0];
      if (!r) throw notFound("Incident");
      return r;
    }

    app.get("/incidents", async (req) => {
      const scope = await tenantScope(req, db);
      const q = parse(listQuery, req.query);
      const status = q.status === "active" ? sql`i.status <> 'resolved'` : q.status === "resolved" ? sql`i.status = 'resolved'` : sql`true`;
      const text = q.q ? sql`(i.title ILIKE ${"%" + q.q + "%"} OR i.entity_name ILIKE ${"%" + q.q + "%"} OR ${q.q.toLowerCase()} = ANY(i.tags) OR i.number::text = ${q.q.replace(/\D/g, "") || "0"})` : sql`true`;
      const list = await withTenant(db, scope.scopeId, async (tx) => (await rows(tx, LIST_SQL(sql`${own(scope)} AND ${status} AND ${text}`))).map(toDto));
      // root incidents in the global scope: count impacted incidents in every tenant for global readers
      if (scope.isGlobal && scope.globalRead && list.length) {
        const counts = await withTenant(db, "all", (tx) => rows(tx, sql`SELECT parent_id, count(*)::int AS n FROM incidents WHERE parent_id IN (${sql.join(list.map((i) => sql`${i.id}::uuid`), sql`, `)}) GROUP BY 1`));
        const by = new Map(counts.map((c) => [c.parent_id as string, Number(c.n)]));
        for (const i of list) i.childCount = by.get(i.id) ?? 0;
      }
      return list;
    });

    /** An incident with its timeline, linked incidents, similar past ones and deliveries. */
    const detail = (scope: TenantScope, id: string): Promise<IncidentDetail> =>
      withTenant(db, scope.scopeId, async (tx) => {
        const r = await one(tx, id);
        const inc = toDto(r);
        const events = await rows(tx, sql`
          SELECT e.id, e.ts, e.kind, e.note_type, e.body, e.data, coalesce(u.display_name, 'API token "' || (e.data->>'apiToken') || '"') AS display_name FROM incident_events e LEFT JOIN users u ON u.id = e.user_id
           WHERE e.incident_id = ${inc.id} ORDER BY e.ts, e.id`);
        // children in other tenants are visible to global readers only
        const childRows = await (scope.globalRead ? withTenant(db, "all", (t) => rows(t, sql`SELECT c.id, c.number, c.title, c.title_parts, c.status, t.name AS tenant_name FROM incidents c LEFT JOIN tenants t ON t.id = c.tenant_id WHERE c.parent_id = ${inc.id} ORDER BY c.opened_at`)) : rows(tx, sql`SELECT c.id, c.number, c.title, c.title_parts, c.status, t.name AS tenant_name FROM incidents c LEFT JOIN tenants t ON t.id = c.tenant_id WHERE c.parent_id = ${inc.id} ORDER BY c.opened_at`));
        const text = [inc.title, inc.entityName, inc.cause?.name ?? ""].join(" ");
        const causeId = inc.cause?.id ?? null;
        const similar = await rows(tx, sql`
          WITH s AS (
            SELECT s.id, s.number, s.title, s.title_parts, s.opened_at, s.resolved_at,
                   (s.entity_type = ${inc.entityType} AND s.entity_id = ${inc.entityId}) AS same_entity,
                   (${causeId}::text IS NOT NULL AND (s.cause->>'id' = ${causeId}::text OR s.entity_id::text = ${causeId}::text)) AS same_cause,
                   (SELECT count(*) FROM unnest(s.tags) tg WHERE tg = ANY(${textArray(inc.tags)}))::int AS shared_tags,
                   coalesce((SELECT max(ts_rank(to_tsvector('simple', e.body || ' ' || s.title), plainto_tsquery('simple', ${text})))
                               FROM incident_events e WHERE e.incident_id = s.id AND e.kind IN ('note','opened')), 0) AS text_rank
              FROM incidents s WHERE s.status = 'resolved' AND s.id <> ${inc.id})
          SELECT s.*, (CASE WHEN same_entity THEN 5 ELSE 0 END + CASE WHEN same_cause THEN 3 ELSE 0 END + shared_tags + text_rank * 10) AS score,
                 (SELECT body FROM incident_events WHERE incident_id = s.id AND kind = 'note' AND note_type = 'resolution' ORDER BY ts DESC LIMIT 1) AS resolution,
                 (SELECT coalesce(json_agg(body ORDER BY ts), '[]') FROM incident_events WHERE incident_id = s.id AND kind = 'note' AND note_type = 'action') AS actions
            FROM s WHERE same_entity OR same_cause OR shared_tags > 0 OR text_rank > 0.05
           ORDER BY score DESC, resolved_at DESC LIMIT 5`);
        const deliveries = await rows(tx, sql`
          SELECT d.*, ch.name AS channel_name, ch.type FROM notification_deliveries d JOIN notification_channels ch ON ch.id = d.channel_id
           WHERE d.incident_id = ${inc.id} ORDER BY d.created_at DESC LIMIT 50`);
        const table = inc.entityType === "asset" ? "assets" : inc.entityType === "application" ? "applications" : "monitors";
        const col = inc.entityType === "monitor" ? "effective_status" : "status";
        const now = (await rows(tx, sql`SELECT ${sql.raw(col)} AS s FROM ${sql.raw(table)} WHERE id = ${inc.entityId}`))[0];
        return {
          ...inc,
          events: events.map((e) => ({ id: Number(e.id), ts: iso(e.ts)!, kind: e.kind as string, noteType: (e.note_type as IncidentDetail["events"][0]["noteType"]) ?? null, body: e.body as string, bodyParts: partsOf((e.data as { bodyParts?: unknown } | null)?.bodyParts), userName: (e.display_name as string) ?? null })),
          children: childRows.map((c) => ({ id: c.id as string, key: key(c.number as number), title: c.title as string, titleParts: partsOf(c.title_parts), status: c.status as IncidentDto["status"], tenantName: (c.tenant_name as string) ?? null })),
          hiddenChildren: Math.max(0, inc.childCount - childRows.length),
          similar: similar.map((s) => ({
            id: s.id as string, key: key(s.number as number), title: s.title as string, titleParts: partsOf(s.title_parts), resolvedAt: iso(s.resolved_at)!,
            durationMin: Math.round((new Date(s.resolved_at as string).getTime() - new Date(s.opened_at as string).getTime()) / 60000),
            reasons: [s.same_entity && "same item", s.same_cause && "same root cause", Number(s.shared_tags) > 0 && `${s.shared_tags} shared tag(s)`, Number(s.text_rank) > 0.05 && "similar description"].filter(Boolean) as string[],
            reasonParts: [s.same_entity && ["similar.sameItem"], s.same_cause && ["similar.sameCause"], Number(s.shared_tags) > 0 && ["similar.sharedTags", { n: Number(s.shared_tags) }], Number(s.text_rank) > 0.05 && ["similar.text"]].filter(Boolean) as MsgPart[],
            resolution: (s.resolution as string) ?? null, actions: (s.actions as string[]) ?? [],
          })),
          deliveries: deliveries.map((d) => ({ id: Number(d.id), channelName: d.channel_name as string, type: d.type as string, event: d.event as string, status: d.status as "sent", detail: d.detail as string, attempts: d.attempts as number, createdAt: iso(d.created_at)!, sentAt: iso(d.sent_at) })),
          entityNow: (now?.s as string) ?? null,
          owner: await ownerOf(tx, r.entity_type as string, r.entity_id as string),
          pages: (await rows(tx, sql`SELECT p.id, p.reason, p.started_at, p.done_at, u.display_name AS name,
              coalesce((SELECT json_agg(json_build_object('channel', s.channel, 'at', s.sent_at, 'ok', s.ok) ORDER BY s.sent_at) FROM oncall_sends s WHERE s.page_id = p.id), '[]') AS sent
              FROM oncall_pages p JOIN users u ON u.id = p.user_id WHERE p.incident_id = ${r.id as string}::uuid ORDER BY p.started_at`))
            .map((p) => ({ name: p.name as string, reason: p.reason as "oncall", startedAt: new Date(p.started_at as string).toISOString(), sent: p.sent as Array<{ channel: string; at: string; ok: boolean }>, done: !!p.done_at })),
        };
      });

    app.get<{ Params: { id: string } }>("/incidents/:id", async (req): Promise<IncidentDetail> => detail(await tenantScope(req, db), req.params.id));

    /** Post-incident report as PDF or Markdown, in the reader's language and time zone. */
    app.get<{ Params: { id: string }; Querystring: { format?: string; tz?: string } }>("/incidents/:id/report", async (req, reply) => {
      const scope = await tenantScope(req, db);
      const d = await detail(scope, req.params.id);
      const tz = req.query.tz && validTz(req.query.tz) ? req.query.tz : "UTC";
      const L = await reportLangFor(pool, scope.userId ? await userLocale(db, scope.userId) : null);
      const input = { incident: d, organization: (await getSetting<string>(db, SETTING.orgName)) ?? "Fudo", timezone: tz };
      const name = `fudo-${d.key}-post-incident-report`;
      if (req.query.format === "md") {
        return reply.header("content-type", "text/markdown; charset=utf-8").header("content-disposition", `attachment; filename="${name}.md"`).send(incidentReportMarkdown(input, L));
      }
      return reply.header("content-type", "application/pdf").header("content-disposition", `attachment; filename="${name}.pdf"`).send(await incidentReportPdf(input, L));
    });

    /** Loads an incident the caller may act on (own scope only) and runs fn in the same transaction. */
    async function mutate<T>(scope: TenantScope, id: string, fn: (tx: Tx, r: Row) => Promise<T>): Promise<T> {
      return withTenant(db, scope.scopeId, async (tx) => {
        const r = await one(tx, id);
        assertOwned(r, scope.tenantId, "This incident");
        const out = await fn(tx, r);
        await tx.execute(sql`SELECT pg_notify('fudo_live', json_build_object('t', ${scope.tenantId}::uuid, 'k', 'incident')::text)`);
        return out;
      });
    }
    const event = (tx: Tx, r: Row, scope: TenantScope, kind: string, body: string, noteType: string | null = null) =>
      tx.execute(sql`INSERT INTO incident_events (incident_id, tenant_id, kind, note_type, user_id, body, data)
                     VALUES (${r.id as string}, ${(r.tenant_id as string) ?? null}::uuid, ${kind}, ${noteType}, ${scope.userId}, ${body}, ${scope.tokenName ? JSON.stringify({ apiToken: scope.tokenName }) : null}::jsonb)`);

    app.post<{ Params: { id: string } }>("/incidents/:id/ack", async (req) => {
      const scope = await tenantScope(req, db, "operate");
      await mutate(scope, req.params.id, async (tx, r) => {
        if (r.status !== "open") throw new HttpError(409, "conflict", r.status === "resolved" ? "This incident is already resolved" : "Already acknowledged");
        await acknowledgeIncident(tx, r, scope.userId, scope.tokenName ? { apiToken: scope.tokenName } : null);
      });
      await enqueueNotifications(pool, req.params.id, "acknowledged");
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "incident.acknowledged", entityType: "incident", entityId: req.params.id });
      return { ok: true };
    });

    app.post<{ Params: { id: string } }>("/incidents/:id/snooze", async (req) => {
      const scope = await tenantScope(req, db, "operate");
      const { minutes } = parse(snoozeSchema, req.body);
      await mutate(scope, req.params.id, async (tx, r) => {
        if (r.status === "resolved") throw new HttpError(409, "conflict", "This incident is already resolved");
        await tx.execute(sql`UPDATE incidents SET snoozed_until = now() + make_interval(mins => ${minutes}) WHERE id = ${req.params.id}`);
        await event(tx, r, scope, "snoozed", `Notifications snoozed for ${minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`}`);
      });
      return { ok: true };
    });

    app.post<{ Params: { id: string } }>("/incidents/:id/resolve", async (req) => {
      const scope = await tenantScope(req, db, "operate");
      const { note } = parse(resolveSchema, req.body);
      await mutate(scope, req.params.id, async (tx, r) => {
        if (r.status === "resolved") throw new HttpError(409, "conflict", "This incident is already resolved");
        const table = r.entity_type === "asset" ? "assets" : r.entity_type === "application" ? "applications" : "monitors";
        const col = r.entity_type === "monitor" ? "effective_status" : "status";
        const now = (await rows(tx, sql`SELECT ${sql.raw(col)} AS s FROM ${sql.raw(table)} WHERE id = ${r.entity_id as string}`))[0]?.s as string | undefined;
        if (now === "DOWN" || now === "IMPACTED") {
          const item = r.entity_name as string;
          throw new HttpError(409, "still_failing", `${item} is still failing. The incident resolves automatically when it recovers; acknowledge it to stop reminders.`);
        }
        if (note) await event(tx, r, scope, "note", note, "resolution");
        await tx.execute(sql`UPDATE incidents SET status = 'resolved', resolved_at = now(), resolved_by = ${scope.userId} WHERE id = ${req.params.id}`);
        await event(tx, r, scope, "resolved", "Resolved manually");
      });
      await enqueueNotifications(pool, req.params.id, "resolved");
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "incident.resolved", entityType: "incident", entityId: req.params.id });
      return { ok: true };
    });

    /** Notes: comment, action taken, or resolution. Resolution notes feed "similar incidents" and alerts. */
    app.post<{ Params: { id: string } }>("/incidents/:id/notes", async (req, reply) => {
      const scope = await tenantScope(req, db, "operate");
      const input = parse(noteSchema, req.body);
      await mutate(scope, req.params.id, async (tx, r) => {
        await event(tx, r, scope, "note", input.body, input.type);
        if (input.tags.length) {
          await tx.execute(sql`UPDATE incidents SET tags = (SELECT array_agg(DISTINCT x) FROM unnest(tags || ${textArray(input.tags)}) x) WHERE id = ${req.params.id}`);
        }
      });
      reply.code(201);
      return { ok: true };
    });

    app.put<{ Params: { id: string } }>("/incidents/:id/tags", async (req) => {
      const scope = await tenantScope(req, db, "operate");
      const { tags } = parse(incidentTagsSchema, req.body);
      await mutate(scope, req.params.id, (tx) => tx.execute(sql`UPDATE incidents SET tags = ${textArray([...new Set(tags)])} WHERE id = ${req.params.id}`));
      return { ok: true };
    });
  };
