import type { Tx } from "@fudo/db";
import { sql } from "drizzle-orm";
import { HttpError } from "../lib/errors.js";

export type Row = Record<string, unknown>;
export const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export async function rows(tx: Tx, q: ReturnType<typeof sql>): Promise<Row[]> {
  return (await tx.execute(q)).rows as Row[];
}

export function uniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === "23505" || e.cause?.code === "23505";
}

/** Rows of other scopes are readable (global from tenants) but never changeable here. */
export function assertOwned(row: Row, tenantId: string | null, what = "This item") {
  if ((row.tenant_id ?? null) !== tenantId) {
    throw new HttpError(403, "forbidden", `${what} belongs to ${row.tenant_id ? "another tenant" : "the Global infrastructure scope"} and can only be changed there`);
  }
}

export const notFound = (what: string) => new HttpError(404, "not_found", `${what} not found`);

/** text[] parameter for raw SQL (drizzle expands JS arrays into value lists). */
export const textArray = (items: string[]) => sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(items)}::jsonb))::text[]`;
