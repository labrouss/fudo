/**
 * Recurring maintenance: which moments a rule produces. Times are wall-clock times in the rule's
 * time zone, so "02:00" stays 02:00 local across daylight-saving changes.
 */
export interface RecurrenceRule {
  freq: "daily" | "weekly" | "monthly";
  /** weekly: 0 = Sunday … 6 = Saturday */
  weekdays?: number[];
  /** monthly: on a day of the month ("day"), or e.g. the second Tuesday ("nth") */
  monthly?: { mode: "day"; day: number } | { mode: "nth"; nth: 1 | 2 | 3 | 4 | -1; weekday: number };
  /** start, local time "HH:MM" */
  time: string;
  /** length in minutes (a window may run past midnight) */
  durationMin: number;
  timezone: string;
  /** first day, local "YYYY-MM-DD" */
  startDate: string;
  /** last day (inclusive), local "YYYY-MM-DD" */
  until?: string | null;
}

export function localParts(at: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const o = Object.fromEntries(f.formatToParts(at).map((p) => [p.type, p.value]));
  return { y: +o.year!, m: +o.month!, d: +o.day!, h: +o.hour!, mi: +o.minute! };
}
/** The instant at which the wall clock in `tz` shows y-m-d h:mi. */
export function zonedTime(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess), tz);
    const diff = Date.UTC(y, m - 1, d, h, mi) - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const ymd = (s: string) => s.split("-").map(Number) as [number, number, number];
const key = (y: number, m: number, d: number) => y * 10000 + m * 100 + d;

/** Does the rule fall on this local date? */
export function matchesDay(rule: RecurrenceRule, y: number, m: number, d: number): boolean {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (rule.freq === "daily") return true;
  if (rule.freq === "weekly") return (rule.weekdays ?? []).includes(wd);
  const mo = rule.monthly;
  if (!mo) return false;
  const dim = daysInMonth(y, m);
  if (mo.mode === "day") return d === Math.min(mo.day, dim); // day 31 → last day of shorter months
  if (wd !== mo.weekday) return false;
  return mo.nth === -1 ? d + 7 > dim : Math.ceil(d / 7) === mo.nth;
}

/** Windows of the rule that start in [from, to). */
export function occurrences(rule: RecurrenceRule, from: Date, to: Date): Array<{ start: Date; end: Date }> {
  const [hh, mm] = rule.time.split(":").map(Number) as [number, number];
  const first = key(...ymd(rule.startDate));
  const last = rule.until ? key(...ymd(rule.until)) : Infinity;
  const out: Array<{ start: Date; end: Date }> = [];
  // walk local calendar days, from the day before `from` (time zones) to the day after `to`
  const a = localParts(new Date(from.getTime() - 86_400_000), rule.timezone);
  const cursor = new Date(Date.UTC(a.y, a.m - 1, a.d));
  const stop = to.getTime() + 2 * 86_400_000;
  for (; cursor.getTime() <= stop; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const y = cursor.getUTCFullYear(), m = cursor.getUTCMonth() + 1, d = cursor.getUTCDate();
    const k = key(y, m, d);
    if (k < first || k > last || !matchesDay(rule, y, m, d)) continue;
    const start = zonedTime(y, m, d, hh, mm, rule.timezone);
    if (start < from || start >= to) continue;
    out.push({ start, end: new Date(start.getTime() + rule.durationMin * 60_000) });
  }
  return out;
}
