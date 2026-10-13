/**
 * Additional monitor types (0.11.0): network services, databases, systems and infrastructure.
 * Same contract as definitions.ts; secret fields are encrypted at rest by the API.
 */
import { z } from "zod";
import type { FieldDef, MonitorTypeDef } from "./definitions.js";
import { badOids, sourceEntries } from "./traps.js";

/** A trap source: IPv4 (optionally /bits), IPv6, or a host name. */
const validSource = (e: string) => /^(\d{1,3}\.){3}\d{1,3}(\/([0-9]|[12]\d|3[0-2]))?$/.test(e) || (e.includes(":") && /^[0-9a-f:.]+$/i.test(e)) || /^(?=.*[a-z])(?!-)[a-z0-9.-]{1,253}$/i.test(e);

const host = z.string().trim().min(1, "Enter a host name or IP address").max(253).regex(/^(?!-)[A-Za-z0-9._:%-]+$/, "Use a host name or IP address");
const port = (d: number) => z.coerce.number().int().min(1, "Port 1–65535").max(65535, "Port 1–65535").default(d);
const optStr = (max = 500) => z.string().max(max).optional().default("");
const secret = (max = 500) => z.string().max(max).optional().default("");
const optMs = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().min(1).max(600_000).optional());
const DEGRADED_MS: FieldDef = { key: "degradedLatencyMs", label: "Degraded above (ms)", kind: "number", placeholder: "e.g. 800", hint: "Optional. Slower responses count as Degraded.", advanced: true };
const HOST: FieldDef = { key: "host", label: "Host", kind: "text", mono: true };
const TLS_FIELDS: FieldDef[] = [
  { key: "tls", label: "Use TLS", kind: "checkbox", advanced: true },
  { key: "ignoreTls", label: "Accept untrusted certificates", kind: "checkbox", advanced: true, showIf: { key: "tls", values: [true] } },
];
const MATCH_OPTIONS = [{ value: "equals", label: "equals" }, { value: "contains", label: "contains" }];

/** Refinement helper: a field is required only when visible. */
function requireWhen(cfg: Record<string, unknown>, ctx: z.RefinementCtx, key: string, when: boolean, message: string) {
  if (when && !String(cfg[key] ?? "").trim()) ctx.addIssue({ code: "custom", path: [key], message });
}

// ---------------- network ----------------

/** SNMP access (host, version, community or v3 user): shared by the SNMP checks. */
const SNMP_ACCESS: FieldDef[] = [
  { ...HOST, placeholder: "core-sw-01.corp.local" },
  { key: "port", label: "Port", kind: "number" },
  { key: "version", label: "Version", kind: "select", options: [{ value: "v1", label: "v1" }, { value: "v2c", label: "v2c" }, { value: "v3", label: "v3" }] },
  { key: "community", label: "Community", kind: "secret", showIf: { key: "version", values: ["v1", "v2c"] } },
  { key: "user", label: "User", kind: "text", showIf: { key: "version", values: ["v3"] } },
  { key: "level", label: "Security level", kind: "select", showIf: { key: "version", values: ["v3"] }, options: [{ value: "noAuthNoPriv", label: "No auth, no privacy" }, { value: "authNoPriv", label: "Auth, no privacy" }, { value: "authPriv", label: "Auth and privacy" }] },
  { key: "authProtocol", label: "Auth protocol", kind: "select", showIf: { key: "level", values: ["authNoPriv", "authPriv"] }, options: ["md5", "sha", "sha224", "sha256", "sha384", "sha512"].map((v) => ({ value: v, label: v.toUpperCase() })) },
  { key: "authKey", label: "Auth password", kind: "secret", showIf: { key: "level", values: ["authNoPriv", "authPriv"] } },
  { key: "privProtocol", label: "Privacy protocol", kind: "select", showIf: { key: "level", values: ["authPriv"] }, options: [{ value: "aes", label: "AES-128" }, { value: "aes256b", label: "AES-256 (Blumenthal)" }, { value: "aes256r", label: "AES-256 (Reeder)" }, { value: "des", label: "DES" }] },
  { key: "privKey", label: "Privacy password", kind: "secret", showIf: { key: "level", values: ["authPriv"] } },
];
const snmpAccessSchema = {
  host, port: port(161), version: z.enum(["v1", "v2c", "v3"]).default("v2c"), community: secret(200),
  user: optStr(100), level: z.enum(["noAuthNoPriv", "authNoPriv", "authPriv"]).default("authPriv"),
  authProtocol: z.enum(["md5", "sha", "sha224", "sha256", "sha384", "sha512"]).default("sha"), authKey: secret(200),
  privProtocol: z.enum(["aes", "aes256b", "aes256r", "des"]).default("aes"), privKey: secret(200),
};
function requireSnmpAccess(c: Record<string, unknown>, ctx: z.RefinementCtx) {
  requireWhen(c, ctx, "community", c.version !== "v3", "Enter the community");
  requireWhen(c, ctx, "user", c.version === "v3", "Enter the SNMPv3 user");
  requireWhen(c, ctx, "authKey", c.version === "v3" && c.level !== "noAuthNoPriv", "Enter the auth password");
  requireWhen(c, ctx, "privKey", c.version === "v3" && c.level === "authPriv", "Enter the privacy password");
}
const SNMP_ACCESS_DEFAULTS = { host: "", port: 161, version: "v2c", community: "", user: "", level: "authPriv", authProtocol: "sha", authKey: "", privProtocol: "aes", privKey: "" };

