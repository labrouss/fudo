/**
 * Teams (per tenant, or global for shared infrastructure) and the owner teams of applications and
 * assets. A team's members must be able to see its scope, so a team never widens access.
 */
import type { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@fudo/db";
import { ownerSchema, teamSchema, type OwnerDto, type TeamDto } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { conflict, HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { notifyGraph, tenantScope } from "../lib/tenant-scope.js";
import { assertOwned, notFound, rows } from "./common.js";
import { onCallNow } from "./oncall.js";

const isUniqueViolation = (e: unknown) => { const x = e as { code?: string; cause?: { code?: string } }; return x?.code === "23505" || x?.cause?.code === "23505"; };

/** People who may be in a team of this scope: everyone who can see it. */
export async function teamCandidates(tx: Tx, tenantId: string | null) {
  return rows(tx, tenantId
    ? sql`SELECT u.id, u.display_name AS name, u.email FROM users u WHERE u.is_active AND (u.is_superadmin
            OR EXISTS (SELECT 1 FROM user_tenant_roles r WHERE r.user_id = u.id AND (r.tenant_id = ${tenantId}::uuid OR (r.tenant_id IS NULL AND r.role = 'infra-admin'))))
          ORDER BY u.display_name`
    : sql`SELECT u.id, u.display_name AS name, u.email FROM users u WHERE u.is_active AND (u.is_superadmin
            OR EXISTS (SELECT 1 FROM user_tenant_roles r WHERE r.user_id = u.id AND r.tenant_id IS NULL))
          ORDER BY u.display_name`);
}

/** The team owning an item; a monitor follows its asset, else an application it belongs to. */
export async function ownerOf(tx: Tx, type: string, id: string): Promise<OwnerDto | null> {
  let row: Record<string, unknown> | undefined;
  if (type === "application" || type === "asset") {
    row = (await rows(tx, sql`SELECT owner_team_id AS team_id, NULL AS via_type, NULL AS via_name FROM ${sql.raw(type === "application" ? "applications" : "assets")} WHERE id = ${id}::uuid`))[0];
  } else if (type === "monitor") {
    row = (await rows(tx, sql`
      SELECT coalesce(a.owner_team_id, ap.owner_team_id) AS team_id,
             CASE WHEN a.owner_team_id IS NOT NULL THEN 'asset' WHEN ap.owner_team_id IS NOT NULL THEN 'application' END AS via_type,
             CASE WHEN a.owner_team_id IS NOT NULL THEN a.name ELSE ap.name END AS via_name
        FROM monitors m
        LEFT JOIN assets a ON a.id = m.asset_id
        LEFT JOIN LATERAL (SELECT ap.owner_team_id, ap.name FROM application_members am JOIN applications ap ON ap.id = am.application_id
                            WHERE am.monitor_id = m.id AND ap.owner_team_id IS NOT NULL ORDER BY am.required DESC, ap.name LIMIT 1) ap ON true
       WHERE m.id = ${id}::uuid`))[0];
  }
  if (!row?.team_id) return null;
  const team = (await rows(tx, sql`SELECT t.id, t.name,
      coalesce(array_agg(u.display_name ORDER BY u.display_name) FILTER (WHERE m.role = 'lead'), '{}') AS leads,
      coalesce(array_agg(u.display_name ORDER BY u.display_name) FILTER (WHERE m.role = 'member'), '{}') AS members
    FROM teams t LEFT JOIN team_members m ON m.team_id = t.id LEFT JOIN users u ON u.id = m.user_id
    WHERE t.id = ${row.team_id as string}::uuid GROUP BY t.id`))[0];
  if (!team) return null;
  return { teamId: team.id as string, team: team.name as string, leads: team.leads as string[], members: team.members as string[], via: row.via_type ? { type: row.via_type as "asset", name: row.via_name as string } : null };
}

export const teamRoutes =
  ({ db, pool }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get("/teams", async (req): Promise<TeamDto[]> => {
      const scope = await tenantScope(req, db);
      return withTenant(db, scope.scopeId, async (tx) => {
        const teams = await rows(tx, sql`SELECT * FROM teams WHERE tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid OR (tenant_id IS NULL AND ${scope.tenantId}::uuid IS NOT NULL) ORDER BY tenant_id NULLS LAST, name`);
        const members = await rows(tx, sql`SELECT m.team_id, m.user_id, m.role, u.display_name AS name, u.email FROM team_members m JOIN users u ON u.id = m.user_id ORDER BY m.role DESC, u.display_name`);
        const owns = await rows(tx, sql`SELECT 'application' AS type, id, name, owner_team_id FROM applications WHERE owner_team_id IS NOT NULL
                                        UNION ALL SELECT 'asset', id, name, owner_team_id FROM assets WHERE owner_team_id IS NOT NULL ORDER BY name`);
        const list: TeamDto[] = teams.map((t) => ({
          id: t.id as string, scope: t.tenant_id ? "tenant" : "global", name: t.name as string, description: t.description as string,
          members: members.filter((m) => m.team_id === t.id).map((m) => ({ userId: m.user_id as string, name: m.name as string, email: m.email as string, role: m.role as "lead" })),
          owns: owns.filter((o) => o.owner_team_id === t.id).map((o) => ({ type: o.type as "asset", id: o.id as string, name: o.name as string })),
          onCall: null,
        }));
        // one query at a time on this transaction's connection
        for (const x of list) x.onCall = await onCallNow(tx, x.id);
        return list;
      });
    });

    app.get("/teams/candidates", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      return withTenant(db, scope.scopeId, (tx) => teamCandidates(tx, scope.tenantId));
    });

    async function save(req: Parameters<typeof tenantScope>[0], id: string | null) {
      const scope = await tenantScope(req, db, "manage");
      const input = parse(teamSchema, req.body);
      try {
        const teamId = await withTenant(db, scope.scopeId, async (tx) => {
          const allowed = new Set((await teamCandidates(tx, scope.tenantId)).map((u) => u.id as string));
          if (input.members.some((m) => !allowed.has(m.userId))) throw new HttpError(400, "validation_failed", "Only people with access to this scope can be members");
          let tid = id;
          if (tid) {
            const r = (await rows(tx, sql`SELECT tenant_id FROM teams WHERE id = ${tid}`))[0];
            if (!r) throw notFound("Team");
            assertOwned(r, scope.tenantId, "This team");
            await tx.execute(sql`UPDATE teams SET name = ${input.name}, description = ${input.description} WHERE id = ${tid}`);
            await tx.execute(sql`DELETE FROM team_members WHERE team_id = ${tid}`);
          } else {
            tid = (await rows(tx, sql`INSERT INTO teams (tenant_id, name, description) VALUES (${scope.tenantId}::uuid, ${input.name}, ${input.description}) RETURNING id`))[0]!.id as string;
          }
          for (const m of new Map(input.members.map((x) => [x.userId, x])).values()) {
            await tx.execute(sql`INSERT INTO team_members (team_id, user_id, tenant_id, role) VALUES (${tid}, ${m.userId}, ${scope.tenantId}::uuid, ${m.role})`);
          }
          return tid;
        });
        await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: id ? "team.updated" : "team.created", entityType: "team", entityId: teamId, diff: { name: input.name, members: input.members.length } });
        return teamId;
      } catch (e) {
        if (isUniqueViolation(e)) throw conflict("A team with this name already exists here");
        throw e;
      }
    }
    app.post("/teams", async (req, reply) => { const id = await save(req, null); reply.code(201); return { id }; });
    app.put<{ Params: { id: string } }>("/teams/:id", async (req) => { await save(req, req.params.id); return { ok: true }; });
    app.delete<{ Params: { id: string } }>("/teams/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      await withTenant(db, scope.scopeId, async (tx) => {
        const r = (await rows(tx, sql`SELECT tenant_id FROM teams WHERE id = ${req.params.id}`))[0];
        if (!r) throw notFound("Team");
        assertOwned(r, scope.tenantId, "This team");
        await tx.execute(sql`DELETE FROM teams WHERE id = ${req.params.id}`); // owned items keep working, without an owner
      });
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "team.deleted", entityType: "team", entityId: req.params.id });
      return { ok: true };
    });

    /* owner team of an application or asset */
    app.get<{ Params: { type: string; id: string } }>("/ownership/:type/:id", async (req) => {
      const scope = await tenantScope(req, db);
      if (req.params.type !== "application" && req.params.type !== "asset") throw notFound("Item");
      return withTenant(db, scope.scopeId, async (tx) => {
        const item = (await rows(tx, sql`SELECT tenant_id FROM ${sql.raw(req.params.type === "application" ? "applications" : "assets")} WHERE id = ${req.params.id}::uuid`))[0];
        if (!item) throw notFound("Item");
        // tenant items: that tenant's teams; shared infrastructure: global teams
        const options = await rows(tx, sql`SELECT id, name FROM teams WHERE tenant_id IS NOT DISTINCT FROM ${item.tenant_id as string | null}::uuid ORDER BY name`);
        return { owner: await ownerOf(tx, req.params.type, req.params.id), options, editable: (item.tenant_id ?? null) === scope.tenantId };
      });
    });
    app.put<{ Params: { type: string; id: string } }>("/ownership/:type/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      const { teamId } = parse(ownerSchema, req.body);
      const table = req.params.type === "application" ? "applications" : req.params.type === "asset" ? "assets" : null;
      if (!table) throw notFound("Item");
      await withTenant(db, scope.scopeId, async (tx) => {
        const item = (await rows(tx, sql`SELECT tenant_id FROM ${sql.raw(table)} WHERE id = ${req.params.id}::uuid`))[0];
        if (!item) throw notFound("Item");
        assertOwned(item, scope.tenantId, req.params.type === "application" ? "This application" : "This asset");
        if (teamId) {
          const t = (await rows(tx, sql`SELECT tenant_id FROM teams WHERE id = ${teamId}::uuid`))[0];
          if (!t || (t.tenant_id ?? null) !== (item.tenant_id ?? null)) throw new HttpError(400, "validation_failed", "Choose a team of the same scope");
        }
        await tx.execute(sql`UPDATE ${sql.raw(table)} SET owner_team_id = ${teamId}::uuid WHERE id = ${req.params.id}::uuid`);
      });
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "ownership.changed", entityType: req.params.type, entityId: req.params.id, diff: { teamId } });
      return { ok: true };
    });
  };
