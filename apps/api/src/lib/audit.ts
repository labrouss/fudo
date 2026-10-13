import type { Db } from "@fudo/db";
import { schema } from "@fudo/db";

export interface AuditEntry {
  userId?: string | null;
  tenantId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  /** Never put secrets here. */
  diff?: Record<string, unknown>;
}

export async function audit(db: Db, e: AuditEntry): Promise<void> {
  await db.insert(schema.auditLog).values({
    userId: e.userId ?? null,
    tenantId: e.tenantId ?? null,
    action: e.action,
    entityType: e.entityType ?? null,
    entityId: e.entityId ?? null,
    diff: e.diff ?? null,
  });
}
