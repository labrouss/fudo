/**
 * Uptime Kuma import (Configuration › Import from Uptime Kuma). The file (JSON backup or kuma.db) is
 * streamed to a temporary file, read and deleted at once; only the parsed data is kept for 30
 * minutes, for the same user and scope, to preview and then apply. Monitors and applications go
 * through the configuration import (same validation and plan); channels through the regular
 * channel endpoint (same validation and secret encryption).
 */
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@fudo/db";
import { getChannelType } from "@fudo/notify/definitions";
import { convertKuma, KumaReadError, readKuma, type KumaData } from "@fudo/kuma-import";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { importConfig } from "../lib/config.js";
import { notifyGraph, tenantScope } from "../lib/tenant-scope.js";
import { rows } from "./common.js";

const MAX_BYTES = 1024 * 1024 * 1024;
const KEEP_MS = 30 * 60_000;
const uploads = new Map<string, { data: KumaData; userId: string | null; scopeId: string; expires: number }>();
const sweep = () => { const now = Date.now(); for (const [k, v] of uploads) if (v.expires < now) uploads.delete(k); };
const applyBody = z.object({ dryRun: z.boolean().default(true), channelsEnabled: z.boolean().default(false) });

export const kumaRoutes =
  ({ db, pool, env }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.addContentTypeParser("application/octet-stream", (_req, payload, done) => done(null, payload));

    app.put("/config/import/kuma/upload", { bodyLimit: MAX_BYTES, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req: FastifyRequest) => {
      const scope = await tenantScope(req, db, "manage");
      const dir = await mkdtemp(join(tmpdir(), "fudo-kuma-"));
      const file = join(dir, "upload");
      try {
        await pipeline(req.body as Readable, createWriteStream(file, { mode: 0o600 }));
        let data: KumaData;
        try { data = readKuma(file); }
        catch (e) {
          if (e instanceof KumaReadError && e.code === "too_large") throw new HttpError(400, "too_large", "The backup file is too large");
          if (e instanceof KumaReadError && e.code === "unreadable") throw new HttpError(400, "unreadable", "The database file cannot be read");
          if (e instanceof KumaReadError) throw new HttpError(400, "not_kuma", "This is not an Uptime Kuma backup or database");
          throw e;
        }
        sweep();
        const id = randomBytes(18).toString("base64url");
        uploads.set(id, { data, userId: scope.userId, scopeId: scope.scopeId, expires: Date.now() + KEEP_MS });
        return { uploadId: id, source: data.source, monitors: data.monitors.filter((m) => m.type !== "group").length, groups: data.monitors.filter((m) => m.type === "group").length, notifications: data.notifications.length };
      } finally {
        await rm(dir, { recursive: true, force: true }); // nothing of the file stays on disk
      }
    });

    app.post<{ Params: { id: string } }>("/config/import/kuma/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
      const scope = await tenantScope(req, db, "manage");
      const { dryRun, channelsEnabled } = parse(applyBody, req.body);
      sweep();
      const up = uploads.get(req.params.id);
      if (!up || up.userId !== scope.userId || up.scopeId !== scope.scopeId) throw new HttpError(404, "not_found", "Upload the file again: the previous upload has expired");
      const own = sql`tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid`;
      const names = (rs: Array<Record<string, unknown>>) => new Set(rs.map((r) => String(r.name).toLowerCase()));
      const { converted, plan } = await withTenant(db, scope.scopeId, async (tx) => {
        const converted = convertKuma(up.data, {
          existingMonitors: names(await rows(tx, sql`SELECT name FROM monitors WHERE ${own}`)),
          existingApplications: names(await rows(tx, sql`SELECT name FROM applications WHERE ${own}`)),
          existingChannels: names(await rows(tx, sql`SELECT name FROM notification_channels WHERE ${own}`)),
          providerFields: (t) => getChannelType(`kuma:${t}`)?.fields.map((f) => f.key) ?? null,
          allowApplications: !scope.isGlobal,
        });
        const plan = await importConfig(tx, scope, { assets: [], monitors: converted.monitors, applications: converted.applications }, () => null, !dryRun, env.APP_SECRET);
        return { converted, plan };
      });
      const result = { dryRun, applied: false, plan, channels: converted.channels.map(({ config: _c, kumaId: _k, ...c }) => c), skipped: converted.skipped, warnings: converted.warnings, channelErrors: [] as Array<{ name: string; message: string }> };
      if (dryRun || plan.errors.length) return result;

      // the configuration is in; now the channels, through the regular endpoint
      const appIds = await withTenant(db, scope.scopeId, async (tx) => new Map((await rows(tx, sql`SELECT id, name FROM applications WHERE ${own}`)).map((r) => [String(r.name).toLowerCase(), r.id as string])));
      const headers: Record<string, string> = { "content-type": "application/json", "x-fudo-tenant": scope.isGlobal ? "global" : scope.tenantId! };
      for (const h of ["cookie", "authorization", "x-fudo-lang", "origin"]) if (req.headers[h]) headers[h] = String(req.headers[h]);
      let created = 0;
      for (const c of converted.channels) {
        const r = await app.inject({ method: "POST", url: "/api/notification-channels", headers, payload: {
          name: c.name, type: c.type, config: c.config, enabled: channelsEnabled, events: ["opened", "resolved"],
          routing: c.routing === "applications" ? "selected" : "all", applicationIds: c.applications.map((a) => appIds.get(a.toLowerCase())).filter(Boolean),
        } });
        if (r.statusCode >= 300) result.channelErrors.push({ name: c.name, message: (r.json() as { message?: string }).message ?? String(r.statusCode) });
        else created++;
      }
      uploads.delete(req.params.id);
      await notifyGraph(pool);
      for (const k of ["monitor", "status"]) await pool.query("SELECT pg_notify('fudo_live', json_build_object('t', $1::uuid, 'k', $2::text)::text)", [scope.tenantId, k]);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "config.kuma_imported", diff: { ...plan.summary, channels: created, skipped: converted.skipped.length, source: up.data.source } });
      return { ...result, applied: true };
    });
  };
