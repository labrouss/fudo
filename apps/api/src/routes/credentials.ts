/**
 * Shared credentials of a scope. Secret values are write-only: stored encrypted, never returned.
 * Changing a credential applies to every monitor that uses it at its next check; a credential in use
 * cannot be deleted. The duplicate finder groups monitors that already store the same account and
 * password, and turns a group into a shared credential without the secret leaving the server.
 */
import type { FastifyPluginAsync } from "fastify";
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "@fudo/db";
import { issueMessage } from "@fudo/shared";
import { SECRET_PLACEHOLDER } from "@fudo/monitors/definitions";
import { openConfig, sealConfig } from "@fudo/monitors/secrets";
import { CREDENTIAL_KINDS, canUseCredential, credentialOf, credentialSecretKeys, getCredentialKind, missingSecrets, openCredentialSecrets, sealCredentialSecrets, stripCredential } from "@fudo/monitors/credentials";
import type { AppDeps } from "../server.js";
import { conflict, HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { notifyGraph, tenantScope } from "../lib/tenant-scope.js";
import { assertOwned, notFound, rows } from "./common.js";

type Row = Record<string, unknown>;
const isUnique = (e: unknown) => { const x = e as { code?: string; cause?: { code?: string } }; return x?.code === "23505" || x?.cause?.code === "23505"; };

const bodySchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(80),
  kind: z.enum(CREDENTIAL_KINDS, { message: "Choose a kind" }),
  description: z.string().trim().max(300).optional().default(""),
  /** fields and secrets together; a secret left empty (or the placeholder) keeps its stored value */
  values: z.record(z.string(), z.unknown()).default({}),
});
const idsSchema = z.object({ monitorIds: z.array(z.string().uuid()).min(1, "Choose at least one monitor").max(1000) });
const fromSchema = idsSchema.extend({ name: z.string().trim().min(2, "Enter a name").max(80), description: z.string().trim().max(300).optional().default("") });

/** Validated fields and secrets of a credential; `stored` are the current secrets on an update. */
function parseValues(kind: string, values: Record<string, unknown>, stored: Record<string, string> | null) {
  const def = getCredentialKind(kind)!;
  const secretKeys = credentialSecretKeys(kind);
  const merged: Record<string, unknown> = { ...values };
  for (const k of secretKeys) if (merged[k] === undefined || merged[k] === "" || merged[k] === SECRET_PLACEHOLDER) merged[k] = stored?.[k] ?? "";
  const r = def.schema.safeParse(merged);
  const errors: Record<string, string> = {};
  if (!r.success) for (const i of r.error.issues) errors[`values.${i.path.join(".")}`] ??= issueMessage(i);
  if (r.success) {
    const fields = Object.fromEntries(Object.entries(r.data).filter(([k]) => !secretKeys.includes(k)));
    const secrets = Object.fromEntries(secretKeys.map((k) => [k, String(r.data[k] ?? "")]));
    for (const [k, m] of Object.entries(missingSecrets(kind, fields, secrets))) errors[`values.${k}`] ??= m;
    if (!Object.keys(errors).length) return { fields, secrets };
  }
  throw new HttpError(400, "validation_failed", "Check the highlighted fields", errors);
}

/** Attaches monitors to a credential: compatible ones of the same scope; their own secrets are removed. */
async function attach(tx: Tx, cred: Row, monitorIds: string[], appSecret: string) {
  const mons = await rows(tx, sql`SELECT id, name, type, config, tenant_id FROM monitors WHERE id IN (${sql.join(monitorIds.map((i) => sql`${i}::uuid`), sql`, `)})`);
  const attached: string[] = [], skipped: Array<{ id: string; name: string; reason: string }> = [];
  for (const m of mons) {
    if ((m.tenant_id ?? null) !== (cred.tenant_id ?? null)) { skipped.push({ id: m.id as string, name: m.name as string, reason: "other_scope" }); continue; }
    if (!canUseCredential(m.type as string, cred.kind as string)) { skipped.push({ id: m.id as string, name: m.name as string, reason: "incompatible" }); continue; }
    const own = openConfig(m.type as string, m.config as Record<string, unknown>, appSecret);
    const cfg = sealConfig(m.type as string, stripCredential(m.type as string, cred.kind as string, own), appSecret);
    await tx.execute(sql`UPDATE monitors SET credential_id = ${cred.id as string}::uuid, config = ${JSON.stringify(cfg)}::jsonb, next_run_at = now(), updated_at = now() WHERE id = ${m.id as string}`);
    attached.push(m.id as string);
  }
  return { attached, skipped };
}

