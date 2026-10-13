import type { MsgPart } from "./messages.js";

/** Status of any monitored entity (check, application, asset). */
export const ENTITY_STATUS = ["UP", "DEGRADED", "DOWN", "IMPACTED", "UNKNOWN", "MAINTENANCE"] as const;
export type EntityStatus = (typeof ENTITY_STATUS)[number];

/**
 * Roles. superadmin is a user flag. Other roles are assignments:
 *  - global scope (tenantId = null): infra-admin, viewer
 *  - tenant scope: tenant-admin, operator, viewer
 */
export const GLOBAL_ROLES = ["infra-admin", "viewer"] as const;
export const TENANT_ROLES = ["tenant-admin", "operator", "viewer"] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];
export type TenantRole = (typeof TENANT_ROLES)[number];
export type Role = GlobalRole | TenantRole;

export const ROLE_LABELS: Record<Role, string> = {
  "infra-admin": "Infrastructure admin",
  "tenant-admin": "Tenant admin",
  operator: "Operator",
  viewer: "Viewer",
};

export interface Membership {
  tenantId: string | null;
  tenantName: string | null;
  role: Role;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  db: { ok: boolean; timescale: string | null; rls: boolean | null };
  worker: { lastHeartbeat: string | null; ok: boolean };
  /** outcome of the last restore in this API process (it signs everyone out, so the page reads it here) */
  restore?: { state: "running" | "done" | "failed"; finishedAt: string | null; errorCode: string | null } | null;
}

export interface SetupStatusResponse {
  /** true until a superadmin with 2FA enabled exists */
  setupRequired: boolean;
  orgName: string | null;
}

export interface MeResponse {
  id: string;
  email: string;
  displayName: string;
  isSuperadmin: boolean;
  orgName: string | null;
  memberships: Membership[];
  /** Tenants this user can switch to (all active tenants for superadmins) */
  tenants: TenantSummary[];
  /** interface language chosen by the user (null = browser default) */
  locale: string | null;
  /** theme id, "system", or null (not chosen yet: follows the operating system) */
  theme: string | null;
}

export interface TenantDto extends TenantSummary {
  description: string;
  isActive: boolean;
  createdAt: string;
  memberCount: number;
}

export type UserStatus = "active" | "invited" | "reset_pending" | "deactivated";

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  isSuperadmin: boolean;
  isActive: boolean;
  status: UserStatus;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: Membership[];
}

export interface InviteLinkResponse {
  link: string;
  expiresAt: string;
  emailed: boolean;
  emailError?: string;
}

export interface InviteInfo {
  email: string;
  displayName: string;
  kind: "invite" | "reset_2fa";
  orgName: string | null;
}

export interface AuditEntryDto {
  id: number;
  ts: string;
  action: string;
  userId: string | null;
  userEmail: string | null;
  /** the actor's account was deleted since; formerEmail comes from the deletion entry */
  userDeleted: boolean;
  formerEmail: string | null;
  tenantId: string | null;
  tenantName: string | null;
  entityType: string | null;
  entityId: string | null;
  diff: Record<string, unknown> | null;
}

export interface AuditPage {
  entries: AuditEntryDto[];
  /** pass as `before` to get older entries; null when there are none */
  nextBefore: number | null;
}

export interface TotpEnrollment {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
}

export interface ApiError {
  error: string;
  message: string;
  fields?: Record<string, string>;
}

export interface TenantPermissions {
  /** see monitors, results, incidents */
  read: boolean;
  /** pause/resume, run tests, acknowledge (operators and up) */
  operate: boolean;
  /** create, edit, delete configuration (tenant admins, infra admins, superadmins) */
  manage: boolean;
}

/** Scope selected in the UI: a tenant id, or "global" for shared infrastructure. */
export const GLOBAL_SCOPE = "global";

