import fp from "fastify-plugin";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { HttpError } from "../lib/errors.js";
import { requestLang, translateApiText } from "../lib/api-i18n.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * - Cookies and route-level rate limits
 * - CSRF: state-changing API calls must send JSON. Browsers cannot send
 *   application/json cross-site without a CORS preflight (which we never allow),
 *   and the session cookie is SameSite=Lax.
 * - Consistent JSON error shape: { error, message, fields? }
 */
export const securityPlugin = fp(async (app) => {
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_req, ctx) =>
      ((seconds: number) => new HttpError(429, "rate_limited", `Too many attempts. Try again in ${seconds} seconds.`))(Math.ceil(ctx.ttl / 1000)),
  });

  app.addHook("onRequest", async (req) => {
    // /api/push/* is called by scripts (curl, Invoke-WebRequest) with any or no body.
    // backup uploads are raw bytes; the custom header cannot be sent by cross-site forms
    const path = req.url.split("?")[0];
    const backupUpload = req.method === "PUT" && (path === "/api/backups/upload" || path === "/api/config/import/kuma/upload") && req.headers["x-fudo-upload"] === "1";
    if (MUTATING.has(req.method) && req.url.startsWith("/api/") && !req.url.startsWith("/api/push/") && !backupUpload) {
      const ct = req.headers["content-type"] ?? "";
      if (!ct.startsWith("application/json")) {
        throw new HttpError(415, "json_required", "Requests must use Content-Type: application/json");
      }
    }
  });

  app.setErrorHandler((err, req, reply) => {
    // messages in the interface language (x-fudo-lang); the `error` code stays the same
    const lang = requestLang(req.headers);
    const tr = (m: string) => translateApiText(lang, m);
    const send = (status: number, error: string, message: string, fields?: Record<string, string>) =>
      reply.code(status).send({ error, message: tr(message), ...(fields ? { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, tr(v)])) } : {}) });
    if (err instanceof HttpError) return send(err.status, err.code, err.message, err.fields);
    // Malformed ids in the URL (invalid uuid syntax) mean "no such item", not a server error.
    const pgCode = (err as { code?: string; cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code;
    if (pgCode === "22P02") return send(404, "not_found", "Not found");
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) return send(429, "rate_limited", "Too many requests. Wait a moment and try again.");
    if (status && status >= 400 && status < 500) return send(status, "bad_request", (err as Error).message);
    req.log.error({ err }, "unhandled error");
    return send(500, "internal", "Something went wrong on the server. Check the API logs.");
  });
});
