import { z } from "zod";
import { GLOBAL_ROLES, TENANT_ROLES } from "./domain.js";

export const PASSWORD_MIN_LENGTH = 12;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(256, "Use at most 256 characters")
  .refine((p) => new Set(p).size >= 5, "Use a less repetitive password");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

export const setupAdminSchema = z
  .object({
    orgName: z.string().trim().min(2, "Enter the organization name").max(100),
    displayName: z.string().trim().min(2, "Enter your name").max(100),
    email: emailSchema,
    password: passwordSchema,
  })
  .refine((v) => !v.password.toLowerCase().includes(v.email.split("@")[0]!.toLowerCase()), {
    path: ["password"],
    message: "The password must not contain your email name",
  });

export const totpCodeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(256) });

export const mfaSchema = z.union([
  z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }),
  z.object({ recoveryCode: z.string().trim().min(12).max(20) }),
]);

export const smtpSchema = z.object({
  host: z.string().trim().min(1, "Enter the SMTP host"),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().trim().max(200).optional().default(""),
  password: z.string().max(500).optional(),
  from: z.string().trim().min(3, "Enter the sender address"),
  /** accept self-signed / untrusted certificates (local SMTP relays) */
  allowUntrusted: z.boolean().optional().default(false),
});

export const smtpTestSchema = z.object({ to: emailSchema });

export type SetupAdminInput = z.infer<typeof setupAdminSchema>;
export type SmtpInput = z.infer<typeof smtpSchema>;

export const tenantSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,39}$/, "Use 2–40 lowercase letters, digits or dashes"),
  description: z.string().trim().max(300).optional().default(""),
  isActive: z.boolean().optional().default(true),
});

export const roleAssignmentSchema = z
  .object({
    tenantId: z.string().uuid().nullable(),
    role: z.enum([...new Set([...GLOBAL_ROLES, ...TENANT_ROLES])] as [string, ...string[]]),
  })
  .refine(
    (r) => (r.tenantId === null ? (GLOBAL_ROLES as readonly string[]).includes(r.role) : (TENANT_ROLES as readonly string[]).includes(r.role)),
    { message: "This role is not available in that scope", path: ["role"] },
  );

export const userCreateSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(2, "Enter a name").max(100),
  isSuperadmin: z.boolean().optional().default(false),
  roles: z.array(roleAssignmentSchema).max(200).optional().default([]),
  sendEmail: z.boolean().optional().default(true),
  /** the new user's language: used for the invitation email and their first sign-in */
  locale: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/).nullable().optional(),
});

export const userUpdateSchema = z.object({
  displayName: z.string().trim().min(2, "Enter a name").max(100).optional(),
  isSuperadmin: z.boolean().optional(),
  roles: z.array(roleAssignmentSchema).max(200).optional(),
});

export const acceptInviteSchema = z.object({ password: z.string().min(1).max(256) });

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  before: z.coerce.number().int().positive().optional(),
  action: z.string().trim().max(60).optional(),
  userId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
});

export type TenantInput = z.infer<typeof tenantSchema>;
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;

const tagList = z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]);

export const assetSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(100),
  kind: z.string().trim().min(1).max(40).default("other"),
  description: z.string().trim().max(500).optional().default(""),
  location: z.string().trim().max(120).optional().default(""),
  address: z.string().trim().max(200).optional().default(""),
  tags: tagList,
});

export const applicationSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a name").max(100),
    description: z.string().trim().max(500).optional().default(""),
    owner: z.string().trim().max(120).optional().default(""),
    criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    aggregation: z.enum(["all", "any", "n_of_m"]).default("all"),
    minUp: z.coerce.number().int().min(1).max(100).default(1),
    slaTarget: z.coerce.number().min(50, "Between 50 and 100").max(100, "Between 50 and 100").default(99.9),
  });

export const membersSchema = z.object({
  members: z.array(z.object({ monitorId: z.string().uuid(), required: z.boolean() })).max(200),
});

export const dependencySchema = z.object({
  fromType: z.enum(["asset", "monitor", "application"]),
  fromId: z.string().uuid(),
  toAssetId: z.string().uuid("Choose an asset"),
});

export const maintenanceSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a name").max(120),
    description: z.string().trim().max(1000).optional().default(""),
    startsAt: z.coerce.date({ message: "Enter a start time" }),
    endsAt: z.coerce.date({ message: "Enter an end time" }),
    targets: z.array(z.object({ type: z.enum(["asset", "monitor", "application"]), id: z.string().uuid() })).min(1, "Choose at least one target").max(200),
  })
  .refine((m) => m.endsAt > m.startsAt, { path: ["endsAt"], message: "Must be after the start" })
  .refine((m) => m.endsAt.getTime() - m.startsAt.getTime() <= 31 * 86400_000, { path: ["endsAt"], message: "At most 31 days" });