export const credentialRoutes =
  ({ db, pool, env }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const own = (tenantId: string | null) => sql`tenant_id IS NOT DISTINCT FROM ${tenantId}::uuid`;
    async function load(tx: Tx, id: string, tenantId: string | null) {
      const r = (await rows(tx, sql`SELECT * FROM credentials WHERE id = ${id}::uuid`))[0];
      if (!r) throw notFound("Credential");
      assertOwned(r, tenantId, "This credential");
      return r;
    }

    app.get("/credentials", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      return withTenant(db, scope.scopeId, async (tx) => {
        const list = await rows(tx, sql`SELECT c.*, u.display_name AS updated_by_name FROM credentials c LEFT JOIN users u ON u.id = c.updated_by WHERE c.tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid ORDER BY lower(c.name)`);
        const users = await rows(tx, sql`SELECT id, name, type, credential_id FROM monitors WHERE credential_id IS NOT NULL AND ${own(scope.tenantId)} ORDER BY lower(name)`);
        return list.map((c) => {
          const def = getCredentialKind(c.kind as string);
          let set: string[] = [];
          try { const s = openCredentialSecrets(c.secrets_enc as string, env.APP_SECRET); set = Object.keys(s).filter((k) => s[k]); } catch { /* shown as not readable */ }
          return {
            id: c.id as string, name: c.name as string, kind: c.kind as string, description: c.description as string,
            fields: c.fields as Record<string, unknown>, account: def?.account(c.fields as Record<string, unknown>) ?? "", secretsSet: set,
            usedBy: users.filter((m) => m.credential_id === c.id).map((m) => ({ id: m.id as string, name: m.name as string, type: m.type as string })),
            updatedAt: new Date(c.updated_at as string).toISOString(), updatedBy: (c.updated_by_name as string) ?? null,
          };
        });
      });
    });

    app.post("/credentials", async (req, reply) => {
      const scope = await tenantScope(req, db, "manage");
      const b = parse(bodySchema, req.body);
      const v = parseValues(b.kind, b.values, null);
      try {
        const id = await withTenant(db, scope.scopeId, async (tx) => (await rows(tx, sql`
          INSERT INTO credentials (tenant_id, name, kind, description, fields, secrets_enc, updated_by)
          VALUES (${scope.tenantId}::uuid, ${b.name}, ${b.kind}, ${b.description}, ${JSON.stringify(v.fields)}::jsonb, ${sealCredentialSecrets(v.secrets, env.APP_SECRET)}, ${scope.userId}) RETURNING id`))[0]!.id as string);
        await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "credential.created", entityType: "credential", entityId: id, diff: { name: b.name, kind: b.kind, account: getCredentialKind(b.kind)!.account(v.fields) } });
        reply.code(201);
        return { id };
      } catch (e) { if (isUnique(e)) throw conflict("A credential with this name already exists here"); throw e; }
    });

    app.put<{ Params: { id: string } }>("/credentials/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      const b = parse(bodySchema, req.body);
      let rotated: string[] = [], usedBy = 0;
      try {
        await withTenant(db, scope.scopeId, async (tx) => {
          const cur = await load(tx, req.params.id, scope.tenantId);
          usedBy = Number((await rows(tx, sql`SELECT count(*) AS n FROM monitors WHERE credential_id = ${req.params.id}::uuid`))[0]!.n);
          if (b.kind !== cur.kind && usedBy > 0) throw new HttpError(400, "validation_failed", "Check the highlighted fields", { kind: "The kind cannot change while monitors use this credential" });
          const stored = b.kind === cur.kind ? openCredentialSecrets(cur.secrets_enc as string, env.APP_SECRET) : null;
          const v = parseValues(b.kind, b.values, stored);
          rotated = Object.keys(v.secrets).filter((k) => v.secrets[k] !== (stored?.[k] ?? ""));
          await tx.execute(sql`UPDATE credentials SET name = ${b.name}, kind = ${b.kind}, description = ${b.description}, fields = ${JSON.stringify(v.fields)}::jsonb,
            secrets_enc = ${sealCredentialSecrets(v.secrets, env.APP_SECRET)}, updated_at = now(), updated_by = ${scope.userId} WHERE id = ${req.params.id}::uuid`);
          // the monitors using it check again now, with the new values
          await tx.execute(sql`UPDATE monitors SET next_run_at = now() WHERE credential_id = ${req.params.id}::uuid`);
        });
      } catch (e) { if (isUnique(e)) throw conflict("A credential with this name already exists here"); throw e; }
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "credential.updated", entityType: "credential", entityId: req.params.id, diff: { name: b.name, changedSecrets: rotated, monitors: usedBy } });
      return { ok: true, monitors: usedBy };
    });

    app.delete<{ Params: { id: string } }>("/credentials/:id", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      const name = await withTenant(db, scope.scopeId, async (tx) => {
        const cur = await load(tx, req.params.id, scope.tenantId);
        const n = Number((await rows(tx, sql`SELECT count(*) AS n FROM monitors WHERE credential_id = ${req.params.id}::uuid`))[0]!.n);
        if (n > 0) throw conflict("Monitors use this credential: give them another one first");
        await tx.execute(sql`DELETE FROM credentials WHERE id = ${req.params.id}::uuid`);
        return cur.name as string;
      });
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "credential.deleted", entityType: "credential", entityId: req.params.id, diff: { name } });
      return { ok: true };
    });

    app.post<{ Params: { id: string } }>("/credentials/:id/attach", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      const { monitorIds } = parse(idsSchema, req.body);
      const r = await withTenant(db, scope.scopeId, async (tx) => attach(tx, await load(tx, req.params.id, scope.tenantId), monitorIds, env.APP_SECRET));
      await notifyGraph(pool);
      await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "credential.attached", entityType: "credential", entityId: req.params.id, diff: { monitors: r.attached.length } });
      return r;
    });

    /** Monitors of this scope that store the same account and secret, in groups of two or more. */
    app.get("/credentials/suggestions", async (req) => {
      const scope = await tenantScope(req, db, "manage");
      return withTenant(db, scope.scopeId, async (tx) => {
        const mons = await rows(tx, sql`SELECT id, name, type, config FROM monitors WHERE credential_id IS NULL AND ${own(scope.tenantId)} ORDER BY lower(name)`);
        const groups = new Map<string, { kind: string; account: string; monitors: Array<{ id: string; name: string; type: string }> }>();
        for (const m of mons) {
          let c;
          try { c = credentialOf(m.type as string, openConfig(m.type as string, m.config as Record<string, unknown>, env.APP_SECRET)); } catch { continue; }
          if (!c) continue;
          // grouped by a keyed hash: the secret itself never leaves this function
          const key = createHmac("sha256", env.APP_SECRET).update(JSON.stringify([c.kind, c.fields, c.secrets])).digest("hex").slice(0, 32);
          const g = groups.get(key) ?? { kind: c.kind, account: getCredentialKind(c.kind)!.account(c.fields), monitors: [] };
          g.monitors.push({ id: m.id as string, name: m.name as string, type: m.type as string });
          groups.set(key, g);
        }
        return [...groups.values()].filter((g) => g.monitors.length >= 2).sort((a, b) => b.monitors.length - a.monitors.length);
      });
    });

    /** A shared credential from monitors that store the same account and secret (copied on the server). */
    app.post("/credentials/from-monitors", async (req, reply) => {
      const scope = await tenantScope(req, db, "manage");
      const b = parse(fromSchema, req.body);
      try {
        const out = await withTenant(db, scope.scopeId, async (tx) => {
          const mons = await rows(tx, sql`SELECT id, type, config, tenant_id, credential_id FROM monitors WHERE id IN (${sql.join(b.monitorIds.map((i) => sql`${i}::uuid`), sql`, `)})`);
          if (mons.length !== new Set(b.monitorIds).size || mons.some((m) => (m.tenant_id ?? null) !== scope.tenantId || m.credential_id)) throw new HttpError(400, "validation_failed", "Choose monitors of this scope that use their own account");
          const found = mons.map((m) => credentialOf(m.type as string, openConfig(m.type as string, m.config as Record<string, unknown>, env.APP_SECRET)));
          const first = found[0];
          if (!first || found.some((c) => !c || JSON.stringify([c.kind, c.fields, c.secrets]) !== JSON.stringify([first.kind, first.fields, first.secrets]))) throw new HttpError(400, "validation_failed", "These monitors do not all use the same account and password");
          const id = (await rows(tx, sql`INSERT INTO credentials (tenant_id, name, kind, description, fields, secrets_enc, updated_by)
            VALUES (${scope.tenantId}::uuid, ${b.name}, ${first.kind}, ${b.description}, ${JSON.stringify(first.fields)}::jsonb, ${sealCredentialSecrets(first.secrets, env.APP_SECRET)}, ${scope.userId}) RETURNING id`))[0]!.id as string;
          const cred = (await rows(tx, sql`SELECT * FROM credentials WHERE id = ${id}::uuid`))[0]!;
          const r = await attach(tx, cred, b.monitorIds, env.APP_SECRET);
          return { id, kind: first.kind, account: getCredentialKind(first.kind)!.account(first.fields), attached: r.attached.length };
        });
        await notifyGraph(pool);
        await audit(db, { userId: scope.userId, tenantId: scope.tenantId, action: "credential.created", entityType: "credential", entityId: out.id, diff: { name: b.name, kind: out.kind, account: out.account, fromMonitors: out.attached } });
        reply.code(201);
        return out;
      } catch (e) { if (isUnique(e)) throw conflict("A credential with this name already exists here"); throw e; }
    });
  };
