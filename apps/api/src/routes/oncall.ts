/**
 * A team's on-call: the rotation, escalation steps, overrides, who is on call now and the coming
 * shifts. The worker pages people from this (apps/worker/src/oncall.ts).
 */
import type { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@fudo/db";
import { onCallAt, oncallOverrideSchema, oncallScheduleSchema, upcomingShifts, type OncallDto, type OncallOverride, type OncallSchedule } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { tenantScope } from "../lib/tenant-scope.js";
import { assertOwned, iso, notFound, rows, type Row } from "./common.js";

const toSchedule = (r: Row): OncallSchedule => ({ participants: r.participants as string[], shiftDays: r.shift_days as number, handoverTime: r.handover_time as string, timezone: r.timezone as string, startDate: new Date(r.start_date as string).toISOString().slice(0, 10) });
const toOverrides = (rs: Row[]): OncallOverride[] => rs.map((o) => ({ id: o.id as string, userId: o.user_id as string, startsAt: new Date(o.starts_at as string), endsAt: new Date(o.ends_at as string), createdAt: new Date(o.created_at as string) }));

/** Who is on call in a team right now (for team cards). */
export async function onCallNow(tx: Tx, teamId: string): Promise<{ userId: string; name: string; until: string } | null> {
  const s = (await rows(tx, sql`SELECT * FROM oncall_schedules WHERE team_id = ${teamId}::uuid AND enabled`))[0];
  if (!s) return null;
  const o = toOverrides(await rows(tx, sql`SELECT * FROM oncall_overrides WHERE team_id = ${teamId}::uuid AND ends_at > now()`));
  const now = onCallAt(toSchedule(s), o, new Date());
  if (!now) return null;
  const u = (await rows(tx, sql`SELECT display_name FROM users WHERE id = ${now.userId}::uuid`))[0];
  return u ? { userId: now.userId, name: u.display_name as string, until: now.end.toISOString() } : null;
}

export const oncallRoutes =
  ({ db }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    async function team(tx: Tx, id: string) {
      const t = (await rows(tx, sql`SELECT * FROM teams WHERE id = ${id}::uuid`))[0];
      if (!t) throw notFound("Team");
      return t;
    }
    const memberRows = (tx: Tx, id: string) => rows(tx, sql`
      SELECT m.user_id, m.role, u.display_name AS name,
             (jsonb_array_length(u.notification_steps) > 0) AS reachable
        FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ${id}::uuid ORDER BY u.display_name`);

    app.get<{ Params: { id: string } }>("/teams/:id/oncall", async (req): Promise<OncallDto> => {
      const scope = await tenantScope(req, db);
      return withTenant(db, scope.scopeId, async (tx) => {
        await team(tx, req.params.id);
        const members = await memberRows(tx, req.params.id);
        const name = new Map(members.map((m) => [m.user_id as string, m.name as string]));
        const s = (await rows(tx, sql`SELECT * FROM oncall_schedules WHERE team_id = ${req.params.id}::uuid`))[0];
        const ov = await rows(tx, sql`SELECT * FROM oncall_overrides WHERE team_id = ${req.params.id}::uuid AND ends_at > now() ORDER BY starts_at`);
        const schedule = s ? toSchedule(s) : null;
        const now = schedule && s!.enabled ? onCallAt(schedule, toOverrides(ov), new Date()) : null;
        return {
          schedule: s ? { enabled: s.enabled as boolean, ...schedule!, minSeverity: s.min_severity as "minor", steps: s.steps as OncallDto["schedule"] extends infer X ? X extends { steps: infer S } ? S : never : never } : null,
          now: now ? { userId: now.userId, name: name.get(now.userId) ?? "?", until: now.end.toISOString(), source: now.source } : null,
          upcoming: schedule ? upcomingShifts(schedule, new Date(), 8).map((x) => ({ userId: x.userId, name: name.get(x.userId) ?? "?", start: x.start.toISOString(), end: x.end.toISOString() })) : [],
          overrides: ov.map((o) => ({ id: o.id as string, userId: o.user_id as string, name: name.get(o.user_id as string) ?? "?", startsAt: iso(o.starts_at)!, endsAt: iso(o.ends_at)! })),
          members: members.map((m) => ({ userId: m.user_id as string, name: m.name as string, role: m.role as "lead", reachable: m.reachable as boolean })),
        };
      });
    });

    app.put<{ Params: { id: string } }>("/teams/:id/oncall", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      const input = parse(oncallScheduleSchema, req.body);
      await withTenant(db, scope.scopeId, async (tx) => {
        const t = await team(tx, req.params.id);
        assertOwned(t, scope.tenantId, "This team");
        const members = new Set((await memberRows(tx, req.params.id)).map((m) => m.user_id as string));
        if (input.participants.some((p) => !members.has(p))) throw new HttpError(400, "validation_failed", "Only team members can be in the rotation");
        const participants = sql`ARRAY[${sql.join(input.participants.map((p) => sql`${p}::uuid`), sql`, `)}]::uuid[]`;
        const parts = input.participants.length ? participants : sql`'{}'::uuid[]`;
        await tx.execute(sql`
          INSERT INTO oncall_schedules (team_id, tenant_id, enabled, participants, shift_days, handover_time, timezone, start_date, min_severity, steps, updated_at)
          VALUES (${req.params.id}::uuid, ${scope.tenantId}::uuid, ${input.enabled}, ${parts}, ${input.shiftDays}, ${input.handoverTime}, ${input.timezone}, ${input.startDate}::date, ${input.minSeverity}, ${JSON.stringify(input.steps)}::jsonb, now())
          ON CONFLICT (team_id) DO UPDATE SET enabled = EXCLUDED.enabled, participants = EXCLUDED.participants, shift_days = EXCLUDED.shift_days, handover_time = EXCLUDED.handover_time,
            timezone = EXCLUDED.timezone, start_date = EXCLUDED.start_date, min_severity = EXCLUDED.min_severity, steps = EXCLUDED.steps, updated_at = now()`);
      });
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "oncall.schedule_saved", entityType: "team", entityId: req.params.id, diff: { enabled: input.enabled, participants: input.participants.length, shiftDays: input.shiftDays, steps: input.steps } });
      return { ok: true };
    });

    app.post<{ Params: { id: string } }>("/teams/:id/oncall/overrides", async (req, reply) => {
      const scope = await tenantScope(req, db, "manage");
      const input = parse(oncallOverrideSchema, req.body);
      const id = await withTenant(db, scope.scopeId, async (tx) => {
        const t = await team(tx, req.params.id);
        assertOwned(t, scope.tenantId, "This team");
        if (!(await memberRows(tx, req.params.id)).some((m) => m.user_id === input.userId)) throw new HttpError(400, "validation_failed", "Only team members can cover a shift");
        return (await rows(tx, sql`INSERT INTO oncall_overrides (team_id, tenant_id, user_id, starts_at, ends_at, created_by)
          VALUES (${req.params.id}::uuid, ${scope.tenantId}::uuid, ${input.userId}::uuid, ${input.startsAt.toISOString()}::timestamptz, ${input.endsAt.toISOString()}::timestamptz, ${scope.userId}) RETURNING id`))[0]!.id as string;
      });
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "oncall.override_added", entityType: "team", entityId: req.params.id, diff: { userId: input.userId, startsAt: input.startsAt, endsAt: input.endsAt } });
      reply.code(201);
      return { id };
    });
    app.delete<{ Params: { id: string; oid: string } }>("/teams/:id/oncall/overrides/:oid", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      await withTenant(db, scope.scopeId, async (tx) => {
        const t = await team(tx, req.params.id);
        assertOwned(t, scope.tenantId, "This team");
        await tx.execute(sql`DELETE FROM oncall_overrides WHERE id = ${req.params.oid}::uuid AND team_id = ${req.params.id}::uuid`);
      });
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "oncall.override_removed", entityType: "team", entityId: req.params.id });
      return { ok: true };
    });
  };