const snmp: MonitorTypeDef = {
  id: "snmp", label: "SNMP", category: "Network", description: "Reads an OID (v1, v2c, v3) and compares the value or its rate",
  fields: [
    ...SNMP_ACCESS,
    { key: "oid", label: "OID", kind: "text", placeholder: "1.3.6.1.2.1.1.3.0 (sysUpTime)", mono: true, span: 2 },
    { key: "mode", label: "Compare", kind: "select", options: [{ value: "value", label: "The value as read" }, { value: "rate", label: "Its change per second (counters)" }], hint: "For counters (packets, frames, sessions): two readings, the difference per second" },
    { key: "condition", label: "Condition", kind: "select", options: [{ value: "any", label: "Any value (reachable)" }, { value: "eq", label: "equals" }, { value: "ne", label: "does not equal" }, { value: "contains", label: "contains" }, { value: "gt", label: ">" }, { value: "gte", label: "≥" }, { value: "lt", label: "<" }, { value: "lte", label: "≤" }] },
    { key: "expected", label: "Expected value", kind: "text", mono: true, showIf: { key: "condition", values: ["eq", "ne", "contains", "gt", "gte", "lt", "lte"] } },
  ],
  schema: z.object({
    ...snmpAccessSchema,
    oid: z.string().trim().regex(/^\.?\d+(\.\d+)+$/, "Use a numeric OID like 1.3.6.1.2.1.1.3.0").transform((o) => o.replace(/^\./, "")),
    mode: z.enum(["value", "rate"]).default("value"),
    condition: z.enum(["any", "eq", "ne", "contains", "gt", "gte", "lt", "lte"]).default("any"), expected: optStr(500),
  }).superRefine((c, ctx) => {
    requireSnmpAccess(c, ctx);
    requireWhen(c, ctx, "expected", c.condition !== "any", "Enter the value to compare with");
    if (["gt", "gte", "lt", "lte"].includes(c.condition) && c.expected && Number.isNaN(Number(c.expected))) ctx.addIssue({ code: "custom", path: ["expected"], message: "Enter a number" });
    if (c.mode === "rate" && ["contains"].includes(c.condition)) ctx.addIssue({ code: "custom", path: ["condition"], message: "Compare a rate with a number" });
  }),
  defaults: { ...SNMP_ACCESS_DEFAULTS, oid: "1.3.6.1.2.1.1.3.0", mode: "value", condition: "any", expected: "" },
  summary: (c) => `${c.host} ${c.oid}${c.mode === "rate" ? " /s" : ""}`,
};

