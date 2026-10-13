import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

/**
 * `allTenants` opens every connection with fudo.all_tenants=on (worker only): the scheduler
 * works across tenants. The API never uses it; it scopes each request with withTenant().
 */
export function createDb(databaseUrl: string, opts: { allTenants?: boolean; max?: number; role?: string | null } = {}) {
  const startup = [opts.role ? `-c role=${opts.role}` : "", opts.allTenants ? "-c fudo.all_tenants=on" : ""].filter(Boolean).join(" ");
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: opts.max ?? 10,
    ...(startup ? { options: startup } : {}),
  });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

export type Db = ReturnType<typeof createDb>["db"];
