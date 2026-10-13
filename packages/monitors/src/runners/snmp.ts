/**
 * Reads one OID and compares the value — or, for counters, its change per second (two readings:
 * the one kept from the last check and this one; see counters.ts).
 */
import type { MsgPart } from "@fudo/shared";
import { down, elapsed, errorPart, result, type Runner } from "./types.js";
import { SnmpError, counter, isError, openSession, text, TYPE, varbindError } from "./snmp-session.js";
import { maxSampleAge, ratesBetween, sampleData, sampleFrom, sampleGapMs, type Sample } from "./counters.js";

export function compare(value: string, condition: string, expected: string): boolean {
  const n = Number(value), e = Number(expected);
  switch (condition) {
    case "eq": return value === expected;
    case "ne": return value !== expected;
    case "contains": return value.includes(expected);
    case "gt": return n > e;
    case "gte": return n >= e;
    case "lt": return n < e;
    case "lte": return n <= e;
    default: return true;
  }
}
const SYMBOL: Record<string, string> = { eq: "=", ne: "≠", contains: "contains", gt: ">", gte: "≥", lt: "<", lte: "≤" };
const SYS_UPTIME = "1.3.6.1.2.1.1.3.0";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A rate as text: up to 3 significant decimals. */
export const formatRate = (v: number) => (Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 1000) / 1000));

export const snmpRunner: Runner = async (cfg, ctx) => {
  const start = process.hrtime.bigint();
  const oid = String(cfg.oid);
  const rate = cfg.mode === "rate";
  const s = openSession(cfg, ctx.timeoutMs);
  try {
    const read = async (): Promise<{ value: string; sample: Sample | null; error?: MsgPart }> => {
      const vbs = await s.get(rate ? [oid, SYS_UPTIME] : [oid]);
      const vb = vbs[0]!;
      if (isError(vb)) return { value: "", sample: null, error: ["snmp.oidError", { oid, error: varbindError(vb) }] };
      if (!rate) return { value: text(vb), sample: null };
      const n = counter(vb);
      if (n === null) return { value: "", sample: null, error: ["snmp.notNumber", { oid }] };
      const bits = vb.type === TYPE.Counter64 ? 64 : 32;
      // only real counters wrap; a gauge or integer that goes down simply has a negative rate
      const wraps = vb.type === TYPE.Counter32 || vb.type === TYPE.Counter64;
      return { value: String(n), sample: { at: Date.now(), up: counter(vbs[1]), values: { v: n }, bits: { v: wraps ? bits : 64 } } };
    };
    let r = await read();
    if (r.error) return down([r.error], elapsed(start));
    const ms = elapsed(start);
    let value = r.value;
    let data: Record<string, number | string> | undefined;
    if (rate) {
      const prev = sampleFrom(ctx.previous ?? null);
      const sameOid = ctx.previous?.oid === oid;
      let rates = prev && sameOid ? ratesBetween(prev, r.sample!, maxSampleAge(ctx.intervalS)) : null;
      if (!rates) {
        await wait(sampleGapMs(ctx.timeoutMs));
        const again = await read();
        if (again.error) return down([again.error], ms);
        rates = ratesBetween(r.sample!, again.sample!, 3600);
        r = again;
      }
      const perS = rates?.v ?? 0;
      value = formatRate(perS);
      data = { value: Math.round(perS * 1000) / 1000, ...sampleData(r.sample!), oid };
    } else if (Number.isFinite(Number(value)) && value !== "") data = { value: Number(value) };
    const ok = compare(value, String(cfg.condition), String(cfg.expected ?? ""));
    const raw = rate ? `${value}/s` : value;
    const shown = raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
    const op = SYMBOL[String(cfg.condition)] ?? "";
    return result(ok ? "UP" : "DOWN", ms,
      [cfg.condition === "any" ? `${oid} = ${shown}` : ok ? `${shown} ${op} ${cfg.expected}${rate ? "/s" : ""}` : ["snmp.mismatch", { value: shown, op, expected: `${cfg.expected}${rate ? "/s" : ""}` }]],
      data);
  } catch (err) {
    if (err instanceof SnmpError && err.code === "timeout") return down([[cfg.version === "v3" ? "snmp.noResponseV3" : "snmp.noResponse"]], elapsed(start));
    return down([errorPart(err, ctx.timeoutMs)], elapsed(start));
  } finally {
    s.close();
  }
};
