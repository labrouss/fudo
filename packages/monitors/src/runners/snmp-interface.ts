/**
 * A network interface over SNMP (IF-MIB): link state, traffic in and out (bit/s and % of the link
 * speed) and errors. The interface is chosen by name (ifName, ifDescr or ifAlias) because some
 * devices renumber ifIndex after a restart; the resolved index is kept and checked on every poll.
 */
import type { MsgPart } from "@fudo/shared";
import { down, elapsed, errorPart, result, type Runner, type RunContext } from "./types.js";
import { SnmpError, counter, isError, openSession, text, TYPE, type Session, type Varbind } from "./snmp-session.js";
import { formatBps, maxSampleAge, ratesBetween, sampleData, sampleFrom, sampleGapMs, type Sample } from "./counters.js";

const SYS_UPTIME = "1.3.6.1.2.1.1.3.0";
const IF = "1.3.6.1.2.1.2.2.1", IFX = "1.3.6.1.2.1.31.1.1.1";
export const OID = {
  descr: `${IF}.2`, type: `${IF}.3`, speed: `${IF}.5`, admin: `${IF}.7`, oper: `${IF}.8`,
  inOct: `${IF}.10`, inDisc: `${IF}.13`, inErr: `${IF}.14`, outOct: `${IF}.16`, outDisc: `${IF}.19`, outErr: `${IF}.20`,
  name: `${IFX}.1`, hcIn: `${IFX}.6`, hcOut: `${IFX}.10`, highSpeed: `${IFX}.15`, alias: `${IFX}.18`,
} as const;
/** IF-MIB ifOperStatus */
export const OPER: Record<number, string> = { 1: "up", 2: "down", 3: "testing", 4: "unknown", 5: "dormant", 6: "notPresent", 7: "lowerLayerDown" };

export interface IfLabels { name: string; descr: string; alias: string }
/** Does this interface answer to `want`? Index, then ifName, ifDescr, ifAlias (any case). */
export function matches(want: string, ix: string, l: IfLabels): boolean {
  const w = want.trim().toLowerCase();
  return w === ix || [l.name, l.descr, l.alias].some((x) => x && x.trim().toLowerCase() === w);
}

/** The ifIndex for `want` among all interfaces: an exact ifName wins, then ifDescr, then a unique ifAlias. */
export function resolveIndex(want: string, rows: Map<string, IfLabels>): { ix: string } | { error: "notFound" } | { error: "ambiguous"; count: number } {
  const w = want.trim().toLowerCase();
  if (/^\d+$/.test(w) && rows.has(w)) return { ix: w };
  for (const field of ["name", "descr", "alias"] as const) {
    const hits = [...rows].filter(([, l]) => l[field] && l[field].trim().toLowerCase() === w).map(([ix]) => ix);
    if (hits.length === 1) return { ix: hits[0]! };
    if (hits.length > 1) return { error: "ambiguous", count: hits.length };
  }
  return { error: "notFound" };
}

/** Name, description and alias of every interface (v1 agents: description only). */
export async function interfaceLabels(s: Session): Promise<Map<string, IfLabels>> {
  const descr = await s.column(OID.descr);
  const name = s.version === "v1" ? new Map<string, Varbind>() : await s.column(OID.name).catch(() => new Map<string, Varbind>());
  const alias = s.version === "v1" ? new Map<string, Varbind>() : await s.column(OID.alias).catch(() => new Map<string, Varbind>());
  const out = new Map<string, IfLabels>();
  for (const ix of new Set([...descr.keys(), ...name.keys()])) out.set(ix, { name: text(name.get(ix)), descr: text(descr.get(ix)), alias: text(alias.get(ix)) });
  return out;
}

interface Poll { sample: Sample; labels: IfLabels; admin: number; oper: number; speedMbps: number | null }