export function tenantPermissions(me: { isSuperadmin: boolean; memberships: Membership[] }, tenantId: string | null): TenantPermissions {
  if (!tenantId) return { read: false, operate: false, manage: false };
  const global = me.memberships.find((m) => m.tenantId === null)?.role;
  if (tenantId === GLOBAL_SCOPE) {
    const manage = me.isSuperadmin || global === "infra-admin";
    return { read: manage || Boolean(global), operate: manage, manage };
  }
  const local = me.memberships.find((m) => m.tenantId === tenantId)?.role;
  const manage = me.isSuperadmin || global === "infra-admin" || local === "tenant-admin";
  const operate = manage || local === "operator";
  return { read: operate || Boolean(global) || Boolean(local), operate, manage };
}

export type MonitorStatusValue = "UNKNOWN" | "UP" | "DEGRADED" | "DOWN";
export type EffectiveStatus = MonitorStatusValue | "IMPACTED" | "MAINTENANCE";
export type EntityKind = "asset" | "monitor" | "application";
export interface EntityRef { type: EntityKind; id: string; name: string; planned?: boolean }
export type Scope = "tenant" | "global";

export interface MonitorDto {
  id: string;
  tenantId: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  intervalS: number;
  retryIntervalS: number;
  timeoutS: number;
  failuresBeforeDown: number;
  successesBeforeUp: number;
  paused: boolean;
  tags: string[];
  description: string;
  status: MonitorStatusValue;
  failStreak: number;
  statusChangedAt: string | null;
  lastCheckAt: string | null;
  lastLatencyMs: number | null;
  lastMessage: string | null;
  /** translatable form of lastMessage (null before 0.15) */
  lastMessageParts?: MsgPart[] | null;
  createdAt: string;
  updatedAt: string;
  /** last results, oldest first (MAINTENANCE = checked during a maintenance window) */
  recent: Array<{ s: "UP" | "DEGRADED" | "DOWN" | "MAINTENANCE"; t: string }>;
  uptime24h: number | null;
  scope: Scope;
  assetId: string | null;
  assetName: string | null;
  /** applications it is a member of (required or optional), in this scope */
  applications: Array<{ id: string; name: string; required: boolean }>;
  /** the shared credential it uses, if any */
  credentialId: string | null;
  credentialName: string | null;
  /** status after dependency analysis: IMPACTED when an upstream asset is the root cause */
  effectiveStatus: EffectiveStatus;
  cause: EntityRef | null;
  atRisk: EntityRef | null;
}

export interface MonitorDetail extends MonitorDto {
  pushUrl: string | null;
  uptime: { h24: number | null; d7: number | null; d30: number | null };
  avgLatency24h: number | null;
  /** 24 h in 5-minute buckets */
  series: Array<{ t: string; avg: number | null; max: number | null; down: number; total: number }>;
  results: Array<{ ts: string; status: "UP" | "DEGRADED" | "DOWN"; latencyMs: number | null; message: string | null; messageParts?: MsgPart[] | null }>;
  events: Array<{ ts: string; from: string; to: string; message: string | null; messageParts?: MsgPart[] | null }>;
}

export interface TestResultDto {
  status: "UP" | "DEGRADED" | "DOWN";
  latencyMs: number | null;
  message: string;
  data?: Record<string, number | string>;
}

export const ASSET_KINDS: Record<string, string> = {
  switch: "Network switch",
  router: "Router",
  firewall: "Firewall",
  "load-balancer": "Load balancer",
  "storage-array": "Storage array",
  "fc-switch": "FC switch",
  server: "Server",
  bmc: "Management controller (iLO/BMC)",
  enclosure: "Enclosure / frame",
  hypervisor: "Hypervisor cluster",
  vcenter: "vCenter",
  database: "Database server",
  service: "Shared service (AD, DNS, …)",
  other: "Other",
};

