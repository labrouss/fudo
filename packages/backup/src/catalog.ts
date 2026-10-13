/** What a backup covers, read from the database catalog (so new tables are included automatically). */
import type pg from "pg";

/** Never backed up: sessions (everyone signs in again after a restore) and migration bookkeeping. */
export const EXCLUDED = new Set(["sessions", "schema_migrations"]);
/** Raw check results: optional ("history"), can be large. */
export const HISTORY_TABLES = new Set(["check_results", "snmp_traps"]);

type Q = pg.PoolClient;

/** Application tables in dependency order (referenced tables first). */
export async function tablesInOrder(c: Q): Promise<string[]> {
  const tables = (await c.query(`SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') ORDER BY 1`)).rows.map((r) => r.t as string);
  const fks = (await c.query(`SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent FROM pg_constraint
    WHERE contype = 'f' AND connamespace = 'public'::regnamespace AND conrelid <> confrelid`)).rows as Array<{ child: string; parent: string }>;
  const deps = new Map(tables.map((t) => [t, new Set<string>()]));
  for (const f of fks) deps.get(f.child)?.add(f.parent);
  const out: string[] = [], seen = new Set<string>();
  const visit = (t: string, path: Set<string>) => {
    if (seen.has(t)) return;
    if (path.has(t)) throw new Error(`Circular foreign keys involving ${t}`);
    path.add(t);
    for (const p of deps.get(t) ?? []) visit(p, path);
    path.delete(t); seen.add(t); out.push(t);
  };
  for (const t of tables) visit(t, new Set());
  return out;
}

export async function columnsOf(c: Q, table: string): Promise<string[]> {
  return (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [table])).rows.map((r) => r.column_name as string);
}

/** Foreign keys of a table on itself (set aside while loading, re-checked after). */
export async function selfForeignKeys(c: Q, table: string): Promise<Array<{ name: string; def: string }>> {
  return (await c.query(`SELECT conname AS name, pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE contype = 'f' AND conrelid = $1::regclass AND confrelid = $1::regclass`, [table])).rows as Array<{ name: string; def: string }>;
}

/** Sequences and the columns that take their values (e.g. incident numbers). */
export async function sequenceColumns(c: Q): Promise<Array<{ table: string; column: string; seq: string }>> {
  const rows = (await c.query(`SELECT table_name, column_name, column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'`)).rows;
  return rows.map((r) => ({ table: r.table_name as string, column: r.column_name as string, seq: /nextval\('([^']+)'/.exec(r.column_default as string)![1]!.replace(/^public\./, "") }));
}

export async function continuousAggregates(c: Q): Promise<string[]> {
  try { return (await c.query(`SELECT view_name FROM timescaledb_information.continuous_aggregates`)).rows.map((r) => r.view_name as string); }
  catch { return []; }
}

export async function currentSchema(c: Q): Promise<string> {
  const r = (await c.query(`SELECT max(name) AS m FROM schema_migrations`)).rows[0];
  return String(r?.m ?? "0000").slice(0, 4);
}

/** Quoted identifier (table and column names come from the catalog, but quote anyway). */
export const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
