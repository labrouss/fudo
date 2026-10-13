import type { FastifyPluginAsync } from "fastify";
import { recordResult } from "@fudo/monitors/record";
import type { AppDeps } from "../server.js";
import { HttpError } from "../lib/errors.js";

/**
 * Public heartbeat endpoint for push monitors:
 *   GET|POST /api/push/<token>?status=up|down&msg=text&ping=123
 * The token is the only credential; rotate it from the monitor page if it leaks.
 */
export const pushRoutes =
  ({ pool }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    // Accept any body (form posts, plain text, nothing) and ignore it; only the query string matters.
    app.addContentTypeParser("*", (_req, payload, done) => { payload.resume(); payload.on("end", () => done(null, undefined)); });
    app.removeContentTypeParser("application/json");
    app.addContentTypeParser("application/json", (_req, payload, done) => { payload.resume(); payload.on("end", () => done(null, undefined)); });

    const handler = async (req: { params: { token: string }; query: Record<string, string | undefined> }) => {
      const token = req.params.token;
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw new HttpError(404, "not_found", "Unknown push token");
      const client = await pool.connect();
      let monitor: { id: string; paused: boolean } | undefined;
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('fudo.all_tenants', 'on', true)");
        monitor = (await client.query("SELECT id, paused FROM monitors WHERE push_token = $1 AND type = 'push'", [token])).rows[0];
        await client.query("COMMIT");
      } finally {
        client.release();
      }
      if (!monitor) throw new HttpError(404, "not_found", "Unknown push token");
      if (monitor.paused) return { ok: false, message: "Monitor is paused" };
      const down = String(req.query.status ?? "up").toLowerCase() === "down";
      const ping = Number(req.query.ping);
      const msg = String(req.query.msg ?? (down ? "Reported down" : "OK")).slice(0, 500);
      const out = await recordResult(pool, monitor.id, { status: down ? "DOWN" : "UP", latencyMs: Number.isFinite(ping) ? ping : null, message: msg }, { pushed: true });
      return { ok: true, status: out?.status };
    };
    const limited = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };
    app.get<{ Params: { token: string }; Querystring: Record<string, string | undefined> }>("/push/:token", limited, handler);
    app.post<{ Params: { token: string }; Querystring: Record<string, string | undefined> }>("/push/:token", limited, handler);
  };
