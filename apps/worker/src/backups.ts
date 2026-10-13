/**
 * Scheduled backups: every minute, if a scheduled moment passed since the last run (also after
 * downtime: one catch-up run), write a backup to BACKUP_DIR and keep the newest N scheduled ones.
 */
import path from "node:path";
import type pg from "pg";
import type { Logger } from "pino";
import { decrypt, deriveKey } from "@fudo/shared";
import { BackupBusyError, backupDir, createBackup, lastSlot, newBackupName, PURPOSE, rotate, withBackupLock, type BackupSchedule } from "@fudo/backup";
import { APP_VERSION } from "./version.js";

interface LastRun { at: string; slot: string; ok: boolean; file?: string; size?: number; removed?: string[]; error?: string }

export class BackupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(private pool: pg.Pool, private log: Logger, private appSecret: string) {}

  start() { this.timer = setInterval(() => void this.tick(), 60_000); setTimeout(() => void this.tick(), 20_000); }
  stop() { if (this.timer) clearInterval(this.timer); }

  private async setting<T>(key: string): Promise<T | null> {
    return ((await this.pool.query("SELECT value FROM settings WHERE key = $1", [key])).rows[0]?.value as T) ?? null;
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const s = await this.setting<BackupSchedule>("backup.schedule");
      if (!s?.enabled || !s.passphraseEnc) return;
      const slot = lastSlot(s);
      const last = await this.setting<LastRun>("backup.lastRun");
      if (last && new Date(last.slot) >= slot) return; // this moment is done (or failed and recorded)
      let run: LastRun = { at: new Date().toISOString(), slot: slot.toISOString(), ok: false };
      try {
        const passphrase = decrypt(s.passphraseEnc, deriveKey(this.appSecret, PURPOSE.backup));
        const name = newBackupName("auto", s.history);
        const r = await withBackupLock(this.pool, () => createBackup(this.pool, { appSecret: this.appSecret, passphrase, history: s.history, file: path.join(backupDir(), name), fudoVersion: APP_VERSION, kind: "auto" }));
        run = { ...run, ok: true, file: name, size: r.size, removed: await rotate(s.keep) };
        this.log.info({ file: name, size: r.size }, "scheduled backup written");
      } catch (e) {
        if (e instanceof BackupBusyError) return; // a manual backup or restore is running: try again next minute
        run = { ...run, error: (e as Error).message };
        this.log.error({ err: e }, "scheduled backup failed");
      }
      await this.pool.query(`INSERT INTO settings (key, value) VALUES ('backup.lastRun', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(run)]);
    } catch (e) {
      this.log.error({ err: e }, "backup scheduler");
    } finally {
      this.running = false;
    }
  }
}