export interface AssetDto {
  id: string;
  scope: Scope;
  name: string;
  kind: string;
  description: string;
  location: string;
  address: string;
  tags: string[];
  status: EffectiveStatus;
  statusChangedAt: string | null;
  cause: EntityRef | null;
  atRisk: EntityRef | null;
  summary: string;
  summaryParts?: MsgPart[] | null;
  monitorCount: number;
  dependsOn: Array<{ edgeId: string; id: string; name: string; status: EffectiveStatus }>;
  dependentCount: number;
}

export interface AssetDetail extends AssetDto {
  monitors: Array<{ id: string; name: string; type: string; status: MonitorStatusValue; effectiveStatus: EffectiveStatus; scope: Scope }>;
  usedBy: Array<{ type: EntityKind; id: string; name: string; status: EffectiveStatus; tenantName: string | null }>;
  events: Array<{ ts: string; from: string; to: string; message: string | null; messageParts?: MsgPart[] | null }>;
}

export interface ImpactDto {
  assets: Array<{ id: string; name: string }>;
  monitorCount: number;
  applications: Array<{ id: string; name: string; tenantName: string | null; before: { status: EffectiveStatus }; after: { status: EffectiveStatus; cause: EntityRef | null; summary: string; summaryParts?: MsgPart[] | null } }>;
  /** applications in tenants this user cannot see */
  hiddenApplications: number;
}

export interface ApplicationDto {
  id: string;
  name: string;
  description: string;
  owner: string;
  criticality: "low" | "medium" | "high" | "critical";
  aggregation: "all" | "any" | "n_of_m";
  minUp: number;
  slaTarget: number;
  status: EffectiveStatus;
  statusChangedAt: string | null;
  cause: EntityRef | null;
  atRisk: EntityRef | null;
  summary: string;
  summaryParts?: MsgPart[] | null;
  memberCount: number;
}

export interface GraphNode { key: string; type: EntityKind; id: string; name: string; status: EffectiveStatus; depth: number; cause: EntityRef | null; scope: Scope; detail: string }

export interface ApplicationDetail extends ApplicationDto {
  members: Array<{ monitorId: string; name: string; type: string; required: boolean; status: MonitorStatusValue; effectiveStatus: EffectiveStatus; cause: EntityRef | null; scope: Scope }>;
  dependsOn: Array<{ edgeId: string; id: string; name: string; status: EffectiveStatus }>;
  graph: { nodes: GraphNode[]; links: Array<{ from: string; to: string }> };
  events: Array<{ ts: string; from: string; to: string; message: string | null; messageParts?: MsgPart[] | null; cause: EntityRef | null }>;
}

export interface MaintenanceDto {
  id: string;
  scope: Scope;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  state: "active" | "upcoming" | "past";
  targets: Array<{ type: EntityKind; id: string; name: string }>;
  /** set for windows created by a recurring series */
  seriesId?: string | null;
}

export type IncidentStatus = "open" | "acknowledged" | "resolved";
export type Severity = "minor" | "major" | "critical";

export interface IncidentDto {
  id: string;
  number: number;
  key: string;
  scope: Scope;
  tenantName: string | null;
  entityType: EntityKind;
  entityId: string;
  entityName: string;
  title: string;
  titleParts?: MsgPart[] | null;
  severity: Severity;
  status: IncidentStatus;
  entityStatus: string;
  cause: EntityRef | null;
  parent: { id: string; key: string; title: string; titleParts?: MsgPart[] | null; status: IncidentStatus } | null;
  tags: string[];
  openedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  snoozedUntil: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  childCount: number;
}

export interface IncidentEventDto { id: number; ts: string; kind: string; noteType: "comment" | "action" | "resolution" | null; body: string; bodyParts?: MsgPart[] | null; userName: string | null }

export interface SimilarIncident {
  id: string;
  key: string;
  title: string;
  titleParts?: MsgPart[] | null;
  resolvedAt: string;
  durationMin: number;
  reasons: string[];
  reasonParts?: MsgPart[];
  resolution: string | null;
  actions: string[];
}

export interface DeliveryDto { id: number; channelName: string; type: string; event: string; status: "queued" | "sending" | "sent" | "failed" | "suppressed"; detail: string; attempts: number; createdAt: string; sentAt: string | null }

