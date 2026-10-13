import { localDate, zonedTime } from "@fudo/engine";

export type Period = "weekly" | "monthly";
export interface Range { from: number; to: number; label: string }

/**
 * Dates in labels are written by Intl in the report's language ("August 2026", "Αύγουστος 2026");
 * English uses the British day-month order. `week` formats "Week {n}, {range}" (translated).
 */
const dateLocale = (lang: string) => (lang === "en" ? "en-GB" : lang === "ar" || lang.startsWith("ar-") ? `${lang}-u-nu-latn` : lang);
const fmt = (lang: string, o: Intl.DateTimeFormatOptions) => {
  try { return new Intl.DateTimeFormat(dateLocale(lang), { timeZone: "UTC", ...o }); } catch { return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o }); }
};
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12));
const dayMonth = (lang: string, y: number, m: number, d: number) => fmt(lang, { day: "numeric", month: "short" }).format(utc(y, m, d));
const fullDate = (lang: string, y: number, m: number, d: number) => fmt(lang, { day: "numeric", month: "short", year: "numeric" }).format(utc(y, m, d));
export type WeekLabel = (n: number, range: string) => string;
const EN_WEEK: WeekLabel = (n, range) => `Week ${n}, ${range}`;

/** ISO week number of a local date. */
function isoWeek(y: number, m: number, d: number): number {
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86_400_000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}

/** The last complete week (Mon–Sun) or month before `now`, in time zone `tz`. */
export function previousPeriod(period: Period, tz: string, now = Date.now(), lang = "en", week: WeekLabel = EN_WEEK): Range {
  const today = localDate(now, tz);
  if (period === "monthly") {
    const y = today.m === 1 ? today.y - 1 : today.y;
    const m = today.m === 1 ? 12 : today.m - 1;
    return { from: zonedTime(y, m, 1, 0, 0, tz), to: zonedTime(today.y, today.m, 1, 0, 0, tz), label: fmt(lang, { month: "long", year: "numeric" }).format(utc(y, m, 15)) };
  }
  const monday = new Date(Date.UTC(today.y, today.m - 1, today.d - (today.wd - 1) - 7));
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  const nextMonday = new Date(monday.getTime() + 7 * 86_400_000);
  const [y, m, d] = [monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()];
  const label = week(isoWeek(y, m, d), `${dayMonth(lang, y, m, d)} – ${fullDate(lang, sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate())}`);
  return { from: zonedTime(y, m, d, 0, 0, tz), to: zonedTime(nextMonday.getUTCFullYear(), nextMonday.getUTCMonth() + 1, nextMonday.getUTCDate(), 0, 0, tz), label };
}

/** Next send time after `after`: Mondays (weekly) or the 1st (monthly) at `hour` local time. */
export function nextRun(period: Period, hour: number, tz: string, after = Date.now()): number {
  const today = localDate(after, tz);
  for (let i = 0; i < 40; i++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
    const wd = ((day.getUTCDay() + 6) % 7) + 1;
    if (period === "weekly" ? wd !== 1 : d !== 1) continue;
    const t = zonedTime(y, m, d, hour, 0, tz);
    if (t > after) return t;
  }
  throw new Error("no next run found");
}

/** Custom range label, e.g. for on-demand reports. */
export function rangeLabel(from: number, to: number, tz: string, lang = "en"): string {
  const a = localDate(from, tz), b = localDate(to - 1, tz);
  return `${fullDate(lang, a.y, a.m, a.d)} – ${fullDate(lang, b.y, b.m, b.d)}`;
}
