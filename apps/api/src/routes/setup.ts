import type { FastifyPluginAsync } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@fudo/db";
import { setupAdminSchema, type SetupStatusResponse } from "@fudo/shared";
import type { AppDeps } from "../server.js";
import { conflict, parse } from "../lib/errors.js";
import { hashPassword } from "../lib/passwords.js";
import { audit } from "../lib/audit.js";
import { getSetting, SETTING } from "../lib/settings.js";

/**
 * First-run setup wizard (F-101).
 *   1. POST /setup/admin   → creates the superadmin (2FA not yet enabled) + a pre-MFA session
 *   2. GET/POST /enroll/totp → QR code, then first code verification (shared with invitations)
 *   4. SMTP is configured afterwards through /settings/smtp (optional)
 * Setup counts as complete once a superadmin with 2FA exists; until then step 1 may be repeated.
 */
export const setupRoutes =
  ({ db, pool, sessions, totp }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const isSetupComplete = async () => {
      const r = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.users)
        .where(and(eq(schema.users.isSuperadmin, true), eq(schema.users.totpEnabled, true)));
      return (r[0]?.n ?? 0) > 0;
    };

    app.get("/setup/status", async (): Promise<SetupStatusResponse> => ({
      setupRequired: !(await isSetupComplete()),
      orgName: await getSetting<string>(db, SETTING.orgName),
    }));

    app.post("/setup/admin", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
      const input = parse(setupAdminSchema, req.body);
      const passwordHash = await hashPassword(input.password);

      // Serialize concurrent setup attempts and re-check completion inside the lock.
      const client = await pool.connect();
      let userId: string;
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(727002)");
        const done = await client.query(
          "SELECT 1 FROM users WHERE is_superadmin AND totp_enabled LIMIT 1",
        );
        if (done.rowCount) {
          await client.query("ROLLBACK");
          throw conflict("Setup is already complete. Sign in instead.");
        }
        // Discard an abandoned attempt (admin created, 2FA never finished).
        await client.query("DELETE FROM users WHERE is_superadmin AND NOT totp_enabled");
        const r = await client.query<{ id: string }>(
          `INSERT INTO users (email, display_name, password_hash, totp_secret_enc, is_superadmin)
           VALUES ($1, $2, $3, $4, true) RETURNING id`,
          [input.email, input.displayName, passwordHash, totp.newEncryptedSecret()],
        );
        userId = r.rows[0]!.id;
        await client.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [SETTING.orgName, JSON.stringify(input.orgName)],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      await sessions.create(req, reply, userId, false);
      await audit(db, { userId, action: "setup.admin_created", entityType: "user", entityId: userId, diff: { email: input.email } });
      return { ok: true };
    });

  };
