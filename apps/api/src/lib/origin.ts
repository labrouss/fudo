import type { FastifyRequest } from "fastify";
import type { Env } from "@fudo/shared";

/**
 * Base URL for links Fudo hands out (invitations, push URLs).
 * PUBLIC_URL wins; otherwise the browser's Origin, then the (proxy-aware) Host of the request.
 */
export function publicOrigin(req: FastifyRequest, env: Env): string {
  if (env.PUBLIC_URL) return env.PUBLIC_URL;
  const o = req.headers.origin;
  if (typeof o === "string" && /^https?:\/\/[^/]+$/.test(o)) return o;
  return `${req.protocol}://${req.host}`;
}