async function poll(s: Session, ix: string): Promise<Poll | null> {
  const v1 = s.version === "v1";
  const keys = ["admin", "oper", "speed", "inOct", "outOct", "inErr", "outErr", "inDisc", "outDisc", "descr", ...(v1 ? [] : ["name", "alias", "hcIn", "hcOut", "highSpeed"])] as Array<keyof typeof OID>;
  const vbs = await s.get([SYS_UPTIME, ...keys.map((k) => `${OID[k]}.${ix}`)]);
  const at = Date.now();
  const vb = Object.fromEntries(keys.map((k, i) => [k, vbs[i + 1]])) as Record<keyof typeof OID, Varbind | undefined>;
  if (isError(vb.oper)) return null; // no such interface (any more)
  const hc = !isError(vb.hcIn) && !isError(vb.hcOut) && vb.hcIn!.type === TYPE.Counter64;
  const w = hc ? 64 : 32;
  const highSpeed = counter(vb.highSpeed), speed = counter(vb.speed);
  const speedMbps = highSpeed && highSpeed > 0n ? Number(highSpeed) : speed && speed > 0n && speed < 4294967295n ? Number(speed) / 1e6 : null;
  return {
    sample: {
      at, up: counter(vbs[0]),
      values: { in: counter(hc ? vb.hcIn : vb.inOct), out: counter(hc ? vb.hcOut : vb.outOct), ie: counter(vb.inErr), oe: counter(vb.outErr), id: counter(vb.inDisc), od: counter(vb.outDisc) },
      bits: { in: w, out: w, ie: 32, oe: 32, id: 32, od: 32 },
    },
    labels: { name: text(vb.name), descr: text(vb.descr), alias: text(vb.alias) },
    admin: Number(counter(vb.admin) ?? 0), oper: Number(counter(vb.oper) ?? 0), speedMbps,
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (v: number) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
const display = (l: IfLabels, ix: string) => {
  const base = l.name || l.descr || `ifIndex ${ix}`;
  return l.alias && l.alias !== base ? `${base} (${l.alias})` : base;
};

/** Status and message from link state, utilisation and errors. */
export function interfaceVerdict(cfg: Record<string, unknown>, p: Pick<Poll, "admin" | "oper" | "speedMbps">, name: string, r: { in: number; out: number; errPerMin: number }) {
  const speed = Number(cfg.speedMbps) > 0 ? Number(cfg.speedMbps) : p.speedMbps;
  const inPct = speed ? (r.in / (speed * 1e6)) * 100 : null, outPct = speed ? (r.out / (speed * 1e6)) * 100 : null;
  const traffic: MsgPart = inPct !== null && outPct !== null
    ? ["snmpif.trafficPct", { name, in: formatBps(r.in), out: formatBps(r.out), inPct: pct(inPct), outPct: pct(outPct) }]
    : ["snmpif.traffic", { name, in: formatBps(r.in), out: formatBps(r.out) }];
  const data: Record<string, number> = { inBps: Math.round(r.in), outBps: Math.round(r.out), errPerMin: Math.round(r.errPerMin * 10) / 10 };
  if (speed) data.speedMbps = speed;
  if (inPct !== null && outPct !== null) { data.inPct = Math.round(inPct * 10) / 10; data.outPct = Math.round(outPct * 10) / 10; }
  if (p.admin === 2) return { status: cfg.adminDown === "down" ? "DOWN" as const : "UP" as const, parts: [["snmpif.adminDown", { name }]] as MsgPart[], data };
  if (p.oper !== 1) {
    const state = OPER[p.oper] ?? String(p.oper);
    const hard = [2, 6, 7].includes(p.oper);
    return { status: hard ? "DOWN" as const : "DEGRADED" as const, parts: [[hard ? "snmpif.linkDown" : "snmpif.linkState", { name, state }]] as MsgPart[], data };
  }
  const top = Math.max(inPct ?? 0, outPct ?? 0);
  const crit = Number(cfg.criticalPct ?? 0), warn = Number(cfg.warnPct ?? 0), errLimit = Number(cfg.errorsPerMin ?? 0);
  if (speed && crit > 0 && top >= crit) return { status: "DOWN" as const, parts: [["snmpif.high", { pct: pct(top), limit: crit }], traffic] as MsgPart[], data };
  const problems: MsgPart[] = [];
  if (speed && warn > 0 && top >= warn) problems.push(["snmpif.high", { pct: pct(top), limit: warn }]);
  if (errLimit > 0 && r.errPerMin >= errLimit) problems.push(["snmpif.errors", { rate: Math.round(r.errPerMin * 10) / 10, limit: errLimit }]);
  return { status: problems.length ? "DEGRADED" as const : "UP" as const, parts: [...problems, traffic], data };
}

export const snmpInterfaceRunner: Runner = async (cfg, ctx: RunContext) => {
  const start = process.hrtime.bigint();
  const want = String(cfg.interface ?? "").trim();
  const s = openSession(cfg, ctx.timeoutMs);
  try {
    const prev = sampleFrom(ctx.previous ?? null);
    const kept = ctx.previous && ctx.previous.ixFor === want && typeof ctx.previous.ix === "string" ? ctx.previous.ix : null;
    // the kept index, if that interface still answers to the name; else look it up again
    let ix = kept ?? (/^\d+$/.test(want) ? want : null);
    let p = ix ? await poll(s, ix) : null;
    if (!p || !matches(want, ix!, p.labels)) {
      const r = resolveIndex(want, await interfaceLabels(s));
      if ("error" in r) return down([r.error === "notFound" ? ["snmpif.notFound", { name: want }] : ["snmpif.ambiguous", { name: want, count: r.count }]], elapsed(start));
      ix = r.ix;
      p = await poll(s, ix);
      if (!p) return down([["snmpif.notFound", { name: want }]], elapsed(start));
    }
    const ms = elapsed(start);
    const usablePrev = prev && kept === ix ? prev : null;
    let rates = usablePrev ? ratesBetween(usablePrev, p.sample, maxSampleAge(ctx.intervalS)) : null;
    if (!rates) {
      // no usable earlier reading (first check, a restart, Test): take a second one now
      await wait(sampleGapMs(ctx.timeoutMs));
      const again = await poll(s, ix!);
      if (!again) return down([["snmpif.notFound", { name: want }]], ms);
      rates = ratesBetween(p.sample, again.sample, 3600);
      p = again;
    }
    const r = { in: (rates?.in ?? 0) * 8, out: (rates?.out ?? 0) * 8, errPerMin: ((rates?.ie ?? 0) + (rates?.oe ?? 0)) * 60 };
    const v = interfaceVerdict(cfg, p, display(p.labels, ix!), r);
    return result(v.status, ms, v.parts, { ...v.data, ...sampleData(p.sample), ix: ix!, ixFor: want });
  } catch (err) {
    if (err instanceof SnmpError && err.code === "timeout") return down([[cfg.version === "v3" ? "snmp.noResponseV3" : "snmp.noResponse"]], elapsed(start));
    return down([errorPart(err, ctx.timeoutMs)], elapsed(start));
  } finally {
    s.close();
  }
};

/** Every interface of a device, for choosing one in the form (Find interfaces). */
export interface FoundInterface { index: number; name: string; descr: string; alias: string; type: number; speedMbps: number | null; admin: string; oper: string }
export async function listInterfaces(cfg: Record<string, unknown>, timeoutMs: number): Promise<FoundInterface[]> {
  const s = openSession(cfg, timeoutMs);
  try {
    const labels = await interfaceLabels(s);
    const [type, speed, admin, oper] = await Promise.all([OID.type, OID.speed, OID.admin, OID.oper].map((o) => s.column(o)));
    const high = s.version === "v1" ? new Map<string, Varbind>() : await s.column(OID.highSpeed).catch(() => new Map<string, Varbind>());
    return [...labels].map(([ix, l]) => {
      const hs = counter(high.get(ix)), sp = counter(speed!.get(ix));
      return {
        index: Number(ix), ...l, type: Number(counter(type!.get(ix)) ?? 0),
        speedMbps: hs && hs > 0n ? Number(hs) : sp && sp > 0n && sp < 4294967295n ? Number(sp) / 1e6 : null,
        admin: Number(counter(admin!.get(ix))) === 2 ? "down" : "up",
        oper: OPER[Number(counter(oper!.get(ix)) ?? 4)] ?? "unknown",
      };
    }).sort((a, b) => a.index - b.index);
  } finally { s.close(); }
}
