import { issueMessage } from "@fudo/shared";
import type { FastifyPluginAsync } from "fastify";
import { partsOf } from "../lib/parts.js";
import { sql } from "drizzle-orm";
import { schema, withTenant, type Tx } from "@fudo/db";
import { randomToken, type MonitorDetail, type MonitorDto, type TestResultDto } from "@fudo/shared";
import { monitorInputSchema, parseMonitorConfig, MONITOR_TYPE_IDS } from "@fudo/monitors/definitions";
import { listInterfaces, runCheck, SnmpError } from "@fudo/monitors/runner";
import { extraContext } from "@fudo/monitors/context";
import { maskConfig, mergeSecrets, openConfig, sealConfig } from "@fudo/monitors/secrets";
import { z } from "zod";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { notifyGraph, tenantScope } from "../lib/tenant-scope.js";
import { publicOrigin } from "../lib/origin.js";
import { credentialFor, ownSecretMissing, withCredential, withoutCredential, type OpenCredential } from "../lib/credentials.js";
import { textArray } from "./common.js";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const pct = (up: unknown, total: unknown) => (Number(total) > 0 ? Math.round((Number(up) / Number(total)) * 100000) / 1000 : null);

function toDto(r: Row): MonitorDto {
  return {
    id: r.id as string, tenantId: r.tenant_id as string, name: r.name as string, type: r.type as string,
    config: maskConfig(r.type as string, r.config as Record<string, unknown>), intervalS: r.interval_s as number, retryIntervalS: r.retry_interval_s as number,
    timeoutS: r.timeout_s as number, failuresBeforeDown: r.failures_before_down as number, successesBeforeUp: r.successes_before_up as number,
    paused: r.paused as boolean, tags: (r.tags as string[]) ?? [], description: r.description as string,
    status: r.status as MonitorDto["status"], failStreak: r.fail_streak as number,
    scope: r.tenant_id ? "tenant" : "global", assetId: (r.asset_id as string) ?? null, assetName: (r.asset_name as string) ?? null,
    applications: (r.apps as MonitorDto["applications"]) ?? [],
    credentialId: (r.credential_id as string) ?? null, credentialName: (r.credential_name as string) ?? null,
    effectiveStatus: (r.effective_status as MonitorDto["effectiveStatus"]) ?? "UNKNOWN",
    cause: (r.cause as MonitorDto["cause"]) ?? null, atRisk: (r.at_risk as MonitorDto["atRisk"]) ?? null,
    statusChangedAt: iso(r.status_changed_at), lastCheckAt: iso(r.last_check_at),
    lastLatencyMs: r.last_latency_ms === null ? null : Number(r.last_latency_ms), lastMessage: (r.last_message as string) ?? null, lastMessageParts: partsOf(r.last_message_parts),
    createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
    recent: ((r.recent as Array<{ s: string; t: string }>) ?? []).map((x) => ({ s: x.s as "UP", t: x.t })),
    uptime24h: pct(r.up24, r.total24),
  };
}

const LIST_SQL = (where: ReturnType<typeof sql>) => sql`
  SELECT m.*, a.name AS asset_name, cr.name AS credential_name, r.recent, u.up24, u.total24, ap.apps
    FROM monitors m
    LEFT JOIN assets a ON a.id = m.asset_id
    LEFT JOIN credentials cr ON cr.id = m.credential_id
    -- the applications it belongs to (only those this scope can see)
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', x.id, 'name', x.name, 'required', am.required) ORDER BY x.name) AS apps
        FROM application_members am JOIN applications x ON x.id = am.application_id WHERE am.monitor_id = m.id
    ) ap ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('s', CASE WHEN x.in_maintenance THEN 'MAINTENANCE' ELSE x.status END, 't', x.ts) ORDER BY x.ts) AS recent
        FROM (SELECT status, ts, in_maintenance FROM check_results c WHERE c.monitor_id = m.id ORDER BY ts DESC LIMIT 40) x
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE status <> 'DOWN') AS up24, count(*) AS total24
        FROM check_results c WHERE c.monitor_id = m.id AND c.ts > now() - interval '24 hours' AND NOT c.in_maintenance
    ) u ON true
   WHERE ${where}
   ORDER BY m.name`;

