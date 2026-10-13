export * from "./client.js";
export * from "./migrate.js";
export * from "./tenant.js";
export * from "./graph.js";
export * as schema from "./schema.js";

import { appRoleFor, runMigrations } from "./migrate.js";
import { createDb as _createDb } from "./client.js";

/**
 * Migrates with the connecting (admin) user, then returns the application pool, switched to the
 * RLS-bound role when needed. `rls` tells whether row-level security applies to the pool.
 */
export async function openDatabase(databaseUrl: string, opts: { allTenants?: boolean; max?: number; log: (msg: string) => void }) {
  const admin = new (await import("pg")).default.Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await runMigrations(admin, opts.log);
    const { role, reason } = await appRoleFor(admin);
    opts.log(`database: ${reason}`);
    const out = _createDb(databaseUrl, { allTenants: opts.allTenants, max: opts.max, role });
    return { ...out, role };
  } finally {
    await admin.end();
  }
}

/** true when row-level security applies to connections of this pool. */
export async function rlsEnforced(pool: import("pg").Pool): Promise<boolean> {
  const r = await pool.query("SELECT NOT (r.rolsuper OR r.rolbypassrls) AS enforced FROM pg_roles r WHERE r.rolname = current_user");
  return r.rows[0]?.enforced === true;
}
export * from "./maintenance-series.js";