export const noteSchema = z.object({
  type: z.enum(["comment", "action", "resolution"]),
  body: z.string().trim().min(1, "Write something first").max(5000),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).optional().default([]),
});
export const snoozeSchema = z.object({ minutes: z.coerce.number().int().min(5).max(7 * 1440) });
export const resolveSchema = z.object({ note: z.string().trim().max(5000).optional().default("") });
export const incidentTagsSchema = z.object({ tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20) });

const validTz = (tz: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
export const businessHoursSchema = z
  .object({ days: z.array(z.number().int().min(1).max(7)).min(1, "Choose at least one day"), start: hhmm, end: hhmm })
  .refine((b) => b.start < b.end, { path: ["end"], message: "Must be after the start" });

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
/** Recurring maintenance (see recurrence.ts). Times are local to `timezone`; an end before the start means the next day. */
export const maintenanceSeriesSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a name").max(120),
    description: z.string().trim().max(1000).optional().default(""),
    targets: z.array(z.object({ type: z.enum(["asset", "monitor", "application"]), id: z.string().uuid() })).min(1, "Choose at least one target").max(200),
    freq: z.enum(["daily", "weekly", "monthly"]),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional().default([]),
    monthlyMode: z.enum(["day", "nth"]).optional().default("day"),
    monthDay: z.number().int().min(1).max(31).optional().default(1),
    nth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]).optional().default(1),
    nthWeekday: z.number().int().min(0).max(6).optional().default(0),
    startTime: hhmm,
    endTime: hhmm,
    timezone: z.string().refine(validTz, "Unknown time zone"),
    startDate: localDate,
    until: localDate.nullable().optional().default(null),
  })
  .refine((s) => s.freq !== "weekly" || s.weekdays.length > 0, { path: ["weekdays"], message: "Choose at least one day" })
  .refine((s) => s.startTime !== s.endTime, { path: ["endTime"], message: "Must be after the start" })
  .refine((s) => !s.until || s.until >= s.startDate, { path: ["until"], message: "Must be after the start" });
export type MaintenanceSeriesInput = z.infer<typeof maintenanceSeriesSchema>;

/** Form input → rule (an end time before the start time means the next day). */
export function seriesRule(i: MaintenanceSeriesInput): import("./recurrence.js").RecurrenceRule {
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const durationMin = (mins(i.endTime) - mins(i.startTime) + 1440) % 1440;
  return {
    freq: i.freq, time: i.startTime, durationMin, timezone: i.timezone, startDate: i.startDate, until: i.until,
    ...(i.freq === "weekly" ? { weekdays: [...new Set(i.weekdays)].sort() } : {}),
    ...(i.freq === "monthly" ? { monthly: i.monthlyMode === "nth" ? { mode: "nth" as const, nth: i.nth, weekday: i.nthWeekday } : { mode: "day" as const, day: i.monthDay } } : {}),
  };
}

export const statusPageSchema = z.object({
  title: z.string().trim().min(2, "Enter a title").max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$/, "Use lowercase letters, digits and hyphens"),
  description: z.string().trim().max(500).optional().default(""),
  visibility: z.enum(["public", "internal"]),
  showHistory: z.boolean().optional().default(true),
  showIncidents: z.boolean().optional().default(true),
  showMaintenance: z.boolean().optional().default(true),
  items: z.array(z.object({
    type: z.enum(["application", "asset", "monitor"]),
    id: z.string().uuid(),
    label: z.string().trim().min(1, "Enter a name").max(80),
    group: z.string().trim().max(60).optional().default(""),
  })).min(1, "Choose at least one item").max(100),
});
export type StatusPageInput = z.infer<typeof statusPageSchema>;

export const profileSchema = z.object({ displayName: z.string().trim().min(2, "Enter your name").max(120) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1, "Required").max(256), newPassword: passwordSchema });
export const confirmPasswordSchema = z.object({ password: z.string().min(1, "Required").max(256) });
export const contactMethodSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("email"), label: z.string().trim().max(60).optional().default(""), target: emailSchema }),
  z.object({ type: z.literal("teams"), label: z.string().trim().max(60).optional().default(""),
    target: z.string().trim().url({ message: "Enter the workflow URL" }).refine((u) => u.startsWith("https://"), "Must start with https://") }),
  z.object({ type: z.literal("telegram"), label: z.string().trim().max(60).optional().default(""),
    target: z.string().trim().regex(/^-?\d{4,20}$/, "Enter the numeric chat ID") }),
]);
export const telegramBotSchema = z.object({
  botToken: z.string().trim().max(200).regex(/^(\d{5,15}:[A-Za-z0-9_-]{20,60})?$/, "This does not look like a bot token").optional().default(""),
});
export const notificationStepsSchema = z.object({
  steps: z.array(z.object({ contactId: z.string().uuid(), delayMin: z.number().int().min(0).max(1440) })).max(10),
}).refine((s) => s.steps.every((x, i) => i === 0 || x.delayMin >= s.steps[i - 1]!.delayMin), { path: ["steps"], message: "Each step must come at or after the previous one" });