const testSchema = z.object({
  type: z.enum(MONITOR_TYPE_IDS),
  config: z.record(z.string(), z.unknown()),
  timeoutS: z.coerce.number().int().min(1).max(120).default(10),
  monitorId: z.string().uuid().optional(),
  credentialId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
});

/** Validates common fields + type config together so the form gets every error at once. */
function parseInput(body: unknown, stored: Record<string, unknown> | null = null, cred: OpenCredential | null = null, detaching = false) {
  const base = monitorInputSchema.safeParse(body ?? {});
  const b = (body ?? {}) as { type?: string; config?: unknown };
  const type = String(b.type ?? "");
  // saved secrets are sent back as a placeholder; keep the stored value for them
  const merged = mergeSecrets(type, (b.config ?? {}) as Record<string, unknown>, stored);
  // with a shared credential: validated as the check will run, stored without the credential's values
  const cfg = parseMonitorConfig(type, cred ? withCredential(type, merged, cred) : merged);
  const fields: Record<string, string> = {};
  if (!base.success) for (const i of base.error.issues) fields[i.path.join(".") || "_"] ??= issueMessage(i);
  if (!cfg.ok) Object.assign(fields, cfg.fields);
  if (cfg.ok && detaching) Object.assign(fields, ownSecretMissing(type, cfg.config) ?? {});
  if (!base.success || !cfg.ok || Object.keys(fields).length) throw new HttpError(400, "validation_failed", "Check the highlighted fields", fields);
  return { ...base.data, config: cred ? withoutCredential(type, cred, cfg.config) : cfg.config };
}

/** The asset a monitor checks must be visible in scope: the tenant's own or a global one (global scope: global only). */
async function assertAsset(tx: Tx, assetId: string | null | undefined, isGlobal: boolean) {
  if (!assetId) return;
  const r = (await tx.execute(sql`SELECT tenant_id FROM assets WHERE id = ${assetId}`)).rows[0] as Row | undefined;
  if (!r || (isGlobal && r.tenant_id)) throw new HttpError(400, "validation_failed", "Check the highlighted fields", { assetId: "Choose an asset from this scope" });
}

/** Global monitors are readable from tenants but only changeable in the global scope. */
function assertOwned(row: Row, tenantId: string | null) {
  if ((row.tenant_id ?? null) !== tenantId) throw new HttpError(403, "forbidden", "Shared infrastructure monitors are managed in the Global scope");
}

