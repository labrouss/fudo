import type { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { requireUser } from "../plugins/auth.js";

/** Public: the sign-in screen is translated too. */
export const localeRoutes =
  ({ db, locales }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get("/locales", async (_req, reply) => { reply.header("cache-control", "no-cache"); return locales.list(); });
    app.get<{ Params: { code: string } }>("/locales/:code", async (req, reply) => {
      const m = locales.messages(req.params.code);
      if (!m) throw new HttpError(404, "not_found", "Language not found");
      reply.header("cache-control", "no-cache");
      return { code: req.params.code, messages: m };
    });
    app.put("/auth/me/locale", async (req) => {
      const user = requireUser(req);
      const { locale } = parse(z.object({ locale: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/).nullable() }), req.body);
      if (locale && !locales.list().some((l) => l.code === locale)) throw new HttpError(400, "validation_failed", "Unknown language");
      await db.execute(sql`UPDATE users SET locale = ${locale} WHERE id = ${user.id}`);
      return { ok: true };
    });
  };