const snmpInterface: MonitorTypeDef = {
  id: "snmp-interface", label: "Network interface (SNMP)", category: "Network", description: "Link state, traffic in and out (bit/s and % of link speed) and errors of a switch, router or firewall port",
  defaultIntervalS: 60,
  fields: [
    ...SNMP_ACCESS,
    { key: "interface", label: "Interface", kind: "text", mono: true, span: 2, placeholder: "Gi1/0/48, ethernet1/1, Uplink to core…", hint: "Its name, description or alias (as the device reports it), or its index. Find interfaces lists them." },
    { key: "warnPct", label: "Degraded from utilisation (%)", kind: "number", hint: "The busier direction, in or out. 0 turns it off" },
    { key: "criticalPct", label: "Down from utilisation (%)", kind: "number", hint: "0 turns it off" },
    { key: "errorsPerMin", label: "Degraded from errors per minute", kind: "number", hint: "Input and output errors together (CRC, alignment…). 0 turns it off" },
    { key: "adminDown", label: "When the port is disabled", kind: "select", options: [{ value: "up", label: "Report it as Up (disabled on purpose)" }, { value: "down", label: "Report it as Down" }], advanced: true },
    { key: "speedMbps", label: "Link speed (Mbit/s)", kind: "number", advanced: true, placeholder: "As reported", hint: "For utilisation, when the device reports the wrong speed (e.g. a tunnel or a rate-limited circuit)" },
  ],
  schema: z.object({
    ...snmpAccessSchema,
    interface: z.string().trim().min(1, "Enter the interface name or index").max(200),
    warnPct: z.coerce.number().min(0).max(100).default(80),
    criticalPct: z.coerce.number().min(0).max(100).default(0),
    errorsPerMin: z.coerce.number().min(0).max(1_000_000).default(10),
    adminDown: z.enum(["up", "down"]).default("up"),
    speedMbps: z.preprocess((v) => (v === "" || v === null ? 0 : v), z.coerce.number().min(0).max(10_000_000)).default(0),
  }).superRefine((c, ctx) => {
    requireSnmpAccess(c, ctx);
    if (c.criticalPct > 0 && c.warnPct > 0 && c.criticalPct < c.warnPct) ctx.addIssue({ code: "custom", path: ["criticalPct"], message: "Down must be at or above Degraded" });
  }),
  defaults: { ...SNMP_ACCESS_DEFAULTS, interface: "", warnPct: 80, criticalPct: 0, errorsPerMin: 10, adminDown: "up", speedMbps: "" },
  summary: (c) => `${c.host} ${c.interface}`,
};

const ntp: MonitorTypeDef = {
  id: "ntp", label: "NTP", category: "Network", description: "Queries an NTP server: reachability, stratum and clock offset",
  fields: [
    { ...HOST, placeholder: "ntp1.corp.local" },
    { key: "port", label: "Port", kind: "number" },
    { key: "degradedOffsetMs", label: "Degraded above offset (ms)", kind: "number", hint: "Difference between the server's clock and this worker's" },
    { key: "maxStratum", label: "Down above stratum", kind: "number", advanced: true, hint: "16 means unsynchronised" },
  ],
  schema: z.object({ host, port: port(123), degradedOffsetMs: z.coerce.number().int().min(1).max(3_600_000).default(500), maxStratum: z.coerce.number().int().min(1).max(15).default(15) }),
  defaults: { host: "", port: 123, degradedOffsetMs: 500, maxStratum: 15 },
  summary: (c) => String(c.host),
};

const smtp: MonitorTypeDef = {
  id: "smtp", label: "SMTP", category: "Network", description: "Connects to a mail server: 220 greeting, EHLO, optional STARTTLS",
  fields: [
    { ...HOST, placeholder: "smtp.corp.local" },
    { key: "port", label: "Port", kind: "number", hint: "25, 465 (TLS) or 587 (STARTTLS)" },
    { key: "security", label: "Security", kind: "select", options: [{ value: "none", label: "None" }, { value: "starttls", label: "STARTTLS (must be offered)" }, { value: "tls", label: "TLS from the start" }] },
    { key: "ignoreTls", label: "Accept untrusted certificates", kind: "checkbox", showIf: { key: "security", values: ["starttls", "tls"] } },
    { key: "heloName", label: "EHLO name", kind: "text", advanced: true },
    DEGRADED_MS,
  ],
  schema: z.object({ host, port: port(25), security: z.enum(["none", "starttls", "tls"]).default("none"), ignoreTls: z.boolean().default(false), heloName: z.string().trim().max(253).optional().default("fudo.local"), degradedLatencyMs: optMs }),
  defaults: { host: "", port: 25, security: "none", ignoreTls: false, heloName: "fudo.local" },
  summary: (c) => `${c.host}:${c.port}`,
};

