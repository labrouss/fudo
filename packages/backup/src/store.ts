/**
 * The backups folder (BACKUP_DIR, shared by the API and the worker), file naming, rotation,
 * the cluster-wide lock that allows one backup or restore at a time, and schedule timing.
 */
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type pg from "pg";
import { EXTENSION, openBackup, type BackupHeader, type BackupKind } from "./format.js";

export const backupDir = () => process.env.BACKUP_DIR || path.join(tmpdir(), "fudo-backups");
/** Backups under the temporary folder do not survive a container rebuild. */
export const dirIsTemporary = (dir = backupDir()) => !process.env.BACKUP_DIR || dir.startsWith(tmpdir());

const NAME = /^fudo-(manual|auto|prerestore|uploaded)-\d{8}-\d{6}(-history)?\.fudobackup$/;
/** Only names Fudo itself gives (no paths, no other files). */
export const isBackupName = (name: string) => NAME.test(name);
export const backupPath = (name: string) => {
  if (!isBackupName(name)) throw new Error("Invalid backup name");
  return path.join(backupDir(), name);
};
export function newBackupName(kind: BackupKind, history: boolean, at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const ts = `${at.getUTCFullYear()}${p(at.getUTCMonth() + 1)}${p(at.getUTCDate())}-${p(at.getUTCHours())}${p(at.getUTCMinutes())}${p(at.getUTCSeconds())}`;
  return `fudo-${kind}-${ts}${history ? "-history" : ""}${EXTENSION}`;
}

export interface BackupFile { name: string; size: number; kind: BackupKind; createdAt: string; header: BackupHeader | null }

export async function listBackups(dir = backupDir()): Promise<BackupFile[]> {
  await mkdir(dir, { recursive: true });
  const out: BackupFile[] = [];
  for (const name of await readdir(dir)) {
    if (!isBackupName(name)) continue;
    const full = path.join(dir, name);
    const s = await stat(full);
    let header: BackupHeader | null = null;
    try { header = (await openBackup(full)).header; } catch { /* listed, but not restorable */ }
    out.push({ name, size: s.size, kind: NAME.exec(name)![1] as BackupKind, createdAt: header?.createdAt ?? s.mtime.toISOString(), header });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Keeps the newest `keep` scheduled backups; manual, uploaded and pre-restore backups stay. */
export async function rotate(keep: number, dir = backupDir()): Promise<string[]> {
  const auto = (await listBackups(dir)).filter((b) => b.kind === "auto");
  const gone = auto.slice(Math.max(1, keep)).map((b) => b.name);
  for (const n of gone) await rm(path.join(dir, n), { force: true });
  return gone;
}

/** One backup or restore at a time, across the API and worker processes. */
const LOCK_KEY = 73_215_001;
export class BackupBusyError extends Error { constructor() { super("A backup or restore is already running"); } }
export async function withBackupLock<T>(pool: pg.Pool, fn: () => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    const got = (await c.query("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY])).rows[0].ok;
    if (!got) throw new BackupBusyError();
    try { return await fn(); } finally { await c.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {}); }
  } finally {
    c.release();
  }
}

/* ---------- schedule ---------- */
export interface BackupSchedule {
  enabled: boolean;
  frequency: "daily" | "weekly";
  /** 0 = Sunday … 6 = Saturday (weekly) */
  weekday: number;
  /** HH:MM, local time in `timezone` */
  time: string;
  timezone: string;
  history: boolean;
  keep: number;
  passphraseEnc?: string;
}

/** Local wall-clock parts of an instant in a time zone. */
function parts(at: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
  const o = Object.fromEntries(f.formatToParts(at).map((p) => [p.type, p.value]));
  return { y: +o.year!, m: +o.month!, d: +o.day!, h: +o.hour!, mi: +o.minute!, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday!) };
}
/** The instant when the wall clock in `tz` shows y-m-d h:mi. */
function zoned(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(guess), tz);
    guess += Date.UTC(y, m - 1, d, h, mi) - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  }
  return new Date(guess);
}

/** The most recent scheduled moment at or before `now`. */
export function lastSlot(s: Pick<BackupSchedule, "frequency" | "weekday" | "time" | "timezone">, now = new Date()): Date {
  const [hh, mm] = s.time.split(":").map(Number) as [number, number];
  const p = parts(now, s.timezone);
  for (let back = 0; back <= 8; back++) {
    const day = new Date(Date.UTC(p.y, p.m - 1, p.d - back));
    const slot = zoned(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hh, mm, s.timezone);
    if (slot > now) continue;
    if (s.frequency === "weekly" && day.getUTCDay() !== s.weekday) continue;
    return slot;
  }
  return new Date(0);
}
/** The next scheduled moment after `now`. */
export function nextSlot(s: Pick<BackupSchedule, "frequency" | "weekday" | "time" | "timezone">, now = new Date()): Date {
  const step = s.frequency === "weekly" ? 7 : 1;
  const last = lastSlot(s, now);
  return lastSlot(s, new Date(last.getTime() + step * 86_400_000 + 3_600_000)); // +1 h covers daylight-saving shifts
}
