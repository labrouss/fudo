import type { FastifyPluginAsync } from "fastify";
import type { AppDeps } from "../server.js";
import { tenantScope, TENANT_HEADER } from "../lib/tenant-scope.js";

/** GET /api/live?scope=<tenant id|global>: Server-Sent Events (EventSource cannot send headers). */
export const liveRoutes =
  ({ db, live }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Querystring: { scope?: string } }>("/live", async (req, reply) => {
      req.headers[TENANT_HEADER] = String(req.query.scope ?? "");
      const scope = await tenantScope(req, db);
      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      live.add(reply.raw, scope.scopeId, scope.globalRead);
    });
  };
