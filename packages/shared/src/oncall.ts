/**
 * Who is on call: overrides win, otherwise the rotation. Shifts change at a local handover time
 * ("Mondays 09:00 Europe/Athens"), so they follow daylight-saving changes.
 */
import { localParts, zonedTime } from "./recurrence.js";

export interface OncallSchedule {
  /** user ids in rotation order */
  participants: string[];
  /** 1 = daily, 7 = weekly, … */
  shiftDays: number;
  /** "HH:MM", local */
  handoverTime: string;
  timezone: string;
  /** local date of the first shift ("YYYY-MM-DD"); that shift goes to participants[0] */
  startDate: string;
}
export interface OncallOverride { id?: string; userId: string; startsAt: Date; endsAt: Date; createdAt?: Date }
export interface Shift { userId: string; start: Date; end: Date; source: "rotation" | "override" }

const DAY = 86_400_000;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const dayOf = (ymd: string) => Math.floor(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / DAY);
/** The local calendar day an instant belongs to, where days begin at the handover time. */
function shiftDay(at: Date, tz: string, handoverMin: number): number {
  const p = localParts(at, tz);
  const day = Math.floor(Date.UTC(p.y, p.m - 1, p.d) / DAY);
  return p.h * 60 + p.mi < handoverMin ? day - 1 : day;
}
function boundary(day: number, s: OncallSchedule): Date {
  const d = new Date(day * DAY);
  const m = minutes(s.handoverTime);
  return zonedTime(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), Math.floor(m / 60), m % 60, s.timezone);
}

/** The rotation shift containing `at` (ignoring overrides). */
export function rotationShift(s: OncallSchedule, at: Date): (Shift & { index: number }) | null {
  const n = s.participants.length;
  if (!n || s.shiftDays < 1) return null;
  const idx = Math.floor((shiftDay(at, s.timezone, minutes(s.handoverTime)) - dayOf(s.startDate)) / s.shiftDays);
  const first = dayOf(s.startDate) + idx * s.shiftDays;
  return { userId: s.participants[((idx % n) + n) % n]!, start: boundary(first, s), end: boundary(first + s.shiftDays, s), source: "rotation", index: idx };
}

/** The newest override covering `at`, else the rotation. */
export function onCallAt(s: OncallSchedule | null, overrides: OncallOverride[], at: Date): Shift | null {
  const o = overrides.filter((x) => x.startsAt <= at && at < x.endsAt)
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))[0];
  if (o) return { userId: o.userId, start: o.startsAt, end: o.endsAt, source: "override" };
  return s ? rotationShift(s, at) : null;
}

/** Who takes over after the current rotation shift (escalation "next person"). */
export function nextInRotation(s: OncallSchedule, at: Date): string | null {
  const cur = rotationShift(s, at);
  if (!cur || s.participants.length < 2) return null;
  return s.participants[(((cur.index + 1) % s.participants.length) + s.participants.length) % s.participants.length]!;
}

/** The next `count` rotation shifts from `from` (for the calendar). */
export function upcomingShifts(s: OncallSchedule, from: Date, count: number): Shift[] {
  const out: Shift[] = [];
  let at = from;
  for (let i = 0; i < count; i++) {
    const sh = rotationShift(s, at);
    if (!sh) break;
    out.push({ userId: sh.userId, start: sh.start, end: sh.end, source: "rotation" });
    at = new Date(sh.end.getTime() + 1000);
  }
  return out;
}
