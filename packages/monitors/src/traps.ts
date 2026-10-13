/**
 * SNMP traps (v1, v2c): reading a trap (its OID, fields and the interface it is about), the names
 * of the standard traps and fields, and what a trap monitor does with a trap: open a problem,
 * clear problems, or nothing. Used by the worker's receiver, the trap monitor's check and the API.
 */

/** Standard traps (SNMPv2-MIB / IF-MIB; v1 generic traps map onto these, RFC 3584). */
export const STANDARD_TRAPS: Record<string, string> = {
  "1.3.6.1.6.3.1.1.5.1": "coldStart",
  "1.3.6.1.6.3.1.1.5.2": "warmStart",
  "1.3.6.1.6.3.1.1.5.3": "linkDown",
  "1.3.6.1.6.3.1.1.5.4": "linkUp",
  "1.3.6.1.6.3.1.1.5.5": "authenticationFailure",
  "1.3.6.1.6.3.1.1.5.6": "egpNeighborLoss",
};
const BY_NAME = Object.fromEntries(Object.entries(STANDARD_TRAPS).map(([oid, n]) => [n.toLowerCase(), oid]));
/** The traps a "standard" trap monitor reports as problems (linkUp only clears). */
export const STANDARD_PROBLEMS = ["linkDown", "coldStart", "warmStart", "authenticationFailure"];

/** Field (varbind) names for display: column OIDs; the instance is appended (ifDescr.12). */
const FIELD_NAMES: Array<[string, string]> = [
  ["1.3.6.1.2.1.1.3", "sysUpTime"], ["1.3.6.1.2.1.1.5", "sysName"], ["1.3.6.1.2.1.1.1", "sysDescr"],
  ["1.3.6.1.6.3.1.1.4.1", "snmpTrapOID"], ["1.3.6.1.6.3.1.1.4.3", "snmpTrapEnterprise"],
  ["1.3.6.1.6.3.18.1.3", "snmpTrapAddress"], ["1.3.6.1.6.3.18.1.4", "snmpTrapCommunity"],
  ["1.3.6.1.2.1.2.2.1.1", "ifIndex"], ["1.3.6.1.2.1.2.2.1.2", "ifDescr"], ["1.3.6.1.2.1.2.2.1.3", "ifType"],
  ["1.3.6.1.2.1.2.2.1.7", "ifAdminStatus"], ["1.3.6.1.2.1.2.2.1.8", "ifOperStatus"],
  ["1.3.6.1.2.1.31.1.1.1.1", "ifName"], ["1.3.6.1.2.1.31.1.1.1.18", "ifAlias"],
];
const SYS_UPTIME = "1.3.6.1.2.1.1.3.0", TRAP_OID = "1.3.6.1.6.3.1.1.4.1.0", TRAP_ADDRESS = "1.3.6.1.6.3.18.1.3.0", TRAP_COMMUNITY = "1.3.6.1.6.3.18.1.4.0";

export interface TrapField { oid: string; name: string | null; value: string }
export interface Trap {
  version: "v1" | "v2c";
  /** the device that sent it (a relay's snmpTrapAddress, else the packet's source) */
  source: string;
  community: string | null;
  oid: string;
  name: string | null;
  fields: TrapField[];
}

/** Name of a field OID with its instance (ifDescr.12), or null for unknown OIDs. */
export function fieldName(oid: string): string | null {
  for (const [base, name] of FIELD_NAMES) if (oid === base || oid.startsWith(`${base}.`)) return name + oid.slice(base.length);
  return null;
}
/** A trap's name: standard, or null (shown as its OID). */
export const trapName = (oid: string) => STANDARD_TRAPS[oid] ?? null;