export const monitorRoutes =
  ({ db, env, pool }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    async function loadOne(tx: Tx, id: string): Promise<Row> {
      const rows = (await tx.execute(LIST_SQL(sql`m.id = ${id}`))).rows as Row[];
      if (!rows[0]) throw new HttpError(404, "not_found", "Monitor not found");
      return rows[0];
    }

    /** Monitors of the selected scope; ?include=global adds shared monitors (for pickers). */
    app.get<{ Querystring: { include?: string } }>("/monitors", async (req) => {
      const scope = await tenantScope(req, db);
      const own = sql`m.tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid`;
      const where = req.query.include === "global" && !scope.isGlobal ? sql`(${own} OR m.tenant_id IS NULL)` : own;
      return withTenant(db, scope.scopeId, async (tx) => ((await tx.execute(LIST_SQL(where))).rows as Row[]).map(toDto));
    });

    app.get<{ Params: { id: string } }>("/monitors/:id", async (req): Promise<MonitorDetail> => {
      const scope = await tenantScope(req, db);
      return withTenant(db, scope.scopeId, async (tx) => {
        const row = await loadOne(tx, req.params.id);
        const id = req.params.id;
        const up = (await tx.execute(sql`
          SELECT count(*) FILTER (WHERE status <> 'DOWN' AND ts > now() - interval '24 hours') AS u1,
                 count(*) FILTER (WHERE ts > now() - interval '24 hours') AS t1,
                 count(*) FILTER (WHERE status <> 'DOWN' AND ts > now() - interval '7 days') AS u7,
                 count(*) FILTER (WHERE ts > now() - interval '7 days') AS t7,
                 count(*) FILTER (WHERE status <> 'DOWN') AS u30, count(*) AS t30,
                 avg(latency_ms) FILTER (WHERE ts > now() - interval '24 hours') AS avg24
            FROM check_results WHERE monitor_id = ${id} AND ts > now() - interval '30 days' AND NOT in_maintenance`)).rows[0] as Row;
        const series = (await tx.execute(sql`
          SELECT date_bin('5 minutes', ts, TIMESTAMPTZ '2000-01-01') AS t, avg(latency_ms) AS avg, max(latency_ms) AS max,
                 count(*) FILTER (WHERE status = 'DOWN') AS down, count(*) AS total
            FROM check_results WHERE monitor_id = ${id} AND ts > now() - interval '24 hours'
           GROUP BY 1 ORDER BY 1`)).rows as Row[];
        const results = (await tx.execute(sql`
          SELECT ts, CASE WHEN in_maintenance THEN 'MAINTENANCE' ELSE status END AS status, latency_ms, message, message_parts FROM check_results WHERE monitor_id = ${id} ORDER BY ts DESC LIMIT 100`)).rows as Row[];
        const events = (await tx.execute(sql`
          SELECT ts, from_status, to_status, message, message_parts FROM state_changes
           WHERE entity_type = 'monitor' AND entity_id = ${id} ORDER BY ts DESC LIMIT 25`)).rows as Row[];
        const dto = toDto(row);
        return {
          ...dto,
          pushUrl: row.push_token ? `${publicOrigin(req, env)}/api/push/${row.push_token as string}` : null,
          uptime: { h24: pct(up.u1, up.t1), d7: pct(up.u7, up.t7), d30: pct(up.u30, up.t30) },
          avgLatency24h: up.avg24 === null ? null : Math.round(Number(up.avg24) * 10) / 10,
          series: series.map((s) => ({ t: iso(s.t)!, avg: s.avg === null ? null : Number(s.avg), max: s.max === null ? null : Number(s.max), down: Number(s.down), total: Number(s.total) })),
          results: results.map((r) => ({ ts: iso(r.ts)!, status: r.status as "UP", latencyMs: r.latency_ms === null ? null : Number(r.latency_ms), message: (r.message as string) ?? null , messageParts: partsOf(r.message_parts)})),
          events: events.map((e) => ({ ts: iso(e.ts)!, from: e.from_status as string, to: e.to_status as string, message: (e.message as string) ?? null , messageParts: partsOf(e.message_parts)})),
        };
      });
    });

    app.post("/monitors", async (req, reply) => {
      const scope = await tenantScope(req, db, "manage");
      const credId = (req.body as { credentialId?: string })?.credentialId || null;
      const id = await withTenant(db, scope.scopeId, async (tx) => {
        const type = String((req.body as { type?: string })?.type ?? "");
        const cred = credId ? await credentialFor(tx, credId, scope.tenantId, type, env.APP_SECRET) : null;
        const input = parseInput(req.body, null, cred);
        await assertAsset(tx, input.assetId, scope.isGlobal);
        const [m] = await tx
          .insert(schema.monitors)
          .values({ ...input, config: sealConfig(input.type, input.config, env.APP_SECRET), assetId: input.assetId ?? null, credentialId: input.credentialId ?? null, tenantId: scope.tenantId, createdBy: scope.userId, pushToken: input.type === "push" ? randomToken(24) : null })
          .returning({ id: schema.monitors.id });
        return { id: m!.id, name: input.name, type: input.type };
      });
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "monitor.created", entityType: "monitor", entityId: id.id, diff: { name: id.name, type: id.type, ...(credId ? { credentialId: credId } : {}) } });
      reply.code(201);
      return { id: id.id };
    });

    app.put<{ Params: { id: string } }>("/monitors/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      let inputName = "", inputType = "";
      await withTenant(db, scope.scopeId, async (tx) => {
        const before = await loadOne(tx, req.params.id);
        assertOwned(before, scope.tenantId);
        const sameType = (req.body as { type?: string })?.type === before.type;
        const credId = (req.body as { credentialId?: string })?.credentialId || null;
        const cred = credId ? await credentialFor(tx, credId, scope.tenantId, String((req.body as { type?: string })?.type ?? ""), env.APP_SECRET) : null;
        // stopping to use a credential: the monitor needs its own secret again
        const input = parseInput(req.body, sameType ? openConfig(before.type as string, before.config as Record<string, unknown>, env.APP_SECRET) : null, cred, !cred && !!before.credential_id);
        inputName = input.name; inputType = input.type;
        await assertAsset(tx, input.assetId, scope.isGlobal);
        const token = input.type === "push" ? ((before.push_token as string | null) ?? randomToken(24)) : null;
        await tx.execute(sql`
          UPDATE monitors SET name = ${input.name}, type = ${input.type}, config = ${JSON.stringify(sealConfig(input.type, input.config, env.APP_SECRET))}::jsonb,
                 interval_s = ${input.intervalS}, retry_interval_s = ${input.retryIntervalS}, timeout_s = ${input.timeoutS},
                 failures_before_down = ${input.failuresBeforeDown}, successes_before_up = ${input.successesBeforeUp},
                 tags = ${textArray(input.tags)}, description = ${input.description}, push_token = ${token}, asset_id = ${input.assetId ?? null},
                 credential_id = ${input.credentialId ?? null}::uuid,
                 next_run_at = now(), updated_at = now(),
                 status = CASE WHEN type <> ${input.type} THEN 'UNKNOWN' ELSE status END,
                 fail_streak = 0, success_streak = 0
           WHERE id = ${req.params.id}`);
      });
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "monitor.updated", entityType: "monitor", entityId: req.params.id, diff: { name: inputName, type: inputType } });
      return { ok: true };
    });

    app.delete<{ Params: { id: string } }>("/monitors/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      const name = await withTenant(db, scope.scopeId, async (tx) => {
        const before = await loadOne(tx, req.params.id);
        assertOwned(before, scope.tenantId);
        await tx.execute(sql`DELETE FROM dependencies WHERE from_type = 'monitor' AND from_id = ${req.params.id}`);
        await tx.execute(sql`DELETE FROM maintenance_targets WHERE entity_type = 'monitor' AND entity_id = ${req.params.id}`);
        await tx.execute(sql`DELETE FROM monitors WHERE id = ${req.params.id}`);
        await tx.execute(sql`DELETE FROM check_results WHERE monitor_id = ${req.params.id}`);
        await tx.execute(sql`DELETE FROM state_changes WHERE entity_type = 'monitor' AND entity_id = ${req.params.id}`);
        return before.name as string;
      });
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "monitor.deleted", entityType: "monitor", entityId: req.params.id, diff: { name } });
      return { ok: true };
    });

    for (const action of ["pause", "resume"] as const) {
      app.post<{ Params: { id: string } }>(`/monitors/:id/${action}`, async (req) => {
        const scope = await tenantScope(req, db, "operate");
        const name = await withTenant(db, scope.scopeId, async (tx) => {
          const before = await loadOne(tx, req.params.id);
          assertOwned(before, scope.tenantId);
          await tx.execute(
            action === "pause"
              ? sql`UPDATE monitors SET paused = true, updated_at = now() WHERE id = ${req.params.id}`
              : sql`UPDATE monitors SET paused = false, next_run_at = now(), fail_streak = 0, success_streak = 0, updated_at = now() WHERE id = ${req.params.id}`,
          );
          return before.name as string;
        });
        await notifyGraph(pool);
        await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: `monitor.${action}d`, entityType: "monitor", entityId: req.params.id, diff: { name } });
        return { ok: true };
      });
    }

    app.post<{ Params: { id: string } }>("/monitors/:id/push-token", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      await withTenant(db, scope.scopeId, async (tx) => {
        const before = await loadOne(tx, req.params.id);
        assertOwned(before, scope.tenantId);
        if (before.type !== "push") throw new HttpError(400, "not_push", "Only push monitors have a push URL");
        await tx.execute(sql`UPDATE monitors SET push_token = ${randomToken(24)} WHERE id = ${req.params.id}`);
      });
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "monitor.push_token_rotated", entityType: "monitor", entityId: req.params.id });
      return { ok: true };
    });

    /** "Test now": runs a check once from the API host without saving anything. */
    app.post("/monitors/test", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req): Promise<TestResultDto> => {
      const scope = await tenantScope(req, db, "operate");
      const input = parse(testSchema, req.body);
      if (input.type === "push") throw new HttpError(400, "not_testable", "Push monitors are tested by calling their URL");
      if (input.type === "snmp-trap") throw new HttpError(400, "not_testable", "SNMP trap monitors are tested by sending them a trap");
      // editing a saved monitor: use its stored secrets for fields left unchanged
      let stored: Record<string, unknown> | null = null;
      if (input.monitorId) {
        const row = await withTenant(db, scope.scopeId, (tx) => loadOne(tx, input.monitorId!)).catch(() => null);
        if (row && row.type === input.type) stored = openConfig(row.type as string, row.config as Record<string, unknown>, env.APP_SECRET);
      }
      const merged = mergeSecrets(input.type, input.config, stored);
      const cred = input.credentialId ? await withTenant(db, scope.scopeId, (tx) => credentialFor(tx, input.credentialId!, scope.tenantId, input.type, env.APP_SECRET)) : null;
      const cfg = parseMonitorConfig(input.type, cred ? withCredential(input.type, merged, cred) : merged);
      if (!cfg.ok) throw new HttpError(400, "validation_failed", "Check the highlighted fields", cfg.fields);
      // the same data a scheduled check gets (a room's sensors; an inlet sensor has no history yet)
      const extra = await extraContext(pool, { id: null, tenantId: scope.tenantId, type: input.type, config: cfg.config }).catch(() => ({}));
      const r = await runCheck(input.type, cfg.config, { timeoutMs: input.timeoutS * 1000, intervalS: 60, ...extra });
      return r ?? { status: "UP", latencyMs: null, message: "OK" };
    });

    /** Find interfaces: every interface of a device, to pick one (or several) for SNMP interface monitors. */
    app.post("/monitors/snmp-interfaces", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
      const scope = await tenantScope(req, db, "manage");
      const input = parse(testSchema, { ...(req.body as object), type: "snmp-interface" });
      let stored: Record<string, unknown> | null = null;
      if (input.monitorId) {
        const row = await withTenant(db, scope.scopeId, (tx) => loadOne(tx, input.monitorId!)).catch(() => null);
        if (row && (row.type === "snmp-interface" || row.type === "snmp")) stored = openConfig(row.type as string, row.config as Record<string, unknown>, env.APP_SECRET);
      }
      const merged = { ...mergeSecrets("snmp-interface", input.config, stored), interface: "-" };
      const cred = input.credentialId ? await withTenant(db, scope.scopeId, (tx) => credentialFor(tx, input.credentialId!, scope.tenantId, "snmp-interface", env.APP_SECRET)) : null;
      const cfg = parseMonitorConfig("snmp-interface", cred ? withCredential("snmp-interface", merged, cred) : merged);
      if (!cfg.ok) throw new HttpError(400, "validation_failed", "Check the highlighted fields", cfg.fields);
      try {
        return { interfaces: await listInterfaces(cfg.config, Math.min(input.timeoutS, 20) * 1000) };
      } catch (err) {
        if (err instanceof SnmpError && err.code === "timeout") throw new HttpError(400, "snmp_failed", cfg.config.version === "v3" ? "No SNMP response (check host, credentials and ACLs)" : "No SNMP response (check host, community and ACLs)");
        throw new HttpError(400, "snmp_failed", `SNMP error: ${(err as Error).message}`);
      }
    });
  };
