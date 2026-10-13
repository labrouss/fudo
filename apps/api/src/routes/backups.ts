/**
 * Backups (superadmins): create, list, download, upload, inspect, restore, delete, and the schedule
 * the worker follows. Files live in BACKUP_DIR; the engine is @fudo/backup.
 */
import type { FastifyPluginAsync } from "fastify";
import { createReadStream, createWriteStream } from "node:fs";
import { rename, rm, mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { Readable } from "node:stream";
import { z } from "zod";
import pg from "pg";
import { deriveKey, encrypt } from "@fudo/shared";
import {
  BackupBusyError, BackupError, backupDir, backupPath, createBackup, dirIsTemporary, inspectBackup, isBackupName,
  listBackups, newBackupName, nextSlot, openBackup, PURPOSE, restoreBackup, schemaOf, withBackupLock, type BackupSchedule,
} from "@fudo/backup";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { getSetting, setSetting, SETTING } from "../lib/settings.js";
import { requireSuperadmin } from "../plugins/auth.js";
import { APP_VERSION } from "../version.js";
import { backupJob } from "../lib/backup-job.js";

const SCHEDULE_KEY = "backup.schedule";
const LAST_RUN_KEY = "backup.lastRun";
const passphrase = z.string().min(12, "At least 12 characters").max(1024);
const scheduleSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(["daily", "weekly"]),
  weekday: z.number().int().min(0).max(6),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Unknown time zone"),
  history: z.boolean(),
  keep: z.number().int().min(1).max(365),
  passphrase: passphrase.optional(),
});

/** Engine errors → API errors with stable codes (the interface translates them). */
function toHttp(e: unknown): unknown {
  if (e instanceof BackupError) return new HttpError(400, e.code, e.message);
  if (e instanceof BackupBusyError) return new HttpError(409, "busy", "A backup or restore is already running");
  return e;
}
const fileOf = (name: string) => { if (!isBackupName(name)) throw new HttpError(404, "not_found", "Not found"); return backupPath(name); };