/** "linkDown", "1.3.6.1.4.1.232.0.6022", ".1.3.6…" → OID (null if neither). */
export function toOid(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\.?\d+(\.\d+)+$/.test(t)) return t.replace(/^\./, "");
  return BY_NAME[t.toLowerCase()] ?? null;
}
/** A list of trap names or OIDs (one per line, or separated by commas or spaces). */
export const oidList = (s: unknown) => String(s ?? "").split(/[\s,;]+/).map(toOid).filter((o): o is string => !!o);
export const badOids = (s: unknown) => String(s ?? "").split(/[\s,;]+/).filter((x) => x.trim() && !toOid(x));

interface RawVarbind { oid: string; type: number; value: unknown }
/** A varbind's value as text: printable strings as text, other bytes as hex. */
export function valueText(vb: RawVarbind): string {
  const v = vb.value;
  if (Buffer.isBuffer(v)) {
    if (vb.type === 70) { let n = 0n; for (const b of v) n = (n << 8n) | BigInt(b); return String(n); } // Counter64
    const s = v.toString("utf8").replace(/\0+$/, "");
    return /^[\x20-\x7e -￿\t\r\n]*$/.test(s) && !s.includes("�") ? s : v.toString("hex").replace(/(..)(?!$)/g, "$1:");
  }
  return v === null || v === undefined ? "" : String(v);
}

/** A received PDU (net-snmp receiver) as a Trap. v1 traps are converted to their v2 OID (RFC 3584). */
export function readTrap(pdu: Record<string, any>, rinfo: { address: string }): Trap {
  const varbinds = (pdu.varbinds ?? []) as RawVarbind[];
  const v1 = pdu.type === 164 || pdu.generic !== undefined; // Trap-PDU (v1)
  let oid: string;
  if (v1) {
    const generic = Number(pdu.generic), enterprise = String(pdu.enterprise ?? "").replace(/^\./, "");
    oid = generic >= 0 && generic <= 5 ? `1.3.6.1.6.3.1.1.5.${generic + 1}` : `${enterprise}.0.${Number(pdu.specific ?? 0)}`;
  } else {
    const t = varbinds.find((vb) => vb.oid === TRAP_OID);
    oid = t ? String(t.value).replace(/^\./, "") : "0.0";
  }
  const relay = varbinds.find((vb) => vb.oid === TRAP_ADDRESS);
  const address = String(rinfo.address ?? "").replace(/^::ffff:/, "");
  const source = relay && typeof relay.value === "string" && relay.value ? relay.value : v1 && pdu.agentAddr && pdu.agentAddr !== "0.0.0.0" && pdu.agentAddr !== "127.0.0.1" ? String(pdu.agentAddr) : address;
  // a relay's copy of the community is never kept
  const fields = varbinds.filter((vb) => ![SYS_UPTIME, TRAP_OID, TRAP_ADDRESS, TRAP_COMMUNITY].includes(vb.oid))
    .map((vb) => ({ oid: vb.oid, name: fieldName(vb.oid), value: valueText(vb).slice(0, 2000) })).slice(0, 60);
  return { version: v1 ? "v1" : "v2c", source, community: typeof pdu.community === "string" ? pdu.community : null, oid, name: trapName(oid), fields };
}

/** The interface a trap is about: ifIndex (its value, or the instance of an interface field). */
export function trapIfIndex(t: Pick<Trap, "fields">): string | null {
  const ix = t.fields.find((f) => f.name?.startsWith("ifIndex"));
  if (ix && /^\d+$/.test(ix.value)) return ix.value;
  const inst = t.fields.find((f) => f.name && /^if(Descr|Name|Alias|OperStatus|AdminStatus|Type)\.\d+$/.test(f.name));
  return inst ? inst.name!.split(".").pop()! : null;
}

