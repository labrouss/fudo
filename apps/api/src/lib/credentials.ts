/**
 * Shared credentials on the API side: loading one for a monitor (same scope, compatible kind) and
 * the config a monitor is validated and stored with when it uses one.
 */
import { sql } from "drizzle-orm";
import type { Tx } from "@fudo/db";
import { applyCredential, canUseCredential, credentialOf, openCredentialSecrets, stripCredential } from "@fudo/monitors/credentials";
import { HttpError } from "./errors.js";

type Row = Record<string, unknown>;
export interface OpenCredential { id: string; name: string; kind: string; fields: Record<string, unknown>; secrets: Record<string, string> }

const fieldError = (message: string) => new HttpError(400, "validation_failed", "Check the highlighted fields", { credentialId: message });

/** A credential a monitor of `type` in `tenantId` may use, opened; a form error otherwise. */
export async function credentialFor(tx: Tx, id: string, tenantId: string | null, type: string, appSecret: string): Promise<OpenCredential> {
  const row = (await tx.execute(sql`SELECT id, tenant_id, name, kind, fields, secrets_enc FROM credentials WHERE id = ${id}::uuid`)).rows[0] as Row | undefined;
  // same scope only: a tenant must not point a monitor of its own at a global (or another tenant's) secret
  if (!row || (row.tenant_id ?? null) !== tenantId) throw fieldError("Choose a credential from this scope");
  if (!canUseCredential(type, row.kind as string)) throw fieldError("This credential cannot be used by this monitor type");
  let secrets: Record<string, string>;
  try { secrets = openCredentialSecrets(row.secrets_enc as string, appSecret); }
  catch { throw fieldError("This credential cannot be read (was APP_SECRET changed?)"); }
  return { id: row.id as string, name: row.name as string, kind: row.kind as string, fields: (row.fields as Record<string, unknown>) ?? {}, secrets };
}

/** For validation: the monitor's config as its check will see it. */
export const withCredential = (type: string, cfg: Record<string, unknown>, cred: OpenCredential) => applyCredential(type, cfg, cred);
/** For storage: without what the credential supplies. */
export const withoutCredential = (type: string, cred: OpenCredential, cfg: Record<string, unknown>) => stripCredential(type, cred.kind, cfg);

/**
 * A monitor that stops using a credential needs its own secret again (secrets are optional in the
 * monitor forms, so an empty one would otherwise be saved silently).
 */
export function ownSecretMissing(type: string, cfg: Record<string, unknown>): Record<string, string> | null {
  if (credentialOf(type, cfg) || type === "snmp-trap") return null; // a trap monitor's community is optional
  if (type === "snmp" || type === "snmp-interface") return cfg.version === "v3" ? { "config.authKey": "Enter the auth password" } : { "config.community": "Enter the community" };
  if (type === "ssh" && cfg.authMethod === "key") return { "config.privateKey": "Paste the private key" };
  return { "config.password": "Enter the password" };
}
