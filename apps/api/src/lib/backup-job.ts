/**
 * The backup or restore currently run by this API process. A restore signs everyone out, so its
 * outcome is also reported (without details) by the public /api/health for the waiting browser.
 */
export interface BackupJob {
  kind: "create" | "restore";
  state: "running" | "done" | "failed";
  /** restore: "safety" (backing up the current state first) or "restore" */
  step?: "safety" | "restore";
  startedAt: string;
  finishedAt?: string;
  file?: string;
  safetyFile?: string;
  errorCode?: string;
  error?: string;
}
export const backupJob: { current: BackupJob | null } = { current: null };