/** Short text of what a trap is about: the interface, else its first fields. */
export function trapDetail(t: Pick<Trap, "fields">): string {
  const ix = trapIfIndex(t);
  if (ix) {
    const label = t.fields.find((f) => f.name === `ifName.${ix}`)?.value || t.fields.find((f) => f.name === `ifDescr.${ix}`)?.value;
    const alias = t.fields.find((f) => f.name === `ifAlias.${ix}`)?.value;
    return `${label || `ifIndex ${ix}`}${alias ? ` (${alias})` : ""}`;
  }
  const s = t.fields.slice(0, 3).map((f) => `${f.name ?? f.oid} = ${f.value}`).join(", ");
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}
export const trapLabel = (t: Pick<Trap, "oid" | "name">) => t.name ?? t.oid;

/** What a trap monitor does with a trap (its config is the monitor's, credentials applied). */
export type TrapDecision =
  | { kind: "problem"; key: string }
  | { kind: "clear"; keys: string[] | "all"; ifIndex: string | null }
  | null;

const textOf = (t: Trap) => [t.name ?? "", t.oid, ...t.fields.flatMap((f) => [f.name ?? "", f.value])].join("\n").toLowerCase();
const matchesOid = (oid: string, prefixes: string[]) => prefixes.some((p) => oid === p || oid.startsWith(`${p}.`));

export function decide(cfg: Record<string, unknown>, t: Trap): TrapDecision {
  const ifIndex = trapIfIndex(t);
  const clears = oidList(cfg.clearOids);
  // linkUp clears linkDown of the same interface; listed "clear" traps clear the same interface, or everything
  if (t.name === "linkUp") return { kind: "clear", keys: ifIndex ? [`linkDown#${ifIndex}`] : ["linkDown"], ifIndex };
  if (clears.length && matchesOid(t.oid, clears)) return { kind: "clear", keys: "all", ifIndex };
  const mode = String(cfg.match ?? "standard");
  const ok = mode === "any" ? true : mode === "standard" ? STANDARD_PROBLEMS.includes(t.name ?? "") : matchesOid(t.oid, oidList(cfg.oids));
  if (!ok) return null;
  const contains = String(cfg.contains ?? "").trim().toLowerCase();
  if (contains && !textOf(t).includes(contains)) return null;
  return { kind: "problem", key: `${trapLabel(t)}${ifIndex ? `#${ifIndex}` : ""}` };
}

/** The open problems a clear decision removes. */
export function clearedKeys(decision: Extract<TrapDecision, { kind: "clear" }>, open: string[]): string[] {
  if (decision.keys !== "all") return open.filter((k) => (decision.keys as string[]).some((c) => k === c || (!c.includes("#") && k.startsWith(`${c}#`))));
  if (!decision.ifIndex) return open;
  return open.filter((k) => k.endsWith(`#${decision.ifIndex}`));
}

// ---------------- sources: which device sent it ----------------

const ipv4 = (s: string) => { const p = s.split("."); return p.length === 4 && p.every((x) => /^\d{1,3}$/.test(x) && Number(x) < 256) ? p.reduce((a, x) => (a << 8n) | BigInt(x), 0n) : null; };
/** Does `ip` match an entry: an address, or IPv4 CIDR (10.1.2.0/24)? (Host names are resolved by the caller.) */
export function ipMatches(ip: string, entry: string): boolean {
  const e = entry.trim().toLowerCase(), a = ip.trim().toLowerCase().replace(/^::ffff:/, "");
  if (!e) return false;
  const cidr = /^([\d.]+)\/(\d{1,2})$/.exec(e);
  if (cidr) {
    const net = ipv4(cidr[1]!), x = ipv4(a), bits = Number(cidr[2]);
    if (net === null || x === null || bits > 32) return false;
    const mask = bits === 0 ? 0n : ((1n << 32n) - 1n) ^ ((1n << BigInt(32 - bits)) - 1n);
    return (net & mask) === (x & mask);
  }
  return e === a;
}
/** Entries of a sources field: addresses, CIDR ranges, host names. */
export const sourceEntries = (s: unknown) => String(s ?? "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
export const isHostName = (e: string) => !/^[\d.]+(\/\d+)?$/.test(e) && !e.includes(":");
