import { issueMessage } from "@fudo/shared";
import type { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@fudo/db";
import { channelInputSchema, getChannelType } from "@fudo/notify/definitions";
import { decryptConfig, encryptConfig, loadSmtp, maskConfig, mergeSecrets, messageLang, sendTest } from "@fudo/notify/server";
import type { ApplicationChannelDto, ChannelDto, DeliveryDto } from "@fudo/shared";
import { z } from "zod";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { tenantScope, type TenantScope } from "../lib/tenant-scope.js";
import { publicOrigin } from "../lib/origin.js";
import { assertOwned, iso, notFound, rows, textArray, type Row } from "./common.js";
import { getSetting, SETTING } from "../lib/settings.js";

export const channelRoutes =
  ({ db, env, pool }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const toDto = (r: Row): ChannelDto => ({
      id: r.id as string, scope: r.tenant_id ? "tenant" : "global", name: r.name as string, type: r.type as string,
      config: maskConfig(r.type as string, decryptConfig(r.config_enc as string, env.APP_SECRET)), summary: r.config_summary as string,
      enabled: r.enabled as boolean, minSeverity: r.min_severity as ChannelDto["minSeverity"], events: r.events as string[],
      skipImpacted: r.skip_impacted as boolean, allTenants: r.all_tenants as boolean, remindMinutes: r.remind_minutes as number,
      escalateAfterMinutes: r.escalate_after_minutes as number,
      routing: (r.routing as ChannelDto["routing"]) ?? "all", locale: (r.locale as string | null) ?? null, applications: (r.apps as ChannelDto["applications"]) ?? [],
      lastDelivery: r.last_status ? { status: r.last_status as string, at: iso(r.last_at)!, detail: (r.last_detail as string) ?? "" } : null,
    });
    const LIST = (where: ReturnType<typeof sql>) => sql`
      SELECT ch.*, d.status AS last_status, d.created_at AS last_at, d.detail AS last_detail,
             (SELECT coalesce(json_agg(json_build_object('id', a.id, 'name', a.name) ORDER BY a.name), '[]') FROM application_channels ac
               JOIN applications a ON a.id = ac.application_id WHERE ac.channel_id = ch.id) AS apps
        FROM notification_channels ch
      LEFT JOIN LATERAL (SELECT status, created_at, detail FROM notification_deliveries WHERE channel_id = ch.id AND status <> 'suppressed' ORDER BY id DESC LIMIT 1) d ON true
      WHERE ${where} ORDER BY ch.name`;
    const one = async (tx: Tx, id: string) => { const r = (await rows(tx, LIST(sql`ch.id = ${id}`)))[0]; if (!r) throw notFound("Channel"); return r; };

    function parseInput(body: unknown, scope: TenantScope, stored: Record<string, unknown> | null) {
      const base = channelInputSchema.safeParse(body ?? {});
      const fields: Record<string, string> = {};
      if (!base.success) for (const i of base.error.issues) fields[i.path.join(".") || "_"] ??= issueMessage(i);
      const type = getChannelType(String((body as { type?: string })?.type ?? ""));
      let config: Record<string, unknown> = {};
      if (type) {
        const merged = mergeSecrets(type.id, ((body as { config?: Record<string, unknown> })?.config ?? {}), stored);
        const c = type.schema.safeParse(merged);
        if (c.success) config = c.data; else for (const i of c.error.issues) fields[`config.${i.path.join(".")}`] ??= issueMessage(i);
      }
      if (!base.success || Object.keys(fields).length) throw new HttpError(400, "validation_failed", "Check the highlighted fields", fields);
      // applications belong to tenants: global channels always route by scope
      const routing = scope.isGlobal ? "all" as const : base.data.routing;
      return { ...base.data, routing, applicationIds: scope.isGlobal ? [] : base.data.applicationIds, allTenants: scope.isGlobal ? base.data.allTenants : false, config, summary: type!.summary(config) };
    }

    /** Replaces the applications linked to a channel (only applications of this tenant are accepted). */
    async function setChannelApps(tx: Tx, channelId: string, tenantId: string | null, ids: string[]) {
      await tx.execute(sql`DELETE FROM application_channels WHERE channel_id = ${channelId}`);
      if (!tenantId || !ids.length) return;
      const ok = await rows(tx, sql`SELECT id FROM applications WHERE tenant_id = ${tenantId}::uuid AND id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
      if (ok.length !== new Set(ids).size) throw new HttpError(400, "validation_failed", "Check the highlighted fields", { applicationIds: "One of the applications does not exist in this tenant" });
      for (const a of ok) await tx.execute(sql`INSERT INTO application_channels (application_id, channel_id, tenant_id) VALUES (${a.id as string}, ${channelId}, ${tenantId}::uuid)`);
    }

    /** Channels of the tenant as seen from one application (names only, no configuration). */
    app.get<{ Params: { id: string } }>("/applications/:id/channels", async (req): Promise<ApplicationChannelDto[]> => {
      const scope = await tenantScope(req, db);
      return withTenant(db, scope.scopeId, async (tx) => {
        const a = (await rows(tx, sql`SELECT id, tenant_id FROM applications WHERE id = ${req.params.id}`))[0];
        if (!a) throw notFound("Application");
        return (await rows(tx, sql`
          SELECT ch.id, ch.name, ch.type, ch.config_summary, ch.enabled, ch.routing,
                 EXISTS (SELECT 1 FROM application_channels ac WHERE ac.channel_id = ch.id AND ac.application_id = ${req.params.id}) AS linked
            FROM notification_channels ch WHERE ch.tenant_id = ${a.tenant_id as string}::uuid ORDER BY ch.routing, ch.name`)).map((c) => ({
          id: c.id as string, name: c.name as string, type: c.type as string, summary: c.config_summary as string, enabled: c.enabled as boolean,
          routing: c.routing as "all", linked: c.linked as boolean,
        }));
      });
    });

    /** Sets which "selected applications" channels receive this application's incidents. */
    app.put<{ Params: { id: string } }>("/applications/:id/channels", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      const { channelIds } = parse(z.object({ channelIds: z.array(z.string().uuid()).max(100) }), req.body);
      await withTenant(db, scope.scopeId, async (tx) => {
        const a = (await rows(tx, sql`SELECT id, tenant_id FROM applications WHERE id = ${req.params.id}`))[0];
        if (!a) throw notFound("Application");
        assertOwned(a, scope.tenantId, "This application");
        const chans = channelIds.length ? await rows(tx, sql`SELECT id FROM notification_channels WHERE tenant_id = ${scope.tenantId}::uuid AND id IN (${sql.join(channelIds.map((i) => sql`${i}::uuid`), sql`, `)})`) : [];
        if (chans.length !== new Set(channelIds).size) throw new HttpError(400, "validation_failed", "One of the channels does not exist in this tenant");
        await tx.execute(sql`DELETE FROM application_channels WHERE application_id = ${req.params.id}`);
        for (const c of chans) await tx.execute(sql`INSERT INTO application_channels (application_id, channel_id, tenant_id) VALUES (${req.params.id}, ${c.id as string}, ${scope.tenantId}::uuid)`);
      });
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "application.channels_updated", entityType: "application", entityId: req.params.id, diff: { channels: channelIds.length } });
      return { ok: true };
    });

    app.get("/notification-channels", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      return withTenant(db, scope.scopeId, async (tx) => (await rows(tx, LIST(sql`ch.tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid`))).map(toDto));
    });

    app.post("/notification-channels", async (req, reply) => {
      const scope = await tenantScope(req, db, "manage");
      const input = parseInput(req.body, scope, null);
      // one transaction: an invalid application list must not leave a half-created channel behind
      const id = await withTenant(db, scope.scopeId, async (tx) => {
        const newId = (await rows(tx, sql`
        INSERT INTO notification_channels (tenant_id, name, type, config_enc, config_summary, enabled, min_severity, events, skip_impacted, all_tenants, remind_minutes, escalate_after_minutes, routing, locale, created_by)
        VALUES (${scope.tenantId}::uuid, ${input.name}, ${input.type}, ${encryptConfig(input.config, env.APP_SECRET)}, ${input.summary}, ${input.enabled}, ${input.minSeverity},
                ${textArray(input.events)}, ${input.skipImpacted}, ${input.allTenants}, ${input.remindMinutes}, ${input.escalateAfterMinutes}, ${input.routing}, ${input.locale}, ${scope.userId}) RETURNING id`))[0]!.id as string;
        if (input.routing === "selected") await setChannelApps(tx, newId, scope.tenantId, input.applicationIds);
        return newId;
      });
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "channel.created", entityType: "channel", entityId: id, diff: { name: input.name, type: input.type } });
      reply.code(201);
      return { id };
    });

    app.put<{ Params: { id: string } }>("/notification-channels/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      await withTenant(db, scope.scopeId, async (tx) => {
        const r = await one(tx, req.params.id);
        assertOwned(r, scope.tenantId, "This channel");
        const input = parseInput(req.body, scope, r.type === (req.body as { type?: string })?.type ? decryptConfig(r.config_enc as string, env.APP_SECRET) : null);
        await tx.execute(sql`UPDATE notification_channels SET name = ${input.name}, type = ${input.type}, config_enc = ${encryptConfig(input.config, env.APP_SECRET)},
          config_summary = ${input.summary}, enabled = ${input.enabled}, min_severity = ${input.minSeverity}, events = ${textArray(input.events)},
          skip_impacted = ${input.skipImpacted}, all_tenants = ${input.allTenants}, remind_minutes = ${input.remindMinutes},
          escalate_after_minutes = ${input.escalateAfterMinutes}, routing = ${input.routing}, locale = ${input.locale}, updated_at = now() WHERE id = ${req.params.id}`);
        // links are kept when switching to "all" (harmless there), so switching back restores them
        if (input.routing === "selected") await setChannelApps(tx, req.params.id, scope.tenantId, input.applicationIds);
      });
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "channel.updated", entityType: "channel", entityId: req.params.id });
      return { ok: true };
    });

    app.delete<{ Params: { id: string } }>("/notification-channels/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      await withTenant(db, scope.scopeId, async (tx) => {
        assertOwned(await one(tx, req.params.id), scope.tenantId, "This channel");
        await tx.execute(sql`DELETE FROM notification_channels WHERE id = ${req.params.id}`);
      });
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "channel.deleted", entityType: "channel", entityId: req.params.id });
      return { ok: true };
    });

    /** Sends a test message right away (saved channel, or unsaved form values with "config"). */
    app.post<{ Params: { id: string } }>("/notification-channels/:id/test", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
      const scope = await tenantScope(req, db, "manage");
      const r = await withTenant(db, scope.scopeId, (tx) => one(tx, req.params.id));
      const cfg = decryptConfig(r.config_enc as string, env.APP_SECRET);
      try {
        const detail = await sendTest(r.type as string, cfg, r.type === "email" ? await loadSmtp(pool, env.APP_SECRET) : null, await getSetting<string>(db, SETTING.orgName), publicOrigin(req, env), await messageLang(pool, (r.locale as string | null) ?? null));
        await withTenant(db, scope.scopeId, (tx) => tx.execute(sql`INSERT INTO notification_deliveries (tenant_id, channel_id, event, status, detail, attempts, sent_at) VALUES (${scope.tenantId}::uuid, ${req.params.id}, 'test', 'sent', ${detail}, 1, now())`));
        return { ok: true, detail };
      } catch (err) {
        const msg = (err as Error).message;
        await withTenant(db, scope.scopeId, (tx) => tx.execute(sql`INSERT INTO notification_deliveries (tenant_id, channel_id, event, status, detail, attempts) VALUES (${scope.tenantId}::uuid, ${req.params.id}, 'test', 'failed', ${msg.slice(0, 500)}, 1)`));
        throw new HttpError(502, "send_failed", `Sending failed: ${msg}`);
      }
    });

    app.get<{ Params: { id: string } }>("/notification-channels/:id/deliveries", async (req): Promise<DeliveryDto[]> => {
      const scope = await tenantScope(req, db, "manage");
      return withTenant(db, scope.scopeId, async (tx) => {
        const r = await one(tx, req.params.id);
        return (await rows(tx, sql`SELECT * FROM notification_deliveries WHERE channel_id = ${req.params.id} ORDER BY id DESC LIMIT 50`)).map((d) => ({
          id: Number(d.id), channelName: r.name as string, type: r.type as string, event: d.event as string, status: d.status as "sent", detail: d.detail as string,
          attempts: d.attempts as number, createdAt: iso(d.created_at)!, sentAt: iso(d.sent_at),
        }));
      });
    });
  };
