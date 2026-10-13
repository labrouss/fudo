/**
 * Acknowledge links from on-call messages (/ack/<token>), usable without signing in. Opening the
 * link only shows the incident: chat apps and email scanners open links to preview them, so the
 * acknowledgement itself needs the button (a POST). Tokens are single-use, last 24 hours, work only
 * while the incident is open, and act as the paged person (whose role must allow acknowledging).
 */
import type { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@fudo/db";
import { sha256, type MsgPart } from "@fudo/shared";
import { enqueueNotifications, incNo } from "@fudo/notify/server";
import type { AppDeps } from "../server.js";
import { HttpError } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { partsOf } from "../lib/parts.js";
import { rows, type Row } from "./common.js";
import { acknowledgeIncident } from "./incidents.js";

type State = "ok" | "expired" | "used" | "acknowledged" | "resolved";
const limited = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };

async function lookup(tx: Tx, token: string): Promise<{ row: Row; state: State } | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const row = (await rows(tx, sql`
    SELECT t.token_hash, t.expires_at, t.used_at, p.user_id, u.display_name AS person, u.is_active, u.is_superadmin,
           i.id, i.tenant_id, i.number, i.title, i.title_parts, i.severity, i.entity_name, i.opened_at, i.status, a.display_name AS acknowledged_by
      FROM oncall_ack_tokens t JOIN oncall_pages p ON p.id = t.page_id JOIN incidents i ON i.id = p.incident_id
      JOIN users u ON u.id = p.user_id LEFT JOIN users a ON a.id = i.acknowledged_by
     WHERE t.token_hash = ${sha256(token)}`))[0];
  if (!row) return null;
  const state: State = row.status === "resolved" ? "resolved" : row.status === "acknowledged" ? "acknowledged"
    : row.used_at ? "used" : new Date(row.expires_at as string) < new Date() ? "expired" : "ok";
  return { row, state };
}

export const ackRoutes =
  ({ db, pool }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Params: { token: string } }>("/ack/:token", limited, async (req, reply) => {
      reply.header("cache-control", "no-store").header("referrer-policy", "no-referrer");
      const found = await withTenant(db, "all", (tx) => lookup(tx, req.params.token));
      if (!found) throw new HttpError(404, "not_found", "This link is not valid");
      const r = found.row;
      return {
        state: found.state, person: r.person as string, acknowledgedBy: (r.acknowledged_by as string) ?? null,
        incident: { id: r.id as string, key: incNo(r.number as number), title: r.title as string, titleParts: partsOf(r.title_parts) as MsgPart[] | null, severity: r.severity as string, entityName: r.entity_name as string, openedAt: new Date(r.opened_at as string).toISOString() },
      };
    });

    app.post<{ Params: { token: string } }>("/ack/:token", limited, async (req) => {
      const done = await withTenant(db, "all", async (tx) => {
        const found = await lookup(tx, req.params.token);
        if (!found) throw new HttpError(404, "not_found", "This link is not valid");
        const r = found.row;
        if (found.state === "resolved") throw new HttpError(409, "conflict", "This incident is already resolved");
        if (found.state === "acknowledged") throw new HttpError(409, "conflict", "Already acknowledged");
        if (found.state === "used") throw new HttpError(409, "conflict", "This link was already used");
        if (found.state === "expired") throw new HttpError(410, "expired", "This link has expired");
        // the same permission as the button: operators and administrators of that tenant
        const allowed = r.is_active && (r.is_superadmin || (await rows(tx, sql`SELECT 1 FROM user_tenant_roles WHERE user_id = ${r.user_id as string}::uuid
            AND ((tenant_id IS NULL AND role = 'infra-admin') OR (tenant_id = ${(r.tenant_id as string) ?? null}::uuid AND role IN ('tenant-admin', 'operator')))`)).length > 0);
        if (!allowed) throw new HttpError(403, "forbidden", "Your role cannot acknowledge incidents");
        // single use: claim the token first
        const claimed = await rows(tx, sql`UPDATE oncall_ack_tokens SET used_at = now() WHERE token_hash = ${r.token_hash as string} AND used_at IS NULL RETURNING 1`);
        if (!claimed.length) throw new HttpError(409, "conflict", "This link was already used");
        await acknowledgeIncident(tx, r, r.user_id as string, { via: "link" });
        return { incidentId: r.id as string, tenantId: (r.tenant_id as string) ?? null, userId: r.user_id as string };
      });
      await enqueueNotifications(pool, done.incidentId, "acknowledged");
      await audit(db, { userId: done.userId, tenantId: done.tenantId, action: "incident.acknowledged", entityType: "incident", entityId: done.incidentId, diff: { via: "acknowledge link" } });
      return { ok: true, incidentId: done.incidentId };
    });
  };
