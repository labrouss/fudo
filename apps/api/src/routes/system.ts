import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { rlsEnforced, schema } from "@fudo/db";
import type { HealthResponse } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { APP_VERSION } from "../version.js";
import { backupJob } from "../lib/backup-job.js";
import { docsHtml, openApiSpec } from "../lib/openapi.js";
import { publicOrigin } from "../lib/origin.js";

const WORKER_STALE_MS = 3 * 60_000;

export const systemRoutes =
  ({ db, pool, env }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get("/openapi.json", async (req) => openApiSpec(publicOrigin(req, env)));
    app.get("/docs", async (req, reply) => reply.header("content-type", "text/html; charset=utf-8").send(docsHtml(publicOrigin(req, env))));

    app.get("/health", async (_req, reply): Promise<HealthResponse> => {
      let dbOk = false;
      let timescale: string | null = null;
      let lastHeartbeat: string | null = null;
      let rls: boolean | null = null;
      try {
        const r = await pool.query<{ v: string | null }>("SELECT extversion AS v FROM pg_extension WHERE extname = 'timescaledb'");
        dbOk = true;
        timescale = r.rows[0]?.v ?? null;
        const hb = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "worker.lastHeartbeat"));
        lastHeartbeat = (hb[0]?.value as string | undefined) ?? null;
        rls = await rlsEnforced(pool);
      } catch (err) {
        app.log.warn({ err }, "health check: database unavailable");
      }
      const workerOk = lastHeartbeat !== null && Date.now() - Date.parse(lastHeartbeat) < WORKER_STALE_MS;
      const ok = dbOk && timescale !== null && workerOk && rls === true;
      reply.code(dbOk ? 200 : 503);
      const job = backupJob.current;
      const restore = job?.kind === "restore" ? { state: job.state, finishedAt: job.finishedAt ?? null, errorCode: job.errorCode ?? null } : null;
      return { status: ok ? "ok" : "degraded", version: APP_VERSION, db: { ok: dbOk, timescale, rls }, worker: { lastHeartbeat, ok: workerOk }, restore };
    });
  };
