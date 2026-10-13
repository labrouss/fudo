import { and, eq, gt } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { schema, type Db } from "@fudo/db";
import { randomToken, sha256, type Env } from "@fudo/shared";

export const SESSION_COOKIE = "fudo_session";

export type SessionRow = typeof schema.sessions.$inferSelect;
export type UserRow = typeof schema.users.$inferSelect;

export class SessionStore {
  constructor(private db: Db, private env: Env) {}

  private cookieSecure(req: FastifyRequest): boolean {
    if (this.env.COOKIE_SECURE === "true") return true;
    if (this.env.COOKIE_SECURE === "false") return false;
    return req.protocol === "https";
  }

  async create(req: FastifyRequest, reply: FastifyReply, userId: string, mfaPassed: boolean): Promise<void> {
    const token = randomToken(32);
    const ttlMs = this.env.SESSION_TTL_HOURS * 3600_000;
    await this.db.insert(schema.sessions).values({
      id: sha256(token),
      userId,
      mfaPassed,
      expiresAt: new Date(Date.now() + ttlMs),
      ip: req.ip,
      userAgent: req.headers["user-agent"]?.slice(0, 300) ?? null,
    });
    reply.setCookie(SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: this.cookieSecure(req),
      maxAge: Math.floor(ttlMs / 1000),
    });
  }

  async load(req: FastifyRequest): Promise<{ session: SessionRow; user: UserRow } | null> {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return null;
    const rows = await this.db
      .select({ session: schema.sessions, user: schema.users })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())));
    const row = rows[0];
    if (!row || !row.user.isActive) return null;
    return row;
  }

  /** Replaces the current session with a fresh token (prevents session fixation after MFA). */
  async rotate(req: FastifyRequest, reply: FastifyReply, userId: string, mfaPassed: boolean): Promise<void> {
    await this.destroy(req, reply);
    await this.create(req, reply, userId, mfaPassed);
  }

  async destroy(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await this.db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  async destroyAllForUser(userId: string): Promise<void> {
    await this.db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  }
}