const domain: MonitorTypeDef = {
  id: "domain", label: "Domain expiry", category: "Network", description: "Registration expiry date via RDAP (WHOIS fallback)",
  fields: [
    { key: "domain", label: "Domain", kind: "text", placeholder: "example.com", mono: true },
    { key: "warnDays", label: "Degraded when expiring within (days)", kind: "number" },
  ],
  schema: z.object({
    domain: z.string().trim().toLowerCase().regex(/^(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/, "Enter a registered domain, e.g. example.com"),
    warnDays: z.coerce.number().int().min(1).max(365).default(30),
  }),
  defaults: { domain: "", warnDays: 30 },
  summary: (c) => String(c.domain),
  defaultIntervalS: 43200,
};

// ---------------- databases ----------------

function dbType(id: string, label: string, defPort: number, extra: { fields?: FieldDef[]; schema?: z.ZodRawShape; defaults?: Record<string, unknown>; queryHint: string; queryPlaceholder: string; noDatabase?: boolean; userOptional?: boolean }): MonitorTypeDef {
  return {
    id, label, category: "Databases", description: `Connects${extra.noDatabase ? "" : " and runs an optional query"}; optional expected result`,
    fields: [
      { ...HOST, placeholder: `${id}-prod-01.corp.local` },
      { key: "port", label: "Port", kind: "number" },
      { key: "username", label: extra.userOptional ? "User (optional)" : "User", kind: "text" },
      { key: "password", label: "Password", kind: "secret" },
      ...(extra.noDatabase ? [] : [{ key: "database", label: "Database", kind: "text" as const }]),
      ...(extra.fields ?? []),
      { key: "query", label: "Query", kind: "textarea", placeholder: extra.queryPlaceholder, hint: extra.queryHint, mono: true, span: 2 },
      { key: "expected", label: "Expected result", kind: "text", mono: true, hint: "Optional: first value of the result" },
      { key: "matchMode", label: "Match", kind: "select", options: MATCH_OPTIONS },
      ...TLS_FIELDS,
      DEGRADED_MS,
    ],
    schema: z.object({
      host, port: port(defPort), username: extra.userOptional ? optStr(128) : z.string().trim().min(1, "Enter the user").max(128), password: secret(500),
      database: optStr(128), query: optStr(4000), expected: optStr(500), matchMode: z.enum(["equals", "contains"]).default("equals"),
      tls: z.boolean().default(false), ignoreTls: z.boolean().default(false), degradedLatencyMs: optMs, ...(extra.schema ?? {}),
    }),
    defaults: { host: "", port: defPort, username: "", password: "", database: "", query: "", expected: "", matchMode: "equals", tls: false, ignoreTls: false, ...(extra.defaults ?? {}) },
    summary: (c) => `${c.host}:${c.port}${c.database ? `/${c.database}` : ""}`,
  };
}

const mysql = dbType("mysql", "MySQL / MariaDB", 3306, { queryPlaceholder: "SELECT 1", queryHint: "Optional. Default: connect and ping." });
const postgres = dbType("postgres", "PostgreSQL", 5432, { queryPlaceholder: "SELECT count(*) FROM pg_stat_activity", queryHint: "Optional. Default: SELECT 1." });
const sqlserver = dbType("sqlserver", "Microsoft SQL Server", 1433, {
  queryPlaceholder: "SELECT @@VERSION", queryHint: "Optional. Default: SELECT 1.",
  fields: [{ key: "instanceName", label: "Instance name", kind: "text", advanced: true, hint: "Named instance (uses SQL Browser); leave empty with a port" }],
  schema: { instanceName: optStr(128), tls: z.boolean().default(true), ignoreTls: z.boolean().default(true) },
  defaults: { instanceName: "", tls: true, ignoreTls: true },
});
const redis = dbType("redis", "Redis", 6379, { queryPlaceholder: "PING", queryHint: "Optional command, e.g. GET health:key. Default: PING (expects PONG).", noDatabase: true, userOptional: true,
  fields: [{ key: "dbIndex", label: "Database number", kind: "number", advanced: true }], schema: { dbIndex: z.coerce.number().int().min(0).max(1024).default(0) }, defaults: { dbIndex: 0 } });
const mongodb = dbType("mongodb", "MongoDB", 27017, { queryPlaceholder: '{"ping": 1}', queryHint: 'Optional admin command as JSON, e.g. {"replSetGetStatus": 1}. Default: {"ping": 1}.', userOptional: true,
  fields: [{ key: "authSource", label: "Auth database", kind: "text", advanced: true }], schema: { authSource: z.string().trim().max(128).optional().default("admin") }, defaults: { authSource: "admin", database: "admin" } });

// ---------------- systems ----------------

const ssh: MonitorTypeDef = {
  id: "ssh", label: "SSH command", category: "Systems", description: "Runs a command over SSH and checks its output or exit code",
  fields: [
    { ...HOST, placeholder: "srv-app-01.corp.local" },
    { key: "port", label: "Port", kind: "number" },
    { key: "username", label: "User", kind: "text" },
    { key: "authMethod", label: "Authentication", kind: "select", options: [{ value: "password", label: "Password" }, { value: "key", label: "Private key" }] },
    { key: "password", label: "Password", kind: "secret", showIf: { key: "authMethod", values: ["password"] } },
    { key: "privateKey", label: "Private key (OpenSSH/PEM)", kind: "secret", multiline: true, span: 2, showIf: { key: "authMethod", values: ["key"] } },
    { key: "passphrase", label: "Key passphrase", kind: "secret", showIf: { key: "authMethod", values: ["key"] } },
    { key: "command", label: "Command", kind: "textarea", placeholder: "systemctl is-active nginx", mono: true, span: 2 },
    { key: "matchMode", label: "Check", kind: "select", options: [{ value: "exitCode", label: "Exit code is 0" }, { value: "contains", label: "Output contains" }, { value: "notContains", label: "Output does not contain" }, { value: "exact", label: "Output is exactly" }, { value: "regex", label: "Output matches regex" }] },
    { key: "expected", label: "Expected", kind: "text", mono: true, showIf: { key: "matchMode", values: ["contains", "notContains", "exact", "regex"] } },
    { key: "hostKeySha256", label: "Host key fingerprint (SHA256)", kind: "text", mono: true, advanced: true, placeholder: "SHA256:… (ssh-keygen -lf)", hint: "Recommended: the check fails if the server's key changes" },
    DEGRADED_MS,
  ],
  schema: z.object({
    host, port: port(22), username: z.string().trim().min(1, "Enter the user").max(128), authMethod: z.enum(["password", "key"]).default("password"),
    password: secret(500), privateKey: secret(20000), passphrase: secret(500),
    command: z.string().trim().min(1, "Enter a command").max(4000), matchMode: z.enum(["exitCode", "contains", "notContains", "exact", "regex"]).default("exitCode"), expected: optStr(2000),
    hostKeySha256: z.string().trim().regex(/^(SHA256:)?[A-Za-z0-9+/]{43}=?$/, "Paste the SHA256 fingerprint from ssh-keygen -lf").or(z.literal("")).optional().default(""),
    degradedLatencyMs: optMs,
  }).superRefine((c, ctx) => {
    requireWhen(c, ctx, "password", c.authMethod === "password", "Enter the password");
    requireWhen(c, ctx, "privateKey", c.authMethod === "key", "Paste the private key");
    requireWhen(c, ctx, "expected", c.matchMode !== "exitCode", "Enter the expected output");
    if (c.matchMode === "regex" && c.expected) try { new RegExp(c.expected); } catch { ctx.addIssue({ code: "custom", path: ["expected"], message: "Not a valid regular expression" }); }
  }),
  defaults: { host: "", port: 22, username: "", authMethod: "password", password: "", privateKey: "", passphrase: "", command: "", matchMode: "exitCode", expected: "", hostKeySha256: "" },
  summary: (c) => `${c.username ? `${c.username}@` : ""}${c.host}: ${String(c.command).slice(0, 40)}`,
};

const docker: MonitorTypeDef = {
  id: "docker", label: "Docker container", category: "Systems", description: "Container is running (and healthy, if it has a health check)",
  fields: [
    { key: "container", label: "Container name or ID", kind: "text", mono: true },
    { key: "connection", label: "Docker host", kind: "select", options: [{ value: "socket", label: "Local socket" }, { value: "http", label: "Remote Docker API (TCP)" }] },
    { key: "socketPath", label: "Socket path", kind: "text", mono: true, showIf: { key: "connection", values: ["socket"] }, hint: "Mount it into the worker container" },
    { key: "url", label: "Docker API URL", kind: "text", mono: true, placeholder: "https://docker-host.corp.local:2376", showIf: { key: "connection", values: ["http"] } },
    { key: "ignoreTls", label: "Accept untrusted certificates", kind: "checkbox", advanced: true, showIf: { key: "connection", values: ["http"] } },
  ],
  schema: z.object({
    container: z.string().trim().min(1, "Enter the container name or ID").max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "Letters, digits, _ . - only"),
    connection: z.enum(["socket", "http"]).default("socket"), socketPath: z.string().trim().max(300).optional().default("/var/run/docker.sock"),
    url: z.string().trim().max(500).optional().default(""), ignoreTls: z.boolean().default(false),
  }).superRefine((c, ctx) => { if (c.connection === "http" && !/^https?:\/\/[^/]+/i.test(c.url)) ctx.addIssue({ code: "custom", path: ["url"], message: "Enter the API URL, e.g. https://host:2376" }); }),
  defaults: { container: "", connection: "socket", socketPath: "/var/run/docker.sock", url: "", ignoreTls: false },
  summary: (c) => String(c.container),
};

