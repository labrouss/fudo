/**
 * LDAP / Active Directory. "rootdse": the directory answers an anonymous read of the root DSE (every
 * domain controller allows it); on Active Directory, isSynchronized=FALSE (initial replication not
 * finished) counts as Degraded. "bind": an account signs in, optionally a search must return at
 * least N entries. Active Directory's sub-codes say why a sign-in failed (locked, expired, …).
 */
import { Client, type ClientOptions } from "ldapts";
import type { MsgPart } from "@fudo/shared";
import { down, elapsed, errorPart, result, withDegraded, type Runner } from "./types.js";

/** Active Directory puts the real reason for result 49 into the message ("data 775"). */
const AD_REASONS: Record<string, string> = { "775": "ldap.locked", "532": "ldap.passwordExpired", "773": "ldap.mustChangePassword", "533": "ldap.disabled", "701": "ldap.accountExpired", "530": "ldap.timeRestriction", "531": "ldap.workstationRestriction" };
export function bindFailure(err: unknown): MsgPart {
  const e = err as { code?: number; message?: string };
  const sub = /data ([0-9a-f]{3})/i.exec(e.message ?? "")?.[1]?.toLowerCase();
  if (sub && AD_REASONS[sub]) return [AD_REASONS[sub]!];
  if (e.code === 49) return ["ldap.invalidCredentials"];
  if (e.code === 53) return ["ldap.unwilling", { reason: (e.message ?? "").slice(0, 120) }];
  return ["ldap.bindFailed", { reason: (e.message ?? String(err)).slice(0, 160) }];
}
/** First value of an attribute; absent and empty (ldapts returns [] for missing ones) are null. */
export function attr(entry: Record<string, unknown>, name: string): string | null {
  const v = entry[name];
  const first = Array.isArray(v) ? v[0] : v;
  if (first === undefined || first === null) return null;
  const s = Buffer.isBuffer(first) ? first.toString("utf8") : String(first);
  return s === "" ? null : s;
}

/** Root DSE → result. Only Active Directory publishes isSynchronized; other servers are never Degraded for it. */
export function rootDseResult(entry: Record<string, unknown>, host: string, cfg: Record<string, unknown>, ms: number) {
  const server = attr(entry, "dnsHostName") ?? attr(entry, "vendorName") ?? host;
  const sync = attr(entry, "isSynchronized");
  if (cfg.adSync !== false && sync !== null && sync.toUpperCase() !== "TRUE") return result("DEGRADED", ms, [["ldap.notSynchronized", { server }]]);
  return result(withDegraded(ms, cfg.degradedLatencyMs) ? "DEGRADED" : "UP", ms, [["ldap.answers", { server }]]);
}

const isLdapError = (err: unknown) => typeof (err as { code?: unknown }).code === "number";

export const ldapRunner: Runner = async (cfg, ctx) => {
  const start = process.hrtime.bigint();
  const host = String(cfg.host), port = Number(cfg.port);
  const tlsOptions = { servername: /^[\d.:]+$/.test(host) ? undefined : host, rejectUnauthorized: !cfg.allowUntrusted };
  const opts: ClientOptions = {
    url: `${cfg.security === "ldaps" ? "ldaps" : "ldap"}://${host.includes(":") ? `[${host}]` : host}:${port}`,
    timeout: ctx.timeoutMs, connectTimeout: ctx.timeoutMs,
    ...(cfg.security === "ldaps" ? { tlsOptions } : {}),
  };
  const client = new Client(opts);
  try {
    if (cfg.security === "starttls") {
      try { await client.startTLS(tlsOptions); }
      catch (err) { return isLdapError(err) ? down([["ldap.starttls", { reason: String((err as Error).message).slice(0, 120) }]], elapsed(start)) : down([errorPart(err, ctx.timeoutMs)], elapsed(start)); }
    }
    if (cfg.check === "bind") {
      try { await client.bind(String(cfg.bindDn), String(cfg.password ?? "")); }
      catch (err) { return down([isLdapError(err) ? bindFailure(err) : errorPart(err, ctx.timeoutMs)], elapsed(start)); }
      const parts: MsgPart[] = [["ldap.signedIn", { account: String(cfg.bindDn) }]];
      let count: number | null = null;
      if (cfg.baseDn || cfg.filter) {
        try {
          const r = await client.search(String(cfg.baseDn ?? ""), { scope: "sub", filter: String(cfg.filter || "(objectClass=*)"), attributes: ["1.1"], sizeLimit: Math.max(1, Number(cfg.minResults ?? 1)) });
          count = r.searchEntries.length;
        } catch (err) {
          // a size limit reached means "at least that many": enough
          if ((err as { code?: number }).code === 4) count = Number(cfg.minResults ?? 1);
          else return down([isLdapError(err) ? ["ldap.searchFailed", { reason: String((err as Error).message).slice(0, 160) }] : errorPart(err, ctx.timeoutMs)], elapsed(start));
        }
        const min = Number(cfg.minResults ?? 1);
        if (count < min) return down([["ldap.tooFew", { count, min }]], elapsed(start), { entries: count });
        parts.push(["ldap.found", { count }]);
      }
      const ms = elapsed(start);
      return result(withDegraded(ms, cfg.degradedLatencyMs) ? "DEGRADED" : "UP", ms, parts, count === null ? undefined : { entries: count });
    }
    // root DSE: anonymous, base scope
    let entry: Record<string, unknown> | undefined;
    try {
      const r = await client.search("", { scope: "base", filter: "(objectClass=*)", attributes: ["dnsHostName", "isSynchronized", "isGlobalCatalogReady", "supportedLDAPVersion", "vendorName"] });
      entry = r.searchEntries[0];
    } catch (err) {
      return down([isLdapError(err) ? ["ldap.searchFailed", { reason: String((err as Error).message).slice(0, 160) }] : errorPart(err, ctx.timeoutMs)], elapsed(start));
    }
    const ms = elapsed(start);
    if (!entry) return down([["ldap.noRootDse"]], ms);
    return rootDseResult(entry, host, cfg, ms);
  } catch (err) {
    return down([errorPart(err, ctx.timeoutMs)], elapsed(start));
  } finally {
    await client.unbind().catch(() => {});
  }
};
