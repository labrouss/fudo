import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@fudo/db";
import { zonedTime } from "@fudo/engine";
import { availabilityCsv, emailReport, reportFileBase, gatherReport, incidentsCsv, last30LabelIn, nextRun, previousPeriodIn, rangeLabelIn, reportLangFor, reportPdf } from "@fudo/reports";
import { userLocale } from "../lib/invites.js";
import { reportQuerySchema, reportScheduleSchema, type ReportScheduleDto } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { tenantScope } from "../lib/tenant-scope.js";
import { assertOwned, iso, notFound, rows, textArray, type Row } from "./common.js";

const DAY = 86_400_000;

export const reportRoutes =
  ({ db, pool, env }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    /** On-demand report as JSON (preview), PDF or CSV. */
    app.get("/reports/download", async (req, reply) => {
      const scope = await tenantScope(req, db);
      const q = parse(reportQuerySchema, req.query);
      // downloads are written in the requester's language (else the organisation default)
      const L = await reportLangFor(pool, scope.userId ? await userLocale(db, scope.userId) : null);
      let from: number, to: number, label: string;
      if (q.preset === "last-week" || q.preset === "last-month") ({ from, to, label } = previousPeriodIn(q.preset === "last-week" ? "weekly" : "monthly", q.tz, L));
      else if (q.preset === "custom") {
        if (!q.from || !q.to) throw new HttpError(400, "validation_failed", "Choose a start and end date", { from: "Required", to: "Required" });
        const [fy, fm, fd] = q.from.split("-").map(Number) as [number, number, number];
        const [ty, tm, td] = q.to.split("-").map(Number) as [number, number, number];
        from = zonedTime(fy, fm, fd, 0, 0, q.tz);
        to = zonedTime(ty, tm, td + 1, 0, 0, q.tz); // end date inclusive
        if (to <= from) throw new HttpError(400, "validation_failed", "The end date must not be before the start", { to: "Before the start" });
        if (to - from > 400 * DAY) throw new HttpError(400, "validation_failed", "At most 400 days", { to: "Too long" });
        label = rangeLabelIn(from, to, q.tz, L);
      } else {
        to = Date.now(); from = to - 30 * DAY; label = last30LabelIn(to, q.tz, L);
      }
      const data = await gatherReport(pool, {
        tenantId: scope.tenantId, from, to, label, timezone: q.tz,
        businessHours: q.bh === "1" ? { days: q.bhDays.split(",").map(Number), start: q.bhStart, end: q.bhEnd } : null,
      });
      const name = reportFileBase(data);
      if (q.format === "json") return data;
      if (q.format === "pdf") return reply.header("content-type", "application/pdf").header("content-disposition", `attachment; filename="${name}.pdf"`).send(await reportPdf(data, L));
      const csv = q.format === "csv-availability" ? availabilityCsv(data) : incidentsCsv(data);
      return reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="${name}-${q.format.slice(4)}.csv"`).send(csv);
    });

    const toDto = (r: Row): ReportScheduleDto => ({
      id: r.id as string, scope: r.tenant_id ? "tenant" : "global", name: r.name as string, period: r.period as "weekly", sendHour: r.send_hour as number,
      timezone: r.timezone as string, recipients: r.recipients as string[], formats: r.formats as Array<"pdf">, locale: (r.locale as string | null) ?? null, businessHours: (r.business_hours as ReportScheduleDto["businessHours"]) ?? null,
      enabled: r.enabled as boolean, nextRunAt: iso(r.next_run_at)!, lastRunAt: iso(r.last_run_at),
      lastRun: r.run_status ? { status: r.run_status as "sent", detail: r.run_detail as string, at: iso(r.run_at)! } : null,
    });
    const LIST = (where: ReturnType<typeof sql>) => sql`
      SELECT s.*, r.status AS run_status, r.detail AS run_detail, r.created_at AS run_at FROM report_schedules s
      LEFT JOIN LATERAL (SELECT status, detail, created_at FROM report_runs WHERE schedule_id = s.id ORDER BY id DESC LIMIT 1) r ON true
      WHERE ${where} ORDER BY s.name`;
    const one = async (tx: Tx, id: string) => { const r = (await rows(tx, LIST(sql`s.id = ${id}`)))[0]; if (!r) throw notFound("Report schedule"); return r; };

    app.get("/report-schedules", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      return withTenant(db, scope.scopeId, async (tx) => (await rows(tx, LIST(sql`s.tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid`))).map(toDto));
    });

    const save = async (req: FastifyRequest, id: string | null) => {
      const scope = await tenantScope(req, db, "manage");
      const i = parse(reportScheduleSchema, req.body);
      const next = new Date(nextRun(i.period, i.sendHour, i.timezone)).toISOString();
      const bh = i.businessHours ? JSON.stringify(i.businessHours) : null;
      const sid = await withTenant(db, scope.scopeId, async (tx) => {
        if (id) {
          assertOwned(await one(tx, id), scope.tenantId, "This report schedule");
          await tx.execute(sql`UPDATE report_schedules SET name = ${i.name}, period = ${i.period}, send_hour = ${i.sendHour}, timezone = ${i.timezone}, recipients = ${textArray(i.recipients)},
                                 formats = ${textArray(i.formats)}, business_hours = ${bh}::jsonb, enabled = ${i.enabled}, locale = ${i.locale ?? null}, next_run_at = ${next}::timestamptz WHERE id = ${id}`);
          return id;
        }
        return (await rows(tx, sql`INSERT INTO report_schedules (tenant_id, name, period, send_hour, timezone, recipients, formats, business_hours, enabled, next_run_at, created_by, locale)
          VALUES (${scope.tenantId}::uuid, ${i.name}, ${i.period}, ${i.sendHour}, ${i.timezone}, ${textArray(i.recipients)}, ${textArray(i.formats)}, ${bh}::jsonb, ${i.enabled}, ${next}::timestamptz, ${scope.userId}, ${i.locale ?? null}) RETURNING id`))[0]!.id as string;
      });
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: id ? "report.schedule_updated" : "report.schedule_created", entityType: "report_schedule", entityId: sid, diff: { name: i.name, period: i.period, recipients: i.recipients.length } });
      return sid;
    };
    app.post("/report-schedules", async (req, reply) => { const id = await save(req, null); reply.code(201); return { id }; });
    app.put<{ Params: { id: string } }>("/report-schedules/:id", async (req) => { await save(req, req.params.id); return { ok: true }; });
    app.delete<{ Params: { id: string } }>("/report-schedules/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      await withTenant(db, scope.scopeId, async (tx) => { assertOwned(await one(tx, req.params.id), scope.tenantId, "This report schedule"); await tx.execute(sql`DELETE FROM report_schedules WHERE id = ${req.params.id}`); });
      return { ok: true };
    });

    /** Sends the report for the last complete period right away (also a test of the schedule). */
    app.post<{ Params: { id: string } }>("/report-schedules/:id/send", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req) => {
      const scope = await tenantScope(req, db, "manage");
      const s = await withTenant(db, scope.scopeId, (tx) => one(tx, req.params.id));
      assertOwned(s, scope.tenantId, "This report schedule");
      const L = await reportLangFor(pool, (s.locale as string | null) ?? null);
      const range = previousPeriodIn(s.period as "weekly", s.timezone as string, L);
      try {
        const r = await emailReport(pool, env.APP_SECRET, { tenantId: scope.tenantId, ...range, timezone: s.timezone as string, businessHours: (s.business_hours as never) ?? null, recipients: s.recipients as string[], formats: s.formats as string[], lang: L });
        await withTenant(db, scope.scopeId, (tx) => tx.execute(sql`INSERT INTO report_runs (schedule_id, tenant_id, period_from, period_to, status, detail) VALUES (${s.id as string}, ${scope.tenantId}::uuid, ${new Date(range.from).toISOString()}, ${new Date(range.to).toISOString()}, 'sent', ${`Sent manually: ${r.detail}`})`));
        return { ok: true, detail: r.detail, label: range.label };
      } catch (err) {
        const msg = (err as Error).message;
        await withTenant(db, scope.scopeId, (tx) => tx.execute(sql`INSERT INTO report_runs (schedule_id, tenant_id, period_from, period_to, status, detail) VALUES (${s.id as string}, ${scope.tenantId}::uuid, ${new Date(range.from).toISOString()}, ${new Date(range.to).toISOString()}, 'failed', ${msg.slice(0, 500)})`));
        throw new HttpError(502, "send_failed", msg);
      }
    });
  };
