/**
 * Discovery (Global infrastructure scope, infra admins and superadmins): queue a run, follow it,
 * review what it found. The worker does the scanning (apps/worker/src/discovery.ts). Creating
 * assets and monitors from the results goes through the configuration import, in the scope chosen.
 */
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@fudo/db";
import { parseTargets } from "@fudo/monitors/discovery";
import type { AppDeps } from "../server.js";
import { forbidden, HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { tenantScope } from "../lib/tenant-scope.js";
import { notFound, rows } from "./common.js";

const hostField = z.string().trim().min(1, "Enter the address").max(253).regex(/^(https?:\/\/)?[A-Za-z0-9.:-]+\/?$/, "Use a host name or IP address");
const runSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("subnet"),
    name: z.string().trim().max(100).optional().default(""),
    targets: z.string().trim().min(1, "Enter the networks, ranges or addresses to scan").max(10_000),
    credentialIds: z.array(z.string().uuid()).max(10).default([]),
    timeoutMs: z.coerce.number().int().min(300).max(5000).default(1000),
  }),
  z.object({
    source: z.literal("lldp"),
    name: z.string().trim().max(100).optional().default(""),
    targets: z.string().trim().min(1, "Enter the switches to read").max(10_000),
    credentialIds: z.array(z.string().uuid()).min(1, "Choose at least one SNMP credential").max(10),
  }),
  z.object({
    source: z.literal("vcenter"),
    name: z.string().trim().max(100).optional().default(""),
    host: hostField,
    credentialId: z.string({ message: "Choose a credential" }).uuid("Choose a credential"),
    includeVms: z.boolean().default(true),
    poweredOffVms: z.boolean().default(false),
    ignoreTls: z.boolean().default(true),
  }),
  z.object({
    source: z.literal("oneview"),
    name: z.string().trim().max(100).optional().default(""),
    host: hostField,
    credentialId: z.string({ message: "Choose a credential" }).uuid("Choose a credential"),
    domain: z.string().trim().max(100).optional().default(""),
    ignoreTls: z.boolean().default(true),
  }),
]);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export const discoveryRoutes =
  ({ db, pool }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    async function scope(req: FastifyRequest) {
      const s = await tenantScope(req, db, "manage");
      if (!s.isGlobal) throw forbidden("Discovery runs in the Global infrastructure scope");
      return s;
    }
    const runDto = (r: Record<string, unknown>) => ({
      id: r.id as string, source: r.source as string, name: r.name as string, params: r.params as Record<string, unknown>, status: r.status as string,
      total: Number(r.total), done: Number(r.done), found: Number(r.found), error: (r.error as string) ?? null,
      startedBy: (r.started_by_name as string) ?? null, createdAt: iso(r.created_at)!, startedAt: iso(r.started_at), finishedAt: iso(r.finished_at),
    });

    app.get("/discovery/runs", async (req) => {
      const s = await scope(req);
      return withTenant(db, s.scopeId, async (tx) => (await rows(tx, sql`
        SELECT r.*, u.display_name AS started_by_name FROM discovery_runs r LEFT JOIN users u ON u.id = r.started_by ORDER BY r.created_at DESC LIMIT 50`)).map(runDto));
    });

    app.post("/discovery/runs", async (req, reply) => {
      const s = await scope(req);
      const b = parse(runSchema, req.body);
      let total = 0;
      if (b.source === "subnet" || b.source === "lldp") {
        const parsed = parseTargets(b.targets, b.source === "lldp" ? 512 : undefined);
        if (!parsed.ok) throw new HttpError(400, "validation_failed", "Check the highlighted fields", { targets: parsed.error === "tooMany" ? (b.source === "lldp" ? "At most 512 switches per discovery" : "At most 4096 addresses per discovery") : `Not a network, range, address or host name: ${parsed.entry}` });
        total = parsed.targets.length;
      }
      const { source, name, ...params } = b;
      const id = await withTenant(db, s.scopeId, async (tx) => {
        const want = "credentialIds" in b ? b.credentialIds : [b.credentialId];
        const kinds = source === "subnet" || source === "lldp" ? ["snmp-community", "snmpv3"] : ["password"];
        if (want.length) {
          const ok = await rows(tx, sql`SELECT id FROM credentials WHERE id IN (${sql.join(want.map((c) => sql`${c}::uuid`), sql`, `)}) AND tenant_id IS NULL AND kind IN (${sql.join(kinds.map((k) => sql`${k}`), sql`, `)})`);
          if (ok.length !== new Set(want).size) throw new HttpError(400, "validation_failed", "Check the highlighted fields", "credentialIds" in b
            ? { credentialIds: "Choose SNMP credentials of the Global infrastructure scope" } : { credentialId: "Choose an account and password of the Global infrastructure scope" });
        }
        return (await rows(tx, sql`INSERT INTO discovery_runs (source, name, params, total, started_by) VALUES (${source}, ${name}, ${JSON.stringify(params)}::jsonb, ${total}, ${s.userId}) RETURNING id`))[0]!.id as string;
      });
      await pool.query("NOTIFY fudo_discovery").catch(() => {});
      await audit(db, { userId: s.userId, tenantId: null, action: "discovery.started", entityType: "discovery", entityId: id, diff: { source, target: "targets" in b ? b.targets : b.host, addresses: total } });
      reply.code(201);
      return { id, addresses: total };
    });

    /** A run and its results; each result says whether it is already known (an asset or monitor with that address). */
    app.get<{ Params: { id: string } }>("/discovery/runs/:id", async (req) => {
      const s = await scope(req);
      const run = await withTenant(db, s.scopeId, async (tx) => (await rows(tx, sql`SELECT r.*, u.display_name AS started_by_name FROM discovery_runs r LEFT JOIN users u ON u.id = r.started_by WHERE r.id = ${req.params.id}::uuid`))[0]);
      if (!run) throw notFound("Discovery");
      // known devices are looked up in every scope (superadmins and infra admins manage them all)
      const c = await pool.connect();
      let results: Record<string, unknown>[];
      try {
        await c.query("BEGIN READ ONLY");
        await c.query("SELECT set_config('fudo.all_tenants', 'on', true)");
        results = (await c.query(`
          SELECT d.*, k.asset_id, k.asset_name, k.asset_tenant, k.tenant_name, k.monitors
            FROM discovery_results d
            LEFT JOIN LATERAL (
              SELECT a.id AS asset_id, a.name AS asset_name, a.tenant_id AS asset_tenant, t.name AS tenant_name,
                     (SELECT count(*) FROM monitors m WHERE d.address <> '' AND (m.config->>'host' = d.address OR m.config->>'url' LIKE '%//' || d.address || '%')) AS monitors
                FROM (SELECT 1) x LEFT JOIN assets a ON (d.address <> '' AND (lower(a.address) = lower(d.address) OR (d.details->>'rdns' IS NOT NULL AND lower(a.address) = lower(d.details->>'rdns')))) OR (d.address = '' AND lower(a.name) = lower(d.name))
                LEFT JOIN tenants t ON t.id = a.tenant_id
               ORDER BY a.tenant_id NULLS FIRST LIMIT 1) k ON true
           WHERE d.run_id = $1
           ORDER BY (CASE WHEN d.address ~ '^[0-9.]+$' THEN string_to_array(d.address, '.')::int[] END), d.name`, [req.params.id])).rows;
        await c.query("COMMIT");
      } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
      return {
        ...runDto(run),
        results: results.map((r) => {
          const tenant = (r.asset_tenant as string) ?? null;
          return {
            id: r.id as string, key: r.key as string, address: r.address as string, name: r.name as string, category: r.category as string,
            vendor: r.vendor as string, model: r.model as string, os: r.os as string, template: r.template as string, assetKind: r.asset_kind as string,
            parentKey: (r.parent_key as string) ?? null, dependsOn: (r.depends_on as string[]) ?? [], details: r.details as Record<string, unknown>,
            known: r.asset_id || Number(r.monitors) > 0 ? {
              assetId: (r.asset_id as string) ?? null, assetName: (r.asset_name as string) ?? null,
              scope: r.asset_id ? (tenant === null ? "global" : "tenant") : null, tenantId: tenant, tenantName: (r.tenant_name as string) ?? null, monitors: Number(r.monitors),
            } : null,
          };
        }),
      };
    });

    app.post<{ Params: { id: string } }>("/discovery/runs/:id/cancel", async (req) => {
      const s = await scope(req);
      const r = await withTenant(db, s.scopeId, async (tx) => rows(tx, sql`UPDATE discovery_runs SET status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE 'cancelling' END, finished_at = CASE WHEN status = 'queued' THEN now() ELSE finished_at END
          WHERE id = ${req.params.id}::uuid AND status IN ('queued', 'running') RETURNING status`));
      if (!r.length) throw new HttpError(409, "not_running", "This discovery is not running");
      return { ok: true };
    });

    app.delete<{ Params: { id: string } }>("/discovery/runs/:id", async (req) => {
      const s = await scope(req);
      const r = await withTenant(db, s.scopeId, async (tx) => rows(tx, sql`DELETE FROM discovery_runs WHERE id = ${req.params.id}::uuid AND status NOT IN ('queued', 'running', 'cancelling') RETURNING id`));
      if (!r.length) throw new HttpError(409, "running", "Stop the discovery first");
      await audit(db, { userId: s.userId, tenantId: null, action: "discovery.deleted", entityType: "discovery", entityId: req.params.id, diff: {} });
      return { ok: true };
    });
  };
