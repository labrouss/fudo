/// <reference path="../net-snmp.d.ts" />
/**
 * SNMP sessions (v1, v2c, v3) as promises: get, column walks, and the value of a varbind. Used by
 * the SNMP check, the interface check and the interface finder.
 */
import snmp from "net-snmp";

const AUTH: Record<string, unknown> = { md5: snmp.AuthProtocols.md5, sha: snmp.AuthProtocols.sha, sha224: snmp.AuthProtocols.sha224, sha256: snmp.AuthProtocols.sha256, sha384: snmp.AuthProtocols.sha384, sha512: snmp.AuthProtocols.sha512 };
const PRIV: Record<string, unknown> = { des: snmp.PrivProtocols.des, aes: snmp.PrivProtocols.aes, aes256b: snmp.PrivProtocols.aes256b, aes256r: snmp.PrivProtocols.aes256r };
const LEVEL: Record<string, unknown> = { noAuthNoPriv: snmp.SecurityLevel.noAuthNoPriv, authNoPriv: snmp.SecurityLevel.authNoPriv, authPriv: snmp.SecurityLevel.authPriv };

export interface Varbind { oid: string; type: number; value: unknown }
export const TYPE = { Counter32: 65, Gauge32: 66, TimeTicks: 67, Counter64: 70 } as const;

export interface Session {
  get(oids: string[]): Promise<Varbind[]>;
  /** every row of a table column: index (the OID suffix) → value */
  column(base: string, maxRepetitions?: number): Promise<Map<string, Varbind>>;
  close(): void;
  version: "v1" | "v2c" | "v3";
}

export class SnmpError extends Error {
  constructor(message: string, readonly code: "timeout" | "error") { super(message); }
}

export function openSession(cfg: Record<string, unknown>, timeoutMs: number): Session {
  const version = cfg.version === "v1" ? "v1" : cfg.version === "v3" ? "v3" : "v2c";
  const options = { port: Number(cfg.port ?? 161), retries: 1, timeout: Math.max(1000, Math.floor(timeoutMs / 2)), version: version === "v1" ? snmp.Version1 : version === "v2c" ? snmp.Version2c : snmp.Version3 };
  const s = version === "v3"
    ? snmp.createV3Session(String(cfg.host), { name: String(cfg.user), level: LEVEL[String(cfg.level)], authProtocol: AUTH[String(cfg.authProtocol)], authKey: String(cfg.authKey ?? ""), privProtocol: PRIV[String(cfg.privProtocol)], privKey: String(cfg.privKey ?? "") } as never, options as never)
    : snmp.createSession(String(cfg.host), String(cfg.community), options as never);
  let failure: Error | null = null;
  s.on("error", (err: Error) => { failure = err; });
  const wrap = (err: Error) => (err.name === "RequestTimedOutError" ? new SnmpError(err.message, "timeout") : err);
  return {
    version,
    get: (oids) => new Promise((resolve, reject) => {
      if (failure) return reject(failure);
      s.get(oids, (err: Error | null, vbs: Varbind[]) => (err ? reject(wrap(err)) : resolve(vbs)));
    }),
    column: (base, maxRepetitions = 40) => new Promise((resolve, reject) => {
      if (failure) return reject(failure);
      const out = new Map<string, Varbind>();
      s.subtree(base, maxRepetitions, (vbs: Varbind[]) => {
        for (const vb of vbs) if (!snmp.isVarbindError(vb)) out.set(vb.oid.slice(base.length + 1), vb);
      }, (err: Error | null) => (err ? reject(wrap(err)) : resolve(out)));
    }),
    close: () => { try { s.close(); } catch { /* closed */ } },
  };
}

export const isError = (vb: Varbind | undefined) => !vb || snmp.isVarbindError(vb);
export const varbindError = (vb: Varbind) => String(snmp.varbindError(vb));

/** Text of a varbind (OCTET STRING as UTF-8, numbers as digits). */
export function text(vb: Varbind | undefined): string {
  if (!vb || isError(vb)) return "";
  const v = vb.value;
  if (Buffer.isBuffer(v)) return vb.type === TYPE.Counter64 ? String(counter(vb)) : v.toString("utf8").replace(/\0+$/, "");
  return String(v);
}

/** A counter or gauge as a BigInt (Counter64 arrives as a big-endian Buffer); null if missing. */
export function counter(vb: Varbind | undefined): bigint | null {
  if (!vb || isError(vb)) return null;
  const v = vb.value;
  if (Buffer.isBuffer(v)) { let n = 0n; for (const b of v) n = (n << 8n) | BigInt(b); return n; }
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === "bigint") return v;
  return null;
}
