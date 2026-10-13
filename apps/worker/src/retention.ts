/**
 * Data retention for everything outside TimescaleDB policies (settings key "retention"): old rows
 * are deleted in small batches, each in its own short transaction, at most MAX_BATCHES per run
 * (the rest goes on the next hourly run).
 */
import type pg from "pg";
import type { Logger } from "pino";
import { RETENTION_DEFAULTS, type Retention } from "@fudo/shared";

const BATCH = 5000, MAX_BATCHES = 40;

/** What each setting deletes; $1 is the number of days. */
const RULES: Array<{ key: keyof Retention; name: string; sql: string }> = [
  // keeps each item's last change before the cutoff: availability needs the status a period started with
  { key: "statusHistoryDays", name: "statusHistory", sql: `DELETE FROM state_changes WHERE id IN (
      SELECT s.id FROM state_changes s WHERE s.ts < now() - make_interval(days => $1)
         AND EXISTS (SELECT 1 FROM state_changes n WHERE n.entity_type = s.entity_type AND n.entity_id = s.entity_id
                       AND n.ts < now() - make_interval(days => $1) AND n.ts > s.ts)
       LIMIT ${BATCH})` },
  // resolved incidents only (their timeline, deliveries and pages go with them)
  { key: "incidentsDays", name: "incidents", sql: `DELETE FROM incidents WHERE id IN (
      SELECT id FROM incidents WHERE status = 'resolved' AND resolved_at < now() - make_interval(days => $1) LIMIT ${Math.round(BATCH / 5)})` },
  // finished deliveries only: queued ones are still to be sent
  { key: "deliveriesDays", name: "deliveries", sql: `DELETE FROM notification_deliveries WHERE id IN (
      SELECT id FROM notification_deliveries WHERE status IN ('sent', 'failed', 'suppressed') AND created_at < now() - make_interval(days => $1) LIMIT ${BATCH})` },
  { key: "deliveriesDays", name: "oncallSends", sql: `DELETE FROM oncall_sends WHERE id IN (
      SELECT id FROM oncall_sends WHERE sent_at < now() - make_interval(days => $1) LIMIT ${BATCH})` },
  { key: "auditDays", name: "audit", sql: `DELETE FROM audit_log WHERE id IN (
      SELECT id FROM audit_log WHERE ts < now() - make_interval(days => $1) LIMIT ${BATCH})` },
  { key: "trapsDays", name: "traps", sql: `DELETE FROM snmp_traps WHERE id IN (
      SELECT id FROM snmp_traps WHERE ts < now() - make_interval(days => $1) LIMIT ${BATCH})` },
  { key: "maintenanceDays", name: "maintenance", sql: `DELETE FROM maintenance_windows WHERE id IN (
      SELECT id FROM maintenance_windows WHERE ends_at < now() - make_interval(days => $1) LIMIT ${BATCH})` },
];

async function inTx(pool: pg.Pool, text: string, params: unknown[]): Promise<number> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('fudo.all_tenants', 'on', true)");
    const r = await c.query(text, params);
    await c.query("COMMIT");
    return r.rowCount ?? 0;
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}

export async function applyRetention(pool: pg.Pool, log: Logger, hasTimescale: boolean): Promise<Record<string, number>> {
  const stored = (await pool.query(`SELECT value FROM settings WHERE key = 'retention'`)).rows[0]?.value as Partial<Retention> | undefined;
  const r: Retention = { ...RETENTION_DEFAULTS, ...(stored ?? {}) };
  const deleted: Record<string, number> = {};
  const rules = [...RULES];
  // without TimescaleDB there is no retention policy for raw results: delete them here
  if (!hasTimescale) rules.unshift({ key: "checkResultsDays", name: "checkResults", sql: `DELETE FROM check_results WHERE ctid IN (
      SELECT ctid FROM check_results WHERE ts < now() - make_interval(days => $1) LIMIT ${BATCH})` });
  for (const rule of rules) {
    const days = r[rule.key];
    if (!days) continue; // 0 = keep forever
    let total = 0;
    for (let i = 0; i < MAX_BATCHES; i++) {
      const n = await inTx(pool, rule.sql, [days]);
      total += n;
      if (n === 0) break;
    }
    if (total) deleted[rule.name] = total;
  }
  await pool.query(`INSERT INTO settings (key, value) VALUES ('retention.lastRun', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify({ at: new Date().toISOString(), deleted })]);
  if (Object.keys(deleted).length) log.info({ deleted }, "data retention");
  return deleted;
}