// ---------------- infrastructure ----------------

const vcenterVm: MonitorTypeDef = {
  id: "vcenter-vm", label: "vCenter VM", category: "Infrastructure", description: "Power state of a VM (vCenter 6.7, 7, 8), optionally VMware Tools",
  fields: [
    { key: "server", label: "vCenter", kind: "text", placeholder: "vcenter.corp.local", mono: true },
    { key: "vmName", label: "VM name", kind: "text", placeholder: "Exactly as in vCenter" },
    { key: "username", label: "User", kind: "text", placeholder: "monitoring@vsphere.local", hint: "A read-only account is enough" },
    { key: "password", label: "Password", kind: "secret" },
    { key: "expectedState", label: "Expected state", kind: "select", options: [{ value: "POWERED_ON", label: "Powered on" }, { value: "POWERED_OFF", label: "Powered off" }, { value: "SUSPENDED", label: "Suspended" }] },
    { key: "checkTools", label: "VMware Tools must be running (vCenter 7.0+)", kind: "checkbox", showIf: { key: "expectedState", values: ["POWERED_ON"] } },
    { key: "ignoreTls", label: "Accept untrusted certificates", kind: "checkbox", advanced: true },
  ],
  schema: z.object({
    server: host, vmName: z.string().trim().min(1, "Enter the VM name").max(80), username: z.string().trim().min(1, "Enter the user").max(256), password: secret(500),
    expectedState: z.enum(["POWERED_ON", "POWERED_OFF", "SUSPENDED"]).default("POWERED_ON"), checkTools: z.boolean().default(false), ignoreTls: z.boolean().default(true),
  }),
  defaults: { server: "", vmName: "", username: "", password: "", expectedState: "POWERED_ON", checkTools: false, ignoreTls: true },
  summary: (c) => `${c.vmName} @ ${c.server}`,
  defaultIntervalS: 120,
};

