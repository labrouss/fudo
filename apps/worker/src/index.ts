import pino from "pino";
import { PgBoss } from "pg-boss";
import { sql } from "drizzle-orm";
import { loadEnv, prettyTransport } from "@fudo/shared";
import { materializeSeries, openDatabase, schema } from "@fudo/db";
import { Scheduler } from "./scheduler.js";
import { Evaluator } from "./evaluator.js";
import { IncidentManager } from "./incidents.js";
import { Dispatcher } from "./dispatcher.js";
import { BackupScheduler } from "./backups.js";
import { applyRetention } from "./retention.js";
import { OncallEscalator } from "./oncall.js";
import { ReportScheduler } from "./reports.js";
import { TrapReceiver } from "./traps.js";
import { DiscoveryRunner } from "./discovery.js";

const env = loadEnv();
const log = pino({
  level: env.LOG_LEVEL,
  ...prettyTransport(env.NODE_ENV),
});

// The worker operates across tenants: its connections open with fudo.all_tenants=on (row-level security).
const { pool, db } = await openDatabase(env.DATABASE_URL, { allTenants: true, max: 20, log: (m) => log.info(m) });

// pg-boss keeps its own tables in the "pgboss" schema of the same database.
const boss = new PgBoss(env.DATABASE_URL);
boss.on("error", (err) => log.error({ err }, "pg-boss error"));
await boss.start();

/** Worker heartbeat: lets the API/UI show whether background processing is alive. */
const HEARTBEAT = "system.heartbeat";
await boss.createQueue(HEARTBEAT);
await boss.schedule(HEARTBEAT, "* * * * *");
await boss.work(HEARTBEAT, async () => {
  const now = new Date().toISOString();
  await db
    .insert(schema.settings)
    .values({ key: "worker.lastHeartbeat", value: now })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: now, updatedAt: sql`now()` } });
  log.debug({ now }, "heartbeat");
});

/** Hourly cleanup: expired sessions and invites, and data retention. */
const CLEANUP = "system.cleanup";
const hasTimescale = (await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'")).rowCount === 1;
await boss.createQueue(CLEANUP);
await boss.schedule(CLEANUP, "17 * * * *");
await boss.work(CLEANUP, async () => {
  const s = await pool.query("DELETE FROM sessions WHERE expires_at < now()");
  const i = await pool.query("DELETE FROM invites WHERE expires_at < now() - interval '30 days'");
  // data retention (Settings › Data retention); raw results here only without TimescaleDB
  const deleted = await applyRetention(pool, log, hasTimescale).catch((err) => { log.error({ err }, "data retention"); return {}; });
  log.info({ sessions: s.rowCount, invites: i.rowCount, ...deleted }, "cleanup done");
});

const scheduler = new Scheduler(pool, log, {
  concurrency: Number(process.env.CHECK_CONCURRENCY ?? 50),
  tickMs: 1000,
  appSecret: env.APP_SECRET,
});
const evaluator = new Evaluator(pool, log);
const incidents = new IncidentManager(pool, log);
evaluator.afterRun = () => incidents.reconcile();
const dispatcher = new Dispatcher(pool, log, env.APP_SECRET, env.PUBLIC_URL);
dispatcher.start();
const reports = new ReportScheduler(pool, log, env.APP_SECRET);
reports.start();
const backups = new BackupScheduler(pool, log, env.APP_SECRET);
backups.start();
// recurring maintenance: keep the windows of the coming weeks created
const oncall = new OncallEscalator(pool, log, env.APP_SECRET, env.PUBLIC_URL);
oncall.start();
const topUpMaintenance = () => void materializeSeries(pool).catch((err) => log.error({ err }, "maintenance series"));
topUpMaintenance();
const maintenanceTimer = setInterval(topUpMaintenance, 15 * 60_000);
// SNMP traps (UDP): TRAP_ENABLED=false turns the receiver off (e.g. on a second worker)
const traps = process.env.TRAP_ENABLED === "false" ? null : new TrapReceiver(pool, log, {
  port: Number(process.env.TRAP_LISTEN_PORT ?? 1162),
  publishedPort: Number(process.env.TRAP_PUBLISHED_PORT ?? process.env.TRAP_LISTEN_PORT ?? 1162),
  appSecret: env.APP_SECRET,
});
await traps?.start();
const discovery = new DiscoveryRunner(pool, log, env.APP_SECRET);
await discovery.start();
scheduler.onChange = () => evaluator.schedule(500);
await evaluator.start();
scheduler.start();

// Write one immediately so the UI does not wait up to a minute after start.
await boss.send(HEARTBEAT, {});
log.info("worker started");

const shutdown = async (signal: string) => {
  log.info(`${signal} received, shutting down`);
  await traps?.stop();
  await discovery.stop();
  await scheduler.stop();
  await evaluator.stop();
  dispatcher.stop();
  reports.stop();
  backups.stop();
  oncall.stop();
  clearInterval(maintenanceTimer);
  await boss.stop({ graceful: true, timeout: 10_000 });
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
