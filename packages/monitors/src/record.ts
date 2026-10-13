import type pg from "pg";
import type { MonitorStatus } from "./definitions.js";
import { nextState } from "./state.js";
import type { CheckResult } from "./runners/types.js";

export interface RecordOutcome {
  status: MonitorStatus;
  changed: boolean;
  from: MonitorStatus;
  retrying: boolean;
}

/** Is the monitor (or the asset it checks) inside an active maintenance window? */
export const MAINTENANCE_SQL = `
  SELECT EXISTS (
    SELECT 1 FROM maintenance_targets t JOIN maintenance_windows w ON w.id = t.window_id
      JOIN monitors m ON m.id = $1
     WHERE now() >= w.starts_at AND now() < w.ends_at
       AND ((t.entity_type = 'monitor' AND t.entity_id = m.id) OR (t.entity_type = 'asset' AND t.entity_id = m.asset_id))
  ) AS active`;

/**
 * Stores one check result and advances the monitor's state in a single transaction:
 * check_results row, streak counters, status, next run (retry interval while retrying),
 * and a state_changes row on transitions. Used by the scheduler and the push endpoint.
 */
export async function recordResult(
  pool: pg.Pool,
  monitorId: string,
  result: CheckResult,
  opts: { pushed?: boolean; inMaintenance?: boolean } = {},
): Promise<RecordOutcome | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('fudo.all_tenants', 'on', true)");
    if (opts.inMaintenance === undefined) {
      const mt = await client.query(MAINTENANCE_SQL, [monitorId]);
      opts = { ...opts, inMaintenance: mt.rows[0]?.active === true };
    }
    const r = await client.query(
      `SELECT tenant_id, status, fail_streak, success_streak, failures_before_down, successes_before_up, retry_interval_s, interval_s, paused
         FROM monitors WHERE id = $1 FOR UPDATE`,
      [monitorId],
    );
    const m = r.rows[0];
    if (!m) {
      await client.query("ROLLBACK");
      return null; // deleted while the check was running
    }
    // a result from an older runner (or a push with its own text) has no parts: store the text as one raw part
    const parts = JSON.stringify(result.parts ?? [result.message.slice(0, 1000)]);
    const next = nextState(
      { status: m.status, failStreak: m.fail_streak, successStreak: m.success_streak },
      result.status,
      { failuresBeforeDown: m.failures_before_down, successesBeforeUp: m.successes_before_up },
    );
    await client.query(
      `UPDATE monitors SET
         status = $2, fail_streak = $3, success_streak = $4,
         status_changed_at = CASE WHEN $5 THEN now() ELSE status_changed_at END,
         last_check_at = now(), last_latency_ms = $6, last_message = $7, last_message_parts = $10,
         last_push_at = CASE WHEN $8 THEN now() ELSE last_push_at END,
         next_run_at = CASE WHEN $9 THEN now() + make_interval(secs => retry_interval_s) ELSE next_run_at END
       WHERE id = $1`,
      [monitorId, next.status, next.failStreak, next.successStreak, next.changed, result.latencyMs, result.message.slice(0, 1000), Boolean(opts.pushed), next.retrying && !opts.pushed, parts],
    );
    await client.query(
      `INSERT INTO check_results (monitor_id, tenant_id, status, latency_ms, message, data, in_maintenance, message_parts) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [monitorId, m.tenant_id, result.status, result.latencyMs, result.message.slice(0, 1000), result.data ? JSON.stringify(result.data) : null, Boolean(opts.inMaintenance), parts],
    );
    if (next.changed) {
      await client.query(
        `INSERT INTO state_changes (tenant_id, entity_type, entity_id, from_status, to_status, message, message_parts) VALUES ($1, 'monitor', $2, $3, $4, $5, $6)`,
        [m.tenant_id, monitorId, m.status, next.status, result.message.slice(0, 1000), parts],
      );
    }
    await client.query("SELECT pg_notify('fudo_live', json_build_object('t', $1::uuid, 'k', 'monitor')::text)", [m.tenant_id]);
    await client.query("COMMIT");
    return { status: next.status, changed: next.changed, from: m.status, retrying: next.retrying };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
