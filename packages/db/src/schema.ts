/**
 * Drizzle table definitions used for typed queries.
 * The source of truth for DDL is packages/db/migrations/*.sql (plain SQL, so
 * TimescaleDB features like hypertables and policies can be used directly).
 * Keep both in sync when adding a migration.
 */
import { pgTable, uuid, text, boolean, timestamp, jsonb, bigserial, bigint, integer, real } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  /** NULL until an invited user accepts the invitation */
  passwordHash: text("password_hash"),
  totpSecretEnc: text("totp_secret_enc"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  isSuperadmin: boolean("is_superadmin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  totpLastStep: bigint("totp_last_step", { mode: "number" }),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
  /** a new 2FA secret waiting to be confirmed (the old one works until then) */
  pendingTotpSecretEnc: text("pending_totp_secret_enc"),
  /** personal notification steps: [{ contactId, delayMin }] */
  notificationSteps: jsonb("notification_steps").notNull().default([]),
});

/** Personal contact methods (email, Teams workflow, Telegram chat), verified with a code. */
export const userContactMethods = pgTable("user_contact_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  label: text("label").notNull().default(""),
  targetEnc: text("target_enc").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  codeHash: text("code_hash"),
  codeExpiresAt: timestamp("code_expires_at", { withTimezone: true }),
  codeAttempts: integer("code_attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recoveryCodes = pgTable("recovery_codes", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userTenantRoles = pgTable(
  "user_tenant_roles",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // NULL tenant = global (infrastructure) scope
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"invite" | "reset_2fa">().notNull(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const sessions = pgTable("sessions", {
  /** sha256 of the session token */
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mfaPassed: boolean("mfa_passed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  userId: uuid("user_id"),
  tenantId: uuid("tenant_id"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  diff: jsonb("diff"),
});


export const monitors = pgTable("monitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** NULL = global (shared infrastructure) monitor */
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  assetId: uuid("asset_id"),
  credentialId: uuid("credential_id"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  intervalS: integer("interval_s").notNull(),
  retryIntervalS: integer("retry_interval_s").notNull(),
  timeoutS: integer("timeout_s").notNull(),
  failuresBeforeDown: integer("failures_before_down").notNull(),
  successesBeforeUp: integer("successes_before_up").notNull(),
  paused: boolean("paused").notNull().default(false),
  tags: text("tags").array().notNull().default([]),
  description: text("description").notNull().default(""),
  pushToken: text("push_token").unique(),
  status: text("status").$type<"UNKNOWN" | "UP" | "DEGRADED" | "DOWN">().notNull().default("UNKNOWN"),
  failStreak: integer("fail_streak").notNull().default(0),
  successStreak: integer("success_streak").notNull().default(0),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
  lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
  lastLatencyMs: real("last_latency_ms"),
  lastMessage: text("last_message"),
  lastPushAt: timestamp("last_push_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checkResults = pgTable("check_results", {
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  monitorId: uuid("monitor_id").notNull(),
  tenantId: uuid("tenant_id"),
  status: text("status").notNull(),
  latencyMs: real("latency_ms"),
  message: text("message"),
  data: jsonb("data"),
});

export const stateChanges = pgTable("state_changes", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  tenantId: uuid("tenant_id"),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  message: text("message"),
  causeEntityId: uuid("cause_entity_id"),
});
