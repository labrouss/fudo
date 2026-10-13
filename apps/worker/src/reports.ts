import type pg from "pg";
import type { Logger } from "pino";
import { emailReport, nextRun, previousPeriodIn, reportLangFor, type Period } from "@fudo/reports";

/** Sends scheduled reports (checked every minute; several workers are safe thanks to SKIP LOCKED). */
export class ReportScheduler {
  private timer: NodeJS.Timeout | null = null;
  constructor(private pool: pg.Pool, private log: Logger, private appSecret: string) {}
  start() { this.timer = setInterval(() => void this.tick(), 60_000); setTimeout(() => void this.tick(), 5000); }
  stop() { if (this.timer) clearInterval(this.timer); }

  private async tick() {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const due = (await c.query("SELECT * FROM report_schedules WHERE enabled AND next_run_at <= now() ORDER BY next_run_at LIMIT 5 FOR UPDATE SKIP LOCKED")).rows;
      for (const s of due) {
        // advance first, so a failing report is not retried every minute
        await c.query("UPDATE report_schedules SET next_run_at = $2, last_run_at = now() WHERE id = $1", [s.id, new Date(nextRun(s.period as Period, s.send_hour, s.timezone)).toISOString()]);
      }
      await c.query("COMMIT");
      for (const s of due) {
        const L = await reportLangFor(this.pool, s.locale);
        const range = previousPeriodIn(s.period as Period, s.timezone, L);
        let status = "sent", detail = "";
        try {
          detail = (await emailReport(this.pool, this.appSecret, { tenantId: s.tenant_id, ...range, timezone: s.timezone, businessHours: s.business_hours, recipients: s.recipients, formats: s.formats, lang: L })).detail;
          this.log.info({ schedule: s.name, period: range.label }, "report sent");
        } catch (err) {
          status = "failed"; detail = (err as Error).message.slice(0, 500);
          this.log.warn({ schedule: s.name, err: detail }, "report failed");
        }
        await this.pool.query("INSERT INTO report_runs (schedule_id, tenant_id, period_from, period_to, status, detail) VALUES ($1, $2, $3, $4, $5, $6)",
          [s.id, s.tenant_id, new Date(range.from).toISOString(), new Date(range.to).toISOString(), status, detail]);
      }
    } catch (err) {
      await c.query("ROLLBACK").catch(() => {});
      this.log.error({ err }, "report scheduler failed");
    } finally {
      c.release();
    }
  }
}