const redfish: MonitorTypeDef = {
  id: "redfish", label: "HPE iLO / Redfish health", category: "Infrastructure", description: "Server hardware health from the BMC (iLO 4/5/6, iDRAC and other Redfish BMCs)",
  fields: [
    { key: "host", label: "BMC address", kind: "text", placeholder: "ilo-srv01.corp.local", mono: true },
    { key: "username", label: "User", kind: "text", hint: "A read-only iLO account is enough" },
    { key: "password", label: "Password", kind: "secret" },
    { key: "requirePowerOn", label: "Down when the server is powered off", kind: "checkbox" },
    { key: "systemPath", label: "System path", kind: "text", mono: true, advanced: true, placeholder: "Automatic (first system)" },
    { key: "ignoreTls", label: "Accept untrusted certificates", kind: "checkbox", advanced: true },
  ],
  schema: z.object({
    host, username: z.string().trim().min(1, "Enter the user").max(256), password: secret(500), requirePowerOn: z.boolean().default(true),
    systemPath: z.string().trim().regex(/^(\/redfish\/v1\/Systems\/[^/\s]+)?$/i, "e.g. /redfish/v1/Systems/1").optional().default(""), ignoreTls: z.boolean().default(true),
  }),
  defaults: { host: "", username: "", password: "", requirePowerOn: true, systemPath: "", ignoreTls: true },
  summary: (c) => String(c.host),
  defaultIntervalS: 300,
};

const ldap: MonitorTypeDef = {
  id: "ldap", label: "LDAP / Active Directory", category: "Network",
  description: "Directory answers (domain controller in sync), or a service account can sign in and find entries",
  fields: [
    { ...HOST, placeholder: "dc01.corp.local" },
    { key: "port", label: "Port", kind: "number", hint: "636 (LDAPS) or 389 (StartTLS, none)" },
    { key: "security", label: "Security", kind: "select", options: [{ value: "ldaps", label: "LDAPS (TLS from the start)" }, { value: "starttls", label: "StartTLS" }, { value: "none", label: "None (passwords in clear text)" }] },
    { key: "allowUntrusted", label: "Accept untrusted certificates", kind: "checkbox", showIf: { key: "security", values: ["ldaps", "starttls"] } },
    { key: "check", label: "Check", kind: "select", options: [{ value: "rootdse", label: "Directory answers (no account needed)" }, { value: "bind", label: "Sign in with an account" }] },
    { key: "bindDn", label: "Account", kind: "text", mono: true, placeholder: "svc-fudo@corp.local or CN=svc-fudo,OU=Service,DC=corp,DC=local", showIf: { key: "check", values: ["bind"] }, span: 2 },
    { key: "password", label: "Password", kind: "secret", showIf: { key: "check", values: ["bind"] } },
    { key: "baseDn", label: "Search base (optional)", kind: "text", mono: true, placeholder: "DC=corp,DC=local", showIf: { key: "check", values: ["bind"] }, span: 2 },
    { key: "filter", label: "Search filter", kind: "text", mono: true, placeholder: "(sAMAccountName=erp-service)", showIf: { key: "check", values: ["bind"] }, advanced: true },
    { key: "minResults", label: "At least this many entries", kind: "number", showIf: { key: "check", values: ["bind"] }, advanced: true },
    { key: "adSync", label: "Active Directory: Degraded while the domain controller is not synchronized", kind: "checkbox", showIf: { key: "check", values: ["rootdse"] }, advanced: true },
    DEGRADED_MS,
  ],
  schema: z.object({
    host, port: port(636),
    security: z.enum(["ldaps", "starttls", "none"]).default("ldaps"),
    allowUntrusted: z.boolean().default(false),
    check: z.enum(["rootdse", "bind"]).default("rootdse"),
    bindDn: z.string().trim().max(500).optional().default(""),
    password: z.string().max(500).optional().default(""),
    baseDn: z.string().trim().max(500).optional().default(""),
    filter: z.string().trim().max(1000).regex(/^$|^\(.*\)$/, "Use an LDAP filter in parentheses, e.g. (sAMAccountName=svc)").optional().default(""),
    minResults: z.coerce.number().int().min(0).max(100000).default(1),
    adSync: z.boolean().default(true),
    degradedLatencyMs: optMs,
  }).refine((c) => c.check !== "bind" || c.bindDn.length > 0, { path: ["bindDn"], message: "Enter the account to sign in with" }),
  defaults: { host: "", port: 636, security: "ldaps", allowUntrusted: false, check: "rootdse", bindDn: "", password: "", baseDn: "", filter: "", minResults: 1, adSync: true },
  summary: (c) => `${c.security === "ldaps" ? "ldaps" : "ldap"}://${c.host}:${c.port}${c.check === "bind" && c.bindDn ? ` · ${c.bindDn}` : ""}`,
};