export interface IncidentDetail extends IncidentDto {
  events: IncidentEventDto[];
  /** the team that owns the affected item */
  owner: OwnerDto | null;
  /** people paged by on-call escalation */
  pages: IncidentPageDto[];
  children: Array<{ id: string; key: string; title: string; titleParts?: MsgPart[] | null; status: IncidentStatus; tenantName: string | null }>;
  hiddenChildren: number;
  similar: SimilarIncident[];
  deliveries: DeliveryDto[];
  /** current status of the affected entity */
  entityNow: string | null;
}

export interface ChannelDto {
  id: string;
  scope: Scope;
  name: string;
  type: string;
  config: Record<string, unknown>;
  summary: string;
  enabled: boolean;
  minSeverity: Severity;
  events: string[];
  skipImpacted: boolean;
  allTenants: boolean;
  remindMinutes: number;
  escalateAfterMinutes: number;
  /** all: every incident of the scope; selected: only incidents of `applications` */
  routing: "all" | "selected";
  applications: Array<{ id: string; name: string }>;
  /** message language; null = organisation default */
  locale: string | null;
  lastDelivery: { status: string; at: string; detail: string } | null;
}

export type ChartRange = "1h" | "6h" | "24h" | "7d" | "30d" | "90d";
export interface SeriesPoint { t: string; avg: number | null; p95: number | null; max: number | null; total: number; down: number; maint: number }
export interface SeriesDto { range: ChartRange; resolution: string; resolutionMin?: number; source: "raw" | "hourly" | "daily"; from: string; to: string; uptime: number | null; points: SeriesPoint[] }

export interface AvailabilityDay { date: string; pct: number | null; downMin: number; plannedMin: number }
export interface AvailabilityDto { days: number; pct: number | null; downMin: number; plannedMin: number; target: number | null; buckets: AvailabilityDay[] }

export interface DashboardItem { type: "application" | "asset"; id: string; name: string; status: EffectiveStatus; cause: EntityRef | null; atRisk: EntityRef | null; criticality: string | null; slaTarget: number | null; availability: AvailabilityDto }
export interface DashboardDto {
  items: DashboardItem[];
  incidents: { open: number; acknowledged: number; resolved30: number; mttrMin: number | null };
  monitors: Record<string, number>;
}

export interface TopologyNode { key: string; type: "asset" | "application"; id: string; name: string; status: EffectiveStatus; cause: EntityRef | null; kind: string | null; scope: Scope; tenantName: string | null }
export interface TopologyDto { nodes: TopologyNode[]; edges: Array<{ from: string; to: string; via: string | null }> }

export interface ReportScheduleDto {
  id: string; scope: Scope; name: string; period: "weekly" | "monthly"; sendHour: number; timezone: string; recipients: string[];
  formats: Array<"pdf" | "csv">; businessHours: { days: number[]; start: string; end: string } | null; enabled: boolean;
  locale: string | null;
  nextRunAt: string; lastRunAt: string | null; lastRun: { status: "sent" | "failed"; detail: string; at: string } | null;
}
export interface ApiTokenDto { id: string; name: string; prefix: string; permission: "read" | "operate" | "manage"; scope: Scope; createdAt: string; createdBy: string | null; expiresAt: string | null; lastUsedAt: string | null; revokedAt: string | null }

/** A shared credential: secret values never leave the server, only which ones are set. */
export interface CredentialDto { id: string; name: string; kind: string; description: string; fields: Record<string, unknown>; account: string; secretsSet: string[]; usedBy: Array<{ id: string; name: string; type: string }>; updatedAt: string; updatedBy: string | null }
export interface CredentialSuggestion { kind: string; account: string; monitors: Array<{ id: string; name: string; type: string }> }