export const backupRoutes =
  ({ db, pool, env }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    // uploads arrive as raw bytes (see the matching exception in plugins/security.ts)
    app.addContentTypeParser("application/octet-stream", (_req, payload, done) => done(null, payload));

    const currentSchema = async () => String((await pool.query("SELECT max(name) AS m FROM schema_migrations")).rows[0]?.m ?? "0000").slice(0, 4);

    app.get("/backups", async (req) => {
      requireSuperadmin(req);
      const schema = await currentSchema();
      const stored = await getSetting<BackupSchedule>(db, SCHEDULE_KEY);
      const { passphraseEnc, ...schedule } = stored ?? ({} as Partial<BackupSchedule>);
      return {
        dir: backupDir(),
        temporary: dirIsTemporary(),
        files: (await listBackups()).map((f) => ({
          name: f.name, size: f.size, kind: f.kind, createdAt: f.createdAt,
          fudoVersion: f.header?.fudoVersion ?? null, history: f.header?.history ?? null,
          restorable: !!f.header && schemaOf(f.header.schema) <= schema,
        })),
        schedule: stored ? { ...schedule, hasPassphrase: !!passphraseEnc } : null,
        nextRun: stored?.enabled ? nextSlot(stored).toISOString() : null,
        lastRun: (await getSetting(db, LAST_RUN_KEY)) ?? null,
        job: backupJob.current,
      };
    });

    app.post("/backups", async (req, reply) => {
      const user = requireSuperadmin(req);
      const input = parse(z.object({ history: z.boolean(), passphrase }), req.body);
      if (backupJob.current?.state === "running") throw new HttpError(409, "busy", "A backup or restore is already running");
      const name = newBackupName("manual", input.history);
      backupJob.current = { kind: "create", state: "running", startedAt: new Date().toISOString(), file: name };
      const job = backupJob.current;
      void withBackupLock(pool, () => createBackup(pool, { appSecret: env.APP_SECRET, passphrase: input.passphrase, history: input.history, file: path.join(backupDir(), name), fudoVersion: APP_VERSION, kind: "manual" }))
        .then(async (r) => { Object.assign(job, { state: "done", finishedAt: new Date().toISOString() }); await audit(db, { userId: user.id, action: "backup.created", diff: { file: name, history: input.history, size: r.size } }); })
        .catch((e) => { const h = toHttp(e) as { code?: string; message?: string }; Object.assign(job, { state: "failed", finishedAt: new Date().toISOString(), errorCode: h.code ?? "internal", error: h.message }); req.log.error({ err: e }, "backup failed"); });
      return reply.code(202).send({ started: true, file: name });
    });

    app.get<{ Params: { name: string } }>("/backups/:name/download", async (req, reply) => {
      requireSuperadmin(req);
      const file = fileOf(req.params.name);
      return reply.header("content-type", "application/octet-stream").header("content-disposition", `attachment; filename="${req.params.name}"`).send(createReadStream(file));
    });

    app.delete<{ Params: { name: string } }>("/backups/:name", async (req) => {
      const user = requireSuperadmin(req);
      await rm(fileOf(req.params.name), { force: true });
      await audit(db, { userId: user.id, action: "backup.deleted", diff: { file: req.params.name } });
      return { ok: true };
    });

    // streamed to disk, then checked; any size
    app.put("/backups/upload", { bodyLimit: 1024 ** 4 }, async (req) => {
      const user = requireSuperadmin(req);
      await mkdir(backupDir(), { recursive: true });
      const tmp = path.join(backupDir(), `.upload-${randomBytes(6).toString("hex")}`);
      try {
        await pipeline(req.body as Readable, createWriteStream(tmp, { mode: 0o600 }));
        const { header } = await openBackup(tmp);
        const name = newBackupName("uploaded", header.history);
        await rename(tmp, path.join(backupDir(), name));
        await audit(db, { userId: user.id, action: "backup.uploaded", diff: { file: name } });
        return { name };
      } catch (e) {
        await rm(tmp, { force: true });
        throw toHttp(e);
      }
    });

    app.post<{ Params: { name: string } }>("/backups/:name/inspect", async (req) => {
      requireSuperadmin(req);
      const input = parse(z.object({ passphrase: z.string().min(1) }), req.body);
      try {
        const r = await inspectBackup(fileOf(req.params.name), input.passphrase);
        return { ...r, restorable: schemaOf(r.header.schema) <= (await currentSchema()) };
      } catch (e) { throw toHttp(e); }
    });

    app.post<{ Params: { name: string } }>("/backups/:name/restore", async (req, reply) => {
      const user = requireSuperadmin(req);
      const input = parse(z.object({ passphrase: z.string().min(1), confirm: z.string() }), req.body);
      const org = (await getSetting<string>(db, SETTING.orgName)) ?? "Fudo";
      if (input.confirm.trim() !== org) throw new HttpError(400, "validation_failed", "Check the highlighted fields", { confirm: "Type the organization name exactly" });
      if (backupJob.current?.state === "running") throw new HttpError(409, "busy", "A backup or restore is already running");
      const file = fileOf(req.params.name);
      try { await inspectBackup(file, input.passphrase); } catch (e) { throw toHttp(e); } // wrong passphrase: answer now
      const safetyName = newBackupName("prerestore", false);
      backupJob.current = { kind: "restore", state: "running", step: "safety", startedAt: new Date().toISOString(), file: req.params.name, safetyFile: safetyName };
      const job = backupJob.current;
      await audit(db, { userId: user.id, action: "backup.restore_started", diff: { file: req.params.name, safetyBackup: safetyName } });
      void withBackupLock(pool, async () => {
        // the current state first, with the same passphrase, so the restore can be undone
        await createBackup(pool, { appSecret: env.APP_SECRET, passphrase: input.passphrase, history: false, file: path.join(backupDir(), safetyName), fudoVersion: APP_VERSION, kind: "prerestore" });
        job.step = "restore";
        // emptying tables needs the tables' owner: the application role (fudo_app) may only read
        // and write rows. DATABASE_URL is that owner (it runs the migrations); this connection is
        // used for the restore only. Row-level security still applies (it is forced on owners too).
        const owner = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });
        try { await restoreBackup(owner, { appSecret: env.APP_SECRET, file, passphrase: input.passphrase, actor: user.email }); }
        finally { await owner.end(); }
      })
        .then(() => Object.assign(job, { state: "done", finishedAt: new Date().toISOString() }))
        .catch((e) => { const h = toHttp(e) as { code?: string; message?: string }; Object.assign(job, { state: "failed", finishedAt: new Date().toISOString(), errorCode: h.code ?? "internal", error: h.message }); req.log.error({ err: e }, "restore failed"); });
      return reply.code(202).send({ started: true, safetyFile: safetyName });
    });

    app.put("/backups/schedule", async (req) => {
      const user = requireSuperadmin(req);
      const input = parse(scheduleSchema, req.body);
      const stored = await getSetting<BackupSchedule>(db, SCHEDULE_KEY);
      const passphraseEnc = input.passphrase ? encrypt(input.passphrase, deriveKey(env.APP_SECRET, PURPOSE.backup)) : stored?.passphraseEnc;
      if (input.enabled && !passphraseEnc) throw new HttpError(400, "validation_failed", "Check the highlighted fields", { passphrase: "Required" });
      const { passphrase: _drop, ...rest } = input;
      const value: BackupSchedule = { ...rest, ...(passphraseEnc ? { passphraseEnc } : {}) };
      await setSetting(db, SCHEDULE_KEY, value);
      await audit(db, { userId: user.id, action: "backup.schedule", diff: { ...rest, passphraseChanged: !!input.passphrase } });
      return { ok: true, nextRun: value.enabled ? nextSlot(value).toISOString() : null };
    });
  };