const temperature: MonitorTypeDef = {
  id: "redfish-temperature", label: "Inlet temperature (iLO / Redfish)", category: "Infrastructure",
  description: "Air temperature entering the server from the BMC: the temperature in front of its rack, an early warning for cooling problems",
  fields: [
    { key: "host", label: "BMC address", kind: "text", placeholder: "ilo-srv01.corp.local", mono: true },
    { key: "username", label: "User", kind: "text", hint: "A read-only iLO account is enough" },
    { key: "password", label: "Password", kind: "secret" },
    { key: "warnC", label: "Degraded from (°C)", kind: "number", hint: "27 °C is the top of ASHRAE's recommended range" },
    { key: "criticalC", label: "Down from (°C)", kind: "number", hint: "32 °C is the allowable limit for class A1 equipment" },
    { key: "riseC", label: "Degraded when rising by (°C)", kind: "number", hint: "0 turns it off. A fast climb is the earliest sign of a cooling failure" },
    { key: "riseMin", label: "…within (minutes)", kind: "number" },
    { key: "sensor", label: "Sensor name", kind: "text", mono: true, advanced: true, placeholder: "Automatic (inlet / intake sensor)", hint: "Part of the name, e.g. 01-Inlet Ambient" },
    { key: "chassisPath", label: "Chassis path", kind: "text", mono: true, advanced: true, placeholder: "Automatic" },
    { key: "ignoreTls", label: "Accept untrusted certificates", kind: "checkbox", advanced: true },
  ],
  schema: z.object({
    host, username: z.string().trim().min(1, "Enter the user").max(256), password: secret(500),
    warnC: z.coerce.number().min(0).max(80).default(27), criticalC: z.coerce.number().min(0).max(90).default(32),
    riseC: z.coerce.number().min(0).max(30).default(3), riseMin: z.coerce.number().int().min(5).max(120).default(15),
    sensor: z.string().trim().max(100).optional().default(""),
    chassisPath: z.string().trim().regex(/^(\/redfish\/v1\/Chassis\/[^/\s]+)?$/i, "e.g. /redfish/v1/Chassis/1").optional().default(""),
    ignoreTls: z.boolean().default(true),
  }).refine((c) => c.criticalC > c.warnC, { path: ["criticalC"], message: "Must be above the Degraded temperature" }),
  defaults: { host: "", username: "", password: "", warnC: 27, criticalC: 32, riseC: 3, riseMin: 15, sensor: "", chassisPath: "", ignoreTls: true },
  summary: (c) => String(c.host),
  defaultIntervalS: 120,
};