export interface ImportAction { kind: "asset" | "monitor" | "application"; name: string; action: "create" | "update" | "unchanged"; changes: string[]; line: number | null }
export interface ImportError { kind: string; name: string | null; message: string; line: number | null; field?: string }
export interface ImportResult { dryRun: boolean; applied: boolean; actions: ImportAction[]; errors: ImportError[]; summary: { create: number; update: number; unchanged: number } }

/** A channel as seen from an application's notification settings. */
export interface ApplicationChannelDto { id: string; name: string; type: string; summary: string; enabled: boolean; routing: "all" | "selected"; linked: boolean }

export interface MaintenanceSeriesDto {
  id: string;
  scope: "tenant" | "global";
  name: string;
  description: string;
  rule: import("./recurrence.js").RecurrenceRule;
  targets: Array<{ type: "asset" | "monitor" | "application"; id: string; name: string }>;
  nextStart: string | null;
  nextEnd: string | null;
}

export type PublicStatus = "operational" | "degraded" | "outage" | "maintenance" | "unknown";
export interface StatusPageItem { type: "application" | "asset" | "monitor"; id: string; label: string; group: string }
export interface StatusPageDto {
  id: string; scope: "tenant" | "global"; slug: string; title: string; description: string; visibility: "public" | "internal";
  showHistory: boolean; showIncidents: boolean; showMaintenance: boolean;
  items: Array<StatusPageItem & { name: string }>;
}
/** What a status page shows (public pages: display labels and plain statuses only). */
export interface StatusPageView {
  title: string; description: string; visibility: "public" | "internal"; generatedAt: string;
  overall: PublicStatus;
  groups: Array<{ name: string; items: Array<{ label: string; status: PublicStatus; days: Array<{ date: string; pct: number | null; downMin: number }> | null; pct90: number | null }> }>;
  incidents: Array<{ labels: string[]; status: PublicStatus; since: string; title: string | null; titleParts?: MsgPart[] | null; acknowledged: boolean }>;
  maintenance: Array<{ labels: string[]; startsAt: string; endsAt: string; active: boolean; name: string | null }>;
}

export interface ContactMethodDto { id: string; type: "email" | "teams" | "telegram"; label: string; target: string; verified: boolean }
export interface SessionDto { id: string; createdAt: string; expiresAt: string; ip: string | null; userAgent: string | null; current: boolean }
export interface ProfileDto {
  displayName: string; email: string; passwordChangedAt: string | null; recoveryCodesLeft: number;
  contacts: ContactMethodDto[]; steps: Array<{ contactId: string; delayMin: number }>; telegramBot: string | null;
}

export interface TeamMemberDto { userId: string; name: string; email: string; role: "member" | "lead" }
export interface TeamDto { id: string; scope: "tenant" | "global"; name: string; description: string; members: TeamMemberDto[]; owns: Array<{ type: "application" | "asset"; id: string; name: string }>; onCall: { userId: string; name: string; until: string } | null }
/** The team that owns an item (or the item a monitor belongs to), for incidents and pages. */
export interface OwnerDto { teamId: string; team: string; leads: string[]; members: string[]; via: { type: "application" | "asset"; name: string } | null }

export type EscalationTarget = "oncall" | "next" | "leads" | "team";
export interface OncallDto {
  schedule: { enabled: boolean; participants: string[]; shiftDays: number; handoverTime: string; timezone: string; startDate: string;
    minSeverity: "minor" | "major" | "critical"; steps: Array<{ target: EscalationTarget; afterMin: number }> } | null;
  now: { userId: string; name: string; until: string; source: "rotation" | "override" } | null;
  upcoming: Array<{ userId: string; name: string; start: string; end: string }>;
  overrides: Array<{ id: string; userId: string; name: string; startsAt: string; endsAt: string }>;
  members: Array<{ userId: string; name: string; role: "member" | "lead"; reachable: boolean }>;
}
/** People paged for an incident and what was sent to them. */
export interface IncidentPageDto { name: string; reason: EscalationTarget; startedAt: string; sent: Array<{ channel: string; at: string; ok: boolean }>; done: boolean }
