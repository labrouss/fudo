import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type pg from "pg";

/** Finds packages/db/migrations by walking up from cwd (works in dev, tests and Docker). */
export function resolveMigrationsDir(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "packages", "db", "migrations");
    if (existsSync(candidate)) return candidate;
    const local = path.join(dir, "migrations");
    if (existsSync(local) && existsSync(path.join(dir, "src", "migrate.ts"))) return local;
    dir = path.dirname(dir);
  }
  throw new Error("Could not locate migrations directory; set MIGRATIONS_DIR");
}

/**
 * Minimal forward-only migration runner.
 * Applies NNNN_name.sql files in order, each in its own transaction,
 * guarded by an advisory lock so api + worker can start concurrently.
 */
export async function runMigrations(pool: pg.Pool, log: (msg: string) => void = console.log): Promise<number> {
  // must be pg_has_role-safe even before 0009 created the role
  const dir = resolveMigrationsDir();
  const files = (await readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const client = await pool.connect();
  let applied = 0;
  try {
    await client.query("SELECT pg_advisory_lock(727001)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(dir, file), "utf8");
      log(`applying migration ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    await grantAppRole(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock(727001)").catch(() => {});
    client.release();
  }
  return applied;
}

export const APP_ROLE = "fudo_app";

/** Gives the application role access to everything in the public schema (after each migration run). */
async function grantAppRole(client: pg.PoolClient) {
  const exists = (await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE])).rowCount;
  if (!exists) return;
  await client.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await client.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);
  await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${APP_ROLE}`);
}

/**
 * Connection options for the application pool: switch to fudo_app when the connecting user would
 * bypass row-level security (superuser or BYPASSRLS) and the role is available.
 */
export async function appRoleFor(pool: pg.Pool): Promise<{ role: string | null; reason: string }> {
  const r = await pool.query(
    `SELECT r.rolsuper OR r.rolbypassrls AS bypass, pg_has_role(current_user, $1, 'MEMBER') AS member
       FROM pg_roles r WHERE r.rolname = current_user`, [APP_ROLE]).catch(() => null);
  const row = r?.rows[0];
  if (!row) return { role: null, reason: "could not inspect the database user" };
  if (!row.bypass) return { role: null, reason: "database user is subject to row-level security" };
  if (!row.member) return { role: null, reason: `database user bypasses row-level security and role ${APP_ROLE} is not available` };
  return { role: APP_ROLE, reason: `switching to ${APP_ROLE}` };
}