export const teamSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(80),
  description: z.string().trim().max(300).optional().default(""),
  members: z.array(z.object({ userId: z.string().uuid(), role: z.enum(["member", "lead"]) })).max(100),
});
export const ownerSchema = z.object({ teamId: z.string().uuid().nullable() });

export const oncallScheduleSchema = z.object({
  enabled: z.boolean(),
  participants: z.array(z.string().uuid()).max(50),
  shiftDays: z.number().int().min(1).max(28),
  handoverTime: hhmm,
  timezone: z.string().refine(validTz, "Unknown time zone"),
  startDate: localDate,
  minSeverity: z.enum(["minor", "major", "critical"]),
  steps: z.array(z.object({ target: z.enum(["oncall", "next", "leads", "team"]), afterMin: z.number().int().min(0).max(1440) })).min(1, "Add at least one step").max(10),
}).refine((s) => s.steps.every((x, i) => i === 0 || x.afterMin >= s.steps[i - 1]!.afterMin), { path: ["steps"], message: "Each step must come at or after the previous one" });
export const oncallOverrideSchema = z.object({ userId: z.string().uuid(), startsAt: z.coerce.date(), endsAt: z.coerce.date() })
  .refine((o) => o.endsAt > o.startsAt, { path: ["endsAt"], message: "Must be after the start" });

/**
 * How long data is kept (days; 0 = forever where allowed). Minimums protect what the product
 * shows: 90-day charts, status pages and availability reports.
 */
export const RETENTION_DEFAULTS = { checkResultsDays: 30, hourlyDays: 400, dailyDays: 0, statusHistoryDays: 0, incidentsDays: 0, deliveriesDays: 90, auditDays: 0, maintenanceDays: 0, trapsDays: 30 } as const;
/** Template registered in apps/api/src/lib/api-texts.ts, so it is translated with its numbers. */
export const KEEP_MESSAGE = "Keep forever (0) or {min} to {max} days";
const keep = (min: number, max = 3650) => z.number().int().refine((n) => n === 0 || (n >= min && n <= max), KEEP_MESSAGE.replace("{min}", String(min)).replace("{max}", String(max)));
export const retentionSchema = z.object({
  checkResultsDays: z.number().int().min(1).max(365),
  hourlyDays: z.number().int().min(30).max(3650),
  dailyDays: keep(90),
  statusHistoryDays: keep(120),
  incidentsDays: keep(30),
  deliveriesDays: keep(7),
  auditDays: keep(90),
  maintenanceDays: keep(30),
  trapsDays: keep(1).default(30),
}).refine((r) => r.hourlyDays >= r.checkResultsDays, { path: ["hourlyDays"], message: "Keep summaries at least as long as raw results" })
  .refine((r) => r.dailyDays === 0 || r.dailyDays >= r.hourlyDays, { path: ["dailyDays"], message: "Keep summaries at least as long as raw results" });
export type Retention = z.infer<typeof retentionSchema>;

export const reportScheduleSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(100),
  period: z.enum(["weekly", "monthly"]),
  sendHour: z.coerce.number().int().min(0).max(23).default(7),
  timezone: z.string().trim().refine(validTz, "Unknown time zone"),
  recipients: z.array(emailSchema).min(1, "Add at least one recipient").max(50),
  formats: z.array(z.enum(["pdf", "csv"])).min(1, "Choose at least one format"),
  /** language of the report and its email; null = organisation default */
  locale: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/).nullable().optional().default(null),
  businessHours: businessHoursSchema.nullable().default(null),
  enabled: z.boolean().default(true),
});

export const reportQuerySchema = z.object({
  preset: z.enum(["last-week", "last-month", "last-30-days", "custom"]).default("last-30-days"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tz: z.string().default("UTC").refine(validTz, "Unknown time zone"),
  bh: z.enum(["0", "1"]).default("0"),
  bhDays: z.string().regex(/^[1-7](,[1-7])*$/).default("1,2,3,4,5"),
  bhStart: hhmm.default("08:00"),
  bhEnd: hhmm.default("18:00"),
  format: z.enum(["json", "pdf", "csv-availability", "csv-incidents"]).default("json"),
});

export const apiTokenSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(100),
  permission: z.enum(["read", "operate", "manage"]),
  expiresInDays: z.coerce.number().int().min(0).max(3650).default(365),
});
