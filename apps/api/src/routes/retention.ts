/**
 * Data retention (superadmins): how long each kind of data is kept, and how much space it uses.
 * Check results and their summaries follow TimescaleDB retention policies (set here); the worker's
 * hourly cleanup removes the rest in small batches (apps/worker/src/retention.ts).
 */
import type { FastifyPluginAsync } from "fastify";
import pg from "pg";
import { RETENTION_DEFAULTS, retentionSchema, type Retention } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { parse } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { getSetting, setSetting } from "../lib/settings.js";
import { requireSuperadmin } from "../plugins/auth.js";

export const RETENTION_KEY = "retention";

/** Tables (and continuous aggregates) behind each retention category. */
const SIZES: Record<string, { tables?: string[]; aggregate?: string; hypertable?: string }> = {
  checkResultsDays: { hypertable: "check_results" },
  hourlyDays: { aggregate: "check_results_hourly" },
  dailyDays: { aggregate: "check_results_daily" },
  statusHistoryDays: { tables: ["state_changes"] },
  incidentsDays: { tables: ["incidents", "incident_events", "oncall_pages"] },
  deliveriesDays: { tables: ["notification_deliveries", "oncall_sends"] },
  auditDays: { tables: ["audit_log"] },
  maintenanceDays: { tables: ["maintenance_windows", "maintenance_targets"] },
  trapsDays: { tables: ["snmp_traps"] },
};

export const retentionRoutes =
  ({ db, pool, env }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const hasTimescale = async () => !!(await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'")).rowCount;

    app.get("/settings/retention", async (req) => {
      requireSuperadmin(req);
      const settings = { ...RETENTION_DEFAULTS, ...((await getSetting<Partial<Retention>>(db, RETENTION_KEY)) ?? {}) };
      const ts = await hasTimescale();
      const sizes: Record<string, { bytes: number; rows: number }> = {};
      for (const [k, d] of Object.entries(SIZES)) {
        let bytes = 0, rows = 0;
        if (d.hypertable || d.aggregate) {
          if (ts) {
            const rel = d.hypertable ?? (await pool.query(`SELECT format('%I.%I', materialization_hypertable_schema, materialization_hypertable_name) AS r
                                                           FROM timescaledb_information.continuous_aggregates WHERE view_name = $1`, [d.aggregate])).rows[0]?.r;
            if (rel) {
              bytes = Number((await pool.query(`SELECT coalesce(hypertable_size($1::regclass), 0) AS b`, [rel])).rows[0].b);
              rows = Number((await pool.query(`SELECT coalesce(sum(c.reltuples), 0) AS n FROM timescaledb_information.chunks ch JOIN pg_class c ON c.oid = format('%I.%I', ch.chunk_schema, ch.chunk_name)::regclass
                                               WHERE format('%I.%I', ch.hypertable_schema, ch.hypertable_name) = $1`, [rel])).rows[0].n);
            }
          } else if (d.hypertable) {
            bytes = Number((await pool.query(`SELECT pg_total_relation_size($1) AS b`, [d.hypertable])).rows[0].b);
          }
        }
        for (const t of d.tables ?? []) {
          const r = (await pool.query(`SELECT pg_total_relation_size(c.oid) AS b, greatest(c.reltuples, 0) AS n FROM pg_class c WHERE c.oid = $1::regclass`, [t])).rows[0];
          bytes += Number(r?.b ?? 0); rows += Number(r?.n ?? 0);
        }
        sizes[k] = { bytes, rows: Math.round(rows) };
      }
      return { settings, defaults: RETENTION_DEFAULTS, sizes, timescale: ts, lastCleanup: (await getSetting(db, "retention.lastRun")) ?? null };
    });

    app.put("/settings/retention", async (req) => {
      const user = requireSuperadmin(req);
      const input = parse(retentionSchema, req.body);
      if (await hasTimescale()) {
        // policy changes need the tables' owner: DATABASE_URL (it runs the migrations), for this only
        const owner = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
        try {
          const set = async (rel: string, days: number) => {
            await owner.query(`SELECT remove_retention_policy($1::regclass, if_exists => true)`, [rel]);
            if (days > 0) await owner.query(`SELECT add_retention_policy($1::regclass, make_interval(days => $2::int))`, [rel, days]);
          };
          await set("check_results", input.checkResultsDays);
          await set("check_results_hourly", input.hourlyDays);
          await set("check_results_daily", input.dailyDays);
        } finally { await owner.end(); }
      }
      await setSetting(db, RETENTION_KEY, input);
      await audit(db, { userId: user.id, action: "settings.retention", diff: input });
      return { ok: true };
    });
  };