const room: MonitorTypeDef = {
  id: "temperature-room", label: "Room temperature", category: "Infrastructure",
  description: "All inlet temperature sensors tagged room:<name> together: several hot sensors mean a cooling problem",
  fields: [
    { key: "room", label: "Room", kind: "text", placeholder: "DC1", hint: "Watches inlet temperature monitors tagged room:<name>. Empty: all of them" },
    { key: "hotCount", label: "Down when this many sensors are hot", kind: "number", hint: "Hot: at or above the sensor's own Degraded temperature. One hot sensor is Degraded" },
    { key: "risingCount", label: "Degraded when this many rise fast", kind: "number", hint: "0 turns it off" },
    { key: "riseC", label: "Rising fast: by (°C) in the sensor's window", kind: "number", advanced: true },
    { key: "staleMin", label: "Ignore readings older than (minutes)", kind: "number", advanced: true },
  ],
  schema: z.object({
    room: z.string().trim().max(60).regex(/^[^\s,]*$/, "No spaces or commas (the tag is room:<name>)").optional().default(""),
    hotCount: z.coerce.number().int().min(1).max(500).default(3), risingCount: z.coerce.number().int().min(0).max(500).default(2),
    riseC: z.coerce.number().min(0.5).max(30).default(3), staleMin: z.coerce.number().int().min(2).max(120).default(10),
  }),
  defaults: { room: "", hotCount: 3, risingCount: 2, riseC: 3, staleMin: 10 },
  summary: (c) => (c.room ? `room:${c.room}` : "*"),
  defaultIntervalS: 60,
};


// ---------------- passive: SNMP traps ----------------

const snmpTrap: MonitorTypeDef = {
  id: "snmp-trap", label: "SNMP traps", category: "Passive", description: "Traps a device sends (v1, v2c): Down or Degraded while a problem trap is open",
  defaultIntervalS: 60, defaultFailuresBeforeDown: 1,
  fields: [
    { key: "source", label: "From", kind: "text", mono: true, span: 2, placeholder: "10.0.12.5, core-sw-01.corp.local, 10.0.12.0/24", hint: "The devices whose traps this monitor takes: addresses, host names or IPv4 ranges" },
    { key: "community", label: "Community", kind: "secret", hint: "Optional: only traps with this community. Never stored with the trap" },
    { key: "match", label: "Problem traps", kind: "select", options: [{ value: "standard", label: "Standard: link down, cold/warm start, authentication failure" }, { value: "oids", label: "Only these traps" }, { value: "any", label: "Any trap (except link up and the clearing traps)" }] },
    { key: "oids", label: "Traps", kind: "textarea", mono: true, showIf: { key: "match", values: ["oids"] }, placeholder: "linkDown\n1.3.6.1.4.1.232.0.6022", hint: "Names or OIDs, one per line; an OID also matches everything under it (an enterprise prefix)" },
    { key: "contains", label: "Only when a field contains", kind: "text", placeholder: "Optional, e.g. Critical", hint: "Any case" },
    { key: "effect", label: "While a problem is open", kind: "select", options: [{ value: "DOWN", label: "Down" }, { value: "DEGRADED", label: "Degraded" }] },
    { key: "clearMode", label: "Problems clear", kind: "select", options: [{ value: "auto", label: "Automatically, when no new trap arrives for a while" }, { value: "manual", label: "Only when cleared by hand (or by a clearing trap)" }] },
    { key: "clearAfterMin", label: "Clear after (minutes)", kind: "number", showIf: { key: "clearMode", values: ["auto"] } },
    { key: "clearOids", label: "Clearing traps", kind: "textarea", mono: true, advanced: true, placeholder: "1.3.6.1.4.1.9.9.41.2.0.2", hint: "Traps that end problems: for the same interface if they name one, else all. Link up always ends link down of its interface" },
  ],
  schema: z.object({
    source: z.string().trim().min(1, "Enter at least one address or host name").max(2000)
      .refine((s) => sourceEntries(s).every(validSource), "Use addresses, host names or ranges like 10.0.12.0/24"),
    community: secret(200),
    match: z.enum(["standard", "oids", "any"]).default("standard"),
    oids: optStr(4000),
    contains: optStr(200),
    effect: z.enum(["DOWN", "DEGRADED"]).default("DOWN"),
    clearMode: z.enum(["auto", "manual"]).default("auto"),
    clearAfterMin: z.coerce.number().int().min(1).max(10080).default(30),
    clearOids: optStr(4000),
  }).superRefine((c, ctx) => {
    if (c.match === "oids" && !c.oids.trim()) ctx.addIssue({ code: "custom", path: ["oids"], message: "Enter at least one trap name or OID" });
    for (const k of ["oids", "clearOids"] as const) { const bad = badOids(c[k]); if (bad.length) ctx.addIssue({ code: "custom", path: [k], message: "Use trap names (linkDown, coldStart…) or numeric OIDs" }); }
  }),
  defaults: { source: "", community: "", match: "standard", oids: "", contains: "", effect: "DOWN", clearMode: "auto", clearAfterMin: 30, clearOids: "" },
  summary: (c) => `${c.source}`,
};

export const EXTRA_TYPES: MonitorTypeDef[] = [snmp, snmpInterface, snmpTrap, ntp, smtp, ldap, domain, mysql, postgres, sqlserver, redis, mongodb, ssh, docker, vcenterVm, redfish, temperature, room];
