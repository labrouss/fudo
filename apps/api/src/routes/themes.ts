import type { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { THEME_ID, THEME_SYSTEM } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { HttpError, parse } from "../lib/errors.js";
import { requireUser } from "../plugins/auth.js";

/** Public: the sign-in screen uses the theme the browser last had. */
export const themeRoutes =
  ({ db, themes }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get("/themes", async (_req, reply) => { reply.header("cache-control", "no-cache"); return themes.list(); });
    app.get<{ Params: { id: string } }>("/themes/:id", async (req, reply) => {
      const t = THEME_ID.test(req.params.id) ? themes.get(req.params.id) : null;
      if (!t) throw new HttpError(404, "not_found", "Theme not found");
      reply.header("cache-control", "no-cache");
      return t;
    });
    app.put("/auth/me/theme", async (req) => {
      const user = requireUser(req);
      const { theme } = parse(z.object({ theme: z.string().nullable() }), req.body);
      if (theme !== null && theme !== THEME_SYSTEM && !themes.has(theme)) throw new HttpError(400, "validation_failed", "Unknown theme");
      await db.execute(sql`UPDATE users SET theme = ${theme} WHERE id = ${user.id}`);
      return { ok: true };
    });
  };
