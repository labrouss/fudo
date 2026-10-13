/**
 * Availability from status history (pure). Time counts as:
 *   up        UP, DEGRADED
 *   down      DOWN, IMPACTED by an unplanned cause
 *   planned   MAINTENANCE, IMPACTED by planned maintenance   (excluded from the SLA)
 *   unknown   UNKNOWN (not yet checked, paused)               (excluded from the SLA)
 * availability = up / (up + down)
 */
export interface StatusChange { ts: number; to: string; planned?: boolean }
export type TimeClass = "up" | "down" | "planned" | "unknown";

export function classify(status: string, planned = false): TimeClass {
  if (status === "UP" || status === "DEGRADED") return "up";
  if (status === "MAINTENANCE" || (status === "IMPACTED" && planned)) return "planned";
  if (status === "DOWN" || status === "IMPACTED") return "down";
  return "unknown";
}

export interface Totals { up: number; down: number; planned: number; unknown: number; pct: number | null }
export interface Bucket extends Totals { start: number }

const empty = (): Omit<Totals, "pct"> => ({ up: 0, down: 0, planned: 0, unknown: 0 });
const pct = (t: Omit<Totals, "pct">) => (t.up + t.down > 0 ? (t.up / (t.up + t.down)) * 100 : null);

/**
 * @param initial status (and planned flag) in effect at `from`
 * @param changes transitions inside [from, to), any order
 * @param bucketMs optional bucket size (e.g. one day) for strips
 */
export function availability(initial: { status: string; planned?: boolean }, changes: StatusChange[], from: number, to: number, bucketMs?: number): { totals: Totals; buckets: Bucket[] } {
  const sorted = changes.filter((c) => c.ts >= from && c.ts < to).sort((a, b) => a.ts - b.ts);
  const totals = empty();
  const buckets: Array<Omit<Bucket, "pct">> = [];
  if (bucketMs) for (let s = from; s < to; s += bucketMs) buckets.push({ start: s, ...empty() });

  const add = (cls: TimeClass, a: number, b: number) => {
    if (b <= a) return;
    totals[cls] += b - a;
    if (!bucketMs) return;
    for (let i = Math.floor((a - from) / bucketMs); i < buckets.length; i++) {
      const bs = buckets[i]!.start;
      const be = Math.min(bs + bucketMs, to);
      if (bs >= b) break;
      const ov = Math.min(b, be) - Math.max(a, bs);
      if (ov > 0) buckets[i]![cls] += ov;
    }
  };

  let cur = classify(initial.status, initial.planned);
  let t = from;
  for (const c of sorted) {
    add(cur, t, c.ts);
    cur = classify(c.to, c.planned);
    t = c.ts;
  }
  add(cur, t, to);
  return { totals: { ...totals, pct: pct(totals) }, buckets: buckets.map((b) => ({ ...b, pct: pct(b) })) };
}

// ---------- time zones and business hours ----------

/** Offset (ms) of time zone `tz` at instant `t`: local wall time minus UTC. */
export function tzOffset(t: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t));
  const g = (k: string) => Number(parts.find((p) => p.type === k)!.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(t / 1000) * 1000;
}

/** UTC instant of a wall-clock time in `tz` (DST-correct). */
export function zonedTime(y: number, m: number, d: number, h: number, min: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz);
  return t;
}

/** Local calendar date (y, m, d, weekday 1=Mon…7=Sun) of instant `t` in `tz`. */
export function localDate(t: number, tz: string): { y: number; m: number; d: number; wd: number } {
  const local = new Date(t + tzOffset(t, tz));
  return { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate(), wd: ((local.getUTCDay() + 6) % 7) + 1 };
}

export interface BusinessHours { days: number[]; start: string; end: string; tz: string }

/** Business-hour windows overlapping [from, to). */
export function businessWindows(from: number, to: number, bh: BusinessHours): Array<[number, number]> {
  const [sh, sm] = bh.start.split(":").map(Number) as [number, number];
  const [eh, em] = bh.end.split(":").map(Number) as [number, number];
  const out: Array<[number, number]> = [];
  const first = localDate(from - 86_400_000, bh.tz);
  for (let i = 0; ; i++) {
    const day = new Date(Date.UTC(first.y, first.m - 1, first.d + i));
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate(), wd = ((day.getUTCDay() + 6) % 7) + 1;
    const s = zonedTime(y, m, d, sh, sm, bh.tz);
    if (s >= to) break;
    if (!bh.days.includes(wd)) continue;
    const e = zonedTime(y, m, d, eh, em, bh.tz);
    const a = Math.max(s, from), b = Math.min(e, to);
    if (b > a) out.push([a, b]);
  }
  return out;
}

/** Availability counted only inside the given windows (e.g. business hours). */
export function availabilityWithin(initial: { status: string; planned?: boolean }, changes: StatusChange[], from: number, to: number, windows: Array<[number, number]>): Totals {
  const sorted = changes.filter((c) => c.ts < to).sort((a, b) => a.ts - b.ts);
  const t = empty();
  for (const [ws, we] of windows) {
    let state = initial;
    for (const c of sorted) if (c.ts <= ws) state = { status: c.to, planned: c.planned };
    const inside = sorted.filter((c) => c.ts > ws && c.ts < we);
    const r = availability(state, inside, ws, we).totals;
    t.up += r.up; t.down += r.down; t.planned += r.planned; t.unknown += r.unknown;
  }
  return { ...t, pct: pct(t) };
}
