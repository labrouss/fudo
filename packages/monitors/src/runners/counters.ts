/**
 * Rates from SNMP counters: two readings, (new − old) ÷ seconds. Counters only count up; a 32-bit
 * counter wraps at 2^32, so a smaller value means it went round once. A device restart (its uptime
 * went down) or a 64-bit counter going backwards breaks the series: that pair is not used.
 * The last reading is kept with each check result (as text: 64-bit values do not fit a JS number).
 */
export interface Sample {
  /** when it was read (ms since epoch) */
  at: number;
  /** sysUpTime in hundredths of a second (null if the device does not report it) */
  up: bigint | null;
  values: Record<string, bigint | null>;
  /** counter width per value */
  bits: Record<string, 32 | 64>;
}

const WRAP32 = 2n ** 32n;

/** Per-second rates of every value present in both samples; null if the pair cannot be used. */
export function ratesBetween(prev: Sample, now: Sample, maxAgeS: number): Record<string, number | null> | null {
  const secs = (now.at - prev.at) / 1000;
  if (!(secs >= 0.5) || secs > maxAgeS) return null;
  if (prev.up !== null && now.up !== null && now.up < prev.up) return null; // restarted (or uptime wrapped after 497 days)
  const out: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(now.values)) {
    const p = prev.values[k];
    if (v === null || p === null || p === undefined) { out[k] = null; continue; }
    let d = v - p;
    if (d < 0n) {
      if ((now.bits[k] ?? 64) === 64 || prev.bits[k] !== now.bits[k]) return null; // a 64-bit counter never wraps in practice: reset
      d += WRAP32;
    }
    out[k] = Number(d) / secs;
  }
  return out;
}

/** A sample as check-result data (strings for the big numbers). */
export function sampleData(s: Sample): Record<string, string | number> {
  const d: Record<string, string | number> = { c_at: s.at };
  if (s.up !== null) d.c_up = String(s.up);
  for (const [k, v] of Object.entries(s.values)) if (v !== null) d[`c_${k}`] = `${s.bits[k] ?? 64}:${v}`;
  return d;
}

/** The sample kept in a previous result's data, if any. */
export function sampleFrom(data: Record<string, unknown> | null | undefined): Sample | null {
  if (!data || typeof data.c_at !== "number") return null;
  const values: Record<string, bigint | null> = {}, bits: Record<string, 32 | 64> = {};
  for (const [k, v] of Object.entries(data)) {
    const m = /^c_(.+)$/.exec(k);
    if (!m || k === "c_at" || k === "c_up" || typeof v !== "string") continue;
    const [w, n] = v.split(":");
    try { values[m[1]!] = BigInt(n!); bits[m[1]!] = w === "32" ? 32 : 64; } catch { /* ignore */ }
  }
  let up: bigint | null = null;
  try { up = typeof data.c_up === "string" ? BigInt(data.c_up) : null; } catch { up = null; }
  return { at: data.c_at, up, values, bits };
}

/** How long a kept reading stays usable: three intervals, at least 15 minutes. */
export const maxSampleAge = (intervalS: number) => Math.max(3 * intervalS, 900);

/** Gap between two readings taken in one check (first check, after a restart, or Test). */
export const sampleGapMs = (timeoutMs: number) => Math.min(2000, Math.max(800, Math.floor(timeoutMs / 4)));

/** Bits per second as text: 950 bit/s, 12.4 kbit/s, 412 Mbit/s, 9.41 Gbit/s. */
export function formatBps(bps: number): string {
  const f = (v: number, unit: string) => `${v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1).replace(/\.0$/, "") : v.toFixed(2).replace(/\.?0+$/, "")} ${unit}`;
  if (bps < 1000) return f(bps, "bit/s");
  if (bps < 1e6) return f(bps / 1e3, "kbit/s");
  if (bps < 1e9) return f(bps / 1e6, "Mbit/s");
  return f(bps / 1e9, "Gbit/s");
}
