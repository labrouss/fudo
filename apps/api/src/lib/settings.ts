import { eq, sql } from "drizzle-orm";
import { schema, type Db } from "@fudo/db";

export async function getSetting<T>(db: Db, key: string): Promise<T | null> {
  const rows = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, key));
  return (rows[0]?.value as T | undefined) ?? null;
}

export async function setSetting(db: Db, key: string, value: unknown): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: sql`now()` } });
}

export const SETTING = {
  orgName: "org.name",
  setupCompletedAt: "setup.completedAt",
  smtp: "smtp",
  /** default language of notifications, emails and reports (a locale code) */
  notifyLocale: "notify.locale",
} as const;

export interface StoredSmtp {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordEnc: string | null;
  from: string;
  /** accept self-signed / untrusted certificates */
  allowUntrusted?: boolean;
}
