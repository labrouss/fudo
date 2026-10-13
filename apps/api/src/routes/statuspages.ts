/**
 * Status pages. Managers create them per scope; /api/status/:slug shows one: without signing in
 * for public pages (display labels and plain statuses only), to signed-in users with access to the
 * page's tenant for internal pages (who also see incident titles and maintenance names).
 */
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@fudo/db";
import { statusPageSchema, type PublicStatus, type StatusPageDto, type StatusPageView } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { conflict, forbidden, HttpError, parse, unauthorized } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { tenantScope } from "../lib/tenant-scope.js";
import { partsOf } from "../lib/parts.js";
import { assertOwned, iso, notFound, rows, type Row } from "./common.js";
import { loadAvailability } from "./metrics.js";

type ItemType = "application" | "asset" | "monitor";
const TABLE: Record<ItemType, { table: string; status: string }> = {
  application: { table: "applications", status: "status" },
  asset: { table: "assets", status: "status" },
  monitor: { table: "monitors", status: "effective_status" },
};
/** Internal states → what a status page says. "At risk" still works, so it reads as operational. */
const PUBLIC: Record<string, PublicStatus> = { UP: "operational", AT_RISK: "operational", DEGRADED: "degraded", IMPACTED: "outage", DOWN: "outage", MAINTENANCE: "maintenance" };
const toPublic = (s: string | null | undefined): PublicStatus => PUBLIC[String(s)] ?? "unknown";
const RANK: Record<PublicStatus, number> = { operational: 0, unknown: 0, maintenance: 1, degraded: 2, outage: 3 };
const worst = (all: PublicStatus[]): PublicStatus => all.reduce<PublicStatus>((a, b) => (RANK[b] > RANK[a] ? b : a), "operational");
const isUniqueViolation = (e: unknown) => { const x = e as { code?: string; cause?: { code?: string } }; return x?.code === "23505" || x?.cause?.code === "23505"; };

function toDto(r: Row, names: Map<string, string>): StatusPageDto {
  const items = (r.items as StatusPageDto["items"]).map((i) => ({ ...i, group: i.group ?? "", name: names.get(`${i.type}:${i.id}`) ?? "(deleted)" }));
  return {
    id: r.id as string, scope: r.tenant_id ? "tenant" : "global", slug: r.slug as string, title: r.title as string, description: r.description as string,
    visibility: r.visibility as "public", showHistory: r.show_history as boolean, showIncidents: r.show_incidents as boolean, showMaintenance: r.show_maintenance as boolean, items,
  };
}

/** Current rows of the page's items (only those the page's scope may show). */
async function loadItems(tx: Tx, items: Array<{ type: ItemType; id: string }>, tenantId: string | null) {
  const out = new Map<string, Row>();
  for (const type of Object.keys(TABLE) as ItemType[]) {
    const ids = items.filter((i) => i.type === type).map((i) => i.id);
    if (!ids.length) continue;
    const t = TABLE[type];
    const found = await rows(tx, sql`SELECT id, tenant_id, name, ${sql.raw(t.status)} AS status, created_at FROM ${sql.raw(t.table)} WHERE id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`);
    // a tenant page may show its own items and shared infrastructure; a global page only shared infrastructure
    for (const r of found) if (r.tenant_id === null || r.tenant_id === tenantId) out.set(`${type}:${r.id}`, r);
  }
  return out;
}

