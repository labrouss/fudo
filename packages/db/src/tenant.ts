import { sql } from "drizzle-orm";
import type { Db } from "./client.js";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Runs `fn` in a transaction whose row-level-security context is one tenant, "global"
 * (shared infrastructure rows, tenant_id NULL) or "all" (cross-tenant maintenance). Settings are transaction-local, so pooled connections never
 * leak a tenant context to the next request.
 */
export function withTenant<T>(db: Db, tenant: string | "global" | "all", fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (tenant === "all") await tx.execute(sql`SELECT set_config('fudo.all_tenants', 'on', true)`);
    else await tx.execute(sql`SELECT set_config('fudo.tenant_id', ${tenant}, true)`);
    return fn(tx);
  });
}