export const statusPageRoutes =
  ({ db, pool }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    /* ---------- managing ---------- */
    app.get("/status-pages", async (req) => {
      const scope = await tenantScope(req, db);
      return withTenant(db, scope.scopeId, async (tx) => {
        const pages = await rows(tx, sql`SELECT * FROM status_pages WHERE tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid ORDER BY title`);
        const all = pages.flatMap((p) => p.items as Array<{ type: ItemType; id: string }>);
        const found = await loadItems(tx, all, scope.tenantId);
        const names = new Map([...found].map(([k, r]) => [k, r.name as string]));
        return pages.map((p) => toDto(p, names));
      });
    });

    async function save(req: FastifyRequest, id: string | null) {
      const scope = await tenantScope(req, db, "manage");
      const input = parse(statusPageSchema, req.body);
      try {
        const pageId = await withTenant(db, scope.scopeId, async (tx) => {
          const found = await loadItems(tx, input.items, scope.tenantId);
          if (input.items.some((i) => !found.has(`${i.type}:${i.id}`))) throw new HttpError(400, "validation_failed", "One of the items no longer exists");
          const values = sql`${input.title}, ${input.slug}, ${input.description}, ${input.visibility}, ${input.showHistory}, ${input.showIncidents}, ${input.showMaintenance}, ${JSON.stringify(input.items)}::jsonb`;
          if (id) {
            const r = (await rows(tx, sql`SELECT tenant_id FROM status_pages WHERE id = ${id}`))[0];
            if (!r) throw notFound("Status page");
            assertOwned(r, scope.tenantId, "This status page");
            await tx.execute(sql`UPDATE status_pages SET (title, slug, description, visibility, show_history, show_incidents, show_maintenance, items) = (${values}), updated_at = now() WHERE id = ${id}`);
            return id;
          }
          return (await rows(tx, sql`INSERT INTO status_pages (title, slug, description, visibility, show_history, show_incidents, show_maintenance, items, tenant_id, created_by)
                                     VALUES (${values}, ${scope.tenantId}::uuid, ${scope.userId}) RETURNING id`))[0]!.id as string;
        });
        await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: id ? "status_page.updated" : "status_page.created", entityType: "status_page", entityId: pageId, diff: { slug: input.slug, visibility: input.visibility, items: input.items.length } });
        return pageId;
      } catch (e) {
        if (isUniqueViolation(e)) throw conflict("This address is already used by another status page");
        throw e;
      }
    }
    app.post("/status-pages", async (req, reply) => { const id = await save(req, null); reply.code(201); return { id }; });
    app.put<{ Params: { id: string } }>("/status-pages/:id", async (req) => { await save(req, req.params.id); return { ok: true }; });
    app.delete<{ Params: { id: string } }>("/status-pages/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      await withTenant(db, scope.scopeId, async (tx) => {
        const r = (await rows(tx, sql`SELECT tenant_id FROM status_pages WHERE id = ${req.params.id}`))[0];
        if (!r) throw notFound("Status page");
        assertOwned(r, scope.tenantId, "This status page");
        await tx.execute(sql`DELETE FROM status_pages WHERE id = ${req.params.id}`);
      });
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "status_page.deleted", entityType: "status_page", entityId: req.params.id });
      return { ok: true };
    });

    /* ---------- viewing ---------- */
    /** Internal pages: signed in (with the second factor) and allowed into the page's tenant. */
    async function mayView(req: FastifyRequest, tenantId: string | null): Promise<void> {
      const a = req.auth;
      if (!a || !a.session.mfaPassed) throw unauthorized();
      if (a.user.isSuperadmin || tenantId === null) return;
      const ok = (await pool.query(`SELECT 1 FROM user_tenant_roles WHERE user_id = $1 AND (tenant_id = $2 OR (tenant_id IS NULL AND role = 'infra-admin')) LIMIT 1`, [a.user.id, tenantId])).rowCount;
      if (!ok) throw forbidden();
    }

    app.get<{ Params: { slug: string } }>("/status/:slug", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply): Promise<StatusPageView> => {
      const slug = String(req.params.slug).toLowerCase();
      const view = await withTenant(db, "all", async (tx) => {
        const page = (await rows(tx, sql`SELECT * FROM status_pages WHERE slug = ${slug}`))[0];
        if (!page) throw notFound("Status page");
        const internal = page.visibility === "internal";
        if (internal) await mayView(req, (page.tenant_id as string) ?? null);
        const items = page.items as Array<{ type: ItemType; id: string; label: string; group?: string }>;
        const found = await loadItems(tx, items, (page.tenant_id as string) ?? null);
        const shown = items.filter((i) => found.has(`${i.type}:${i.id}`));
        const label = new Map(shown.map((i) => [`${i.type}:${i.id}`, i.label]));

        const history = new Map<string, Awaited<ReturnType<typeof loadAvailability>> extends Map<string, infer V> ? V : never>();
        if (page.show_history) {
          for (const type of Object.keys(TABLE) as ItemType[]) {
            const ents = shown.filter((i) => i.type === type).map((i) => { const r = found.get(`${type}:${i.id}`)!; return { id: i.id, status: r.status as string, createdAt: new Date(r.created_at as string) }; });
            for (const [id, a] of await loadAvailability(tx, type, ents, 90)) history.set(`${type}:${id}`, a);
          }
        }
        const groups: StatusPageView["groups"] = [];
        for (const i of shown) {
          const k = `${i.type}:${i.id}`, h = history.get(k);
          const g = i.group ?? "";
          let grp = groups.find((x) => x.name === g);
          if (!grp) groups.push(grp = { name: g, items: [] });
          grp.items.push({ label: i.label, status: toPublic(found.get(k)!.status as string), days: h ? h.buckets.map((b) => ({ date: b.date, pct: b.pct, downMin: b.downMin })) : null, pct90: h?.pct ?? null });
        }

        let incidents: StatusPageView["incidents"] = [];
        if (page.show_incidents && shown.length) {
          const keys = sql.join(shown.map((i) => sql`(${i.type}, ${i.id}::uuid)`), sql`, `);
          incidents = (await rows(tx, sql`SELECT entity_type, entity_id, entity_status, status, opened_at, title, title_parts FROM incidents
                                          WHERE status <> 'resolved' AND (entity_type, entity_id) IN (${keys}) ORDER BY opened_at`))
            .map((r) => ({
              labels: [label.get(`${r.entity_type as string}:${r.entity_id as string}`)!], status: toPublic(r.entity_status as string), since: iso(r.opened_at)!,
              acknowledged: r.status === "acknowledged",
              // public pages never show internal titles
              title: internal ? (r.title as string) : null, ...(internal ? { titleParts: partsOf(r.title_parts) } : {}),
            }));
        }
        let maintenance: StatusPageView["maintenance"] = [];
        if (page.show_maintenance && shown.length) {
          const ws = await rows(tx, sql`SELECT w.id, w.name, w.starts_at, w.ends_at, array_agg(t.entity_type || ':' || t.entity_id) AS targets
                                        FROM maintenance_windows w JOIN maintenance_targets t ON t.window_id = w.id
                                       WHERE w.ends_at > now() AND w.starts_at < now() + interval '7 days'
                                       GROUP BY w.id ORDER BY w.starts_at LIMIT 50`);
          maintenance = ws.map((w) => ({ w, labels: (w.targets as string[]).map((k) => label.get(k)).filter(Boolean) as string[] }))
            .filter((x) => x.labels.length)
            .map(({ w, labels }) => ({ labels, startsAt: iso(w.starts_at)!, endsAt: iso(w.ends_at)!, active: new Date(w.starts_at as string) <= new Date(), name: internal ? (w.name as string) : null }));
        }
        return {
          title: page.title as string, description: page.description as string, visibility: page.visibility as "public", generatedAt: new Date().toISOString(),
          overall: worst(groups.flatMap((g) => g.items.map((i) => i.status))), groups, incidents, maintenance,
        };
      });
      reply.header("cache-control", view.visibility === "public" ? "public, max-age=30" : "private, no-store");
      return view;
    });
  };
