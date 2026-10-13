import { issueMessage } from "@fudo/shared";
/**
 * Monitor type definitions. Browser-safe (no Node imports): the web app renders forms from `fields`,
 * the API validates `config` with `schema`. Runners live in ./runners (Node only).
 * Adding a type = one entry here + one runner file.
 */
import { z } from "zod";

export type ResultStatus = "UP" | "DEGRADED" | "DOWN";
export type MonitorStatus = "UNKNOWN" | ResultStatus;

export interface FieldDef {
  key: string;
  label: string;
  kind: "text" | "number" | "select" | "checkbox" | "textarea" | "secret";
  placeholder?: string;
  hint?: string;
  options?: Array<{ value: string; label: string }>;
  /** shown under "Advanced" */
  advanced?: boolean;
  /** grid span (1 = half width, 2 = full width) */
  span?: 1 | 2;
  mono?: boolean;
  /** secret: multi-line (e.g. private keys) */
  multiline?: boolean;
  /** only shown (and validated) when another field has one of these values */
  showIf?: { key: string; values: Array<string | boolean> };
}

export interface MonitorTypeDef {
  id: string;
  label: string;
  category: "Network" | "Web" | "Passive" | "Databases" | "Systems" | "Infrastructure";
  description: string;
  fields: FieldDef[];
  schema: z.ZodType<Record<string, unknown>>;
  defaults: Record<string, unknown>;
  /** one-line target shown in lists */
  summary: (cfg: Record<string, unknown>) => string;
  /** suggested interval (s) */
  defaultIntervalS?: number;
  /** e.g. traps: one result is enough (the form starts with this) */
  defaultFailuresBeforeDown?: number;
}

// Hostname or IP; never starting with "-" (it is passed to the ping binary as an argument).
const host = z
  .string()
  .trim()
  .min(1, "Enter a host name or IP address")
  .max(253)
  .regex(/^(?!-)[A-Za-z0-9._:%-]+$/, "Use a host name or IP address");
const optMs = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().min(1).max(600_000).optional());
const port = z.coerce.number().int().min(1, "Port 1–65535").max(65535, "Port 1–65535");

const DEGRADED_MS: FieldDef = { key: "degradedLatencyMs", label: "Degraded above (ms)", kind: "number", placeholder: "e.g. 800", hint: "Optional. Slower responses count as Degraded.", advanced: true };

const ping: MonitorTypeDef = {
  id: "ping",
  label: "Ping",
  category: "Network",
  description: "ICMP echo: reachability, latency and packet loss",
  fields: [
    { key: "host", label: "Host", kind: "text", placeholder: "10.10.0.1 or core-sw-01.corp.local", span: 2, mono: true },
    { key: "packets", label: "Packets per check", kind: "number" },
    { key: "degradedLossPct", label: "Degraded above loss (%)", kind: "number", hint: "100% loss is always Down" },
    DEGRADED_MS,
  ],
  schema: z.object({
    host,
    packets: z.coerce.number().int().min(1).max(10).default(3),
    degradedLossPct: z.coerce.number().min(0).max(100).default(20),
    degradedLatencyMs: optMs,
  }),
  defaults: { host: "", packets: 3, degradedLossPct: 20 },
  summary: (c) => String(c.host ?? ""),
};

const tcp: MonitorTypeDef = {
  id: "tcp",
  label: "TCP port",
  category: "Network",
  description: "Opens a TCP connection to a port",
  fields: [
    { key: "host", label: "Host", kind: "text", placeholder: "sql-prod-02.corp.local", mono: true },
    { key: "port", label: "Port", kind: "number", placeholder: "1433" },
    DEGRADED_MS,
  ],
  schema: z.object({ host, port, degradedLatencyMs: optMs }),
  defaults: { host: "", port: "" },
  summary: (c) => `${c.host}:${c.port}`,
};

const http: MonitorTypeDef = {
  id: "http",
  label: "HTTP(S)",
  category: "Web",
  description: "Status code, keyword or JSON value, response time",
  fields: [
    { key: "url", label: "URL", kind: "text", placeholder: "https://erp.corp.local/health", span: 2, mono: true },
    { key: "method", label: "Method", kind: "select", options: ["GET", "HEAD", "POST", "PUT"].map((m) => ({ value: m, label: m })) },
    { key: "acceptedStatus", label: "Accepted status codes", kind: "text", placeholder: "200-299", mono: true, hint: "Ranges and lists, e.g. 200-299,301" },
    { key: "keyword", label: "Keyword", kind: "text", placeholder: "Optional", hint: "Case-sensitive text to look for in the response" },
    { key: "keywordMode", label: "Keyword must be", kind: "select", options: [{ value: "contains", label: "Present" }, { value: "absent", label: "Absent" }] },
    { key: "jsonPath", label: "JSON value", kind: "text", placeholder: "$.status", mono: true, hint: "Optional path into a JSON response" },
    { key: "jsonExpected", label: "Expected value", kind: "text", placeholder: "ok", mono: true, hint: "Empty = the value must exist" },
    DEGRADED_MS,
    { key: "headers", label: "Request headers", kind: "textarea", placeholder: "Authorization: Bearer …\nX-Probe: fudo", mono: true, span: 2, advanced: true, hint: "One per line, Name: value" },
    { key: "body", label: "Request body", kind: "textarea", mono: true, span: 2, advanced: true },
    { key: "followRedirects", label: "Follow redirects", kind: "checkbox", advanced: true },
    { key: "ignoreTls", label: "Ignore TLS certificate errors", kind: "checkbox", advanced: true },
  ],
  schema: z.object({
    url: z.string().trim().url("Enter a full URL, e.g. https://host/path").refine((u) => /^https?:\/\//i.test(u), "Only http:// and https:// URLs"),
    method: z.enum(["GET", "HEAD", "POST", "PUT"]).default("GET"),
    acceptedStatus: z.string().trim().regex(/^\s*\d{3}(\s*-\s*\d{3})?(\s*,\s*\d{3}(\s*-\s*\d{3})?)*\s*$/, "Use codes or ranges, e.g. 200-299,301").default("200-299"),
    keyword: z.string().max(500).optional().default(""),
    keywordMode: z.enum(["contains", "absent"]).default("contains"),
    jsonPath: z.string().trim().max(200).regex(/^(\$(\.[A-Za-z_][\w-]*|\[\d+\])*)?$/, "Use a path like $.status or $.items[0].state").optional().default(""),
    jsonExpected: z.string().max(500).optional().default(""),
    degradedLatencyMs: optMs,
    headers: z.string().max(4000).optional().default(""),
    body: z.string().max(20000).optional().default(""),
    followRedirects: z.boolean().default(true),
    ignoreTls: z.boolean().default(false),
  }),
  defaults: { url: "", method: "GET", acceptedStatus: "200-299", keyword: "", keywordMode: "contains", jsonPath: "", jsonExpected: "", headers: "", body: "", followRedirects: true, ignoreTls: false },
  summary: (c) => String(c.url ?? ""),
};

const dns: MonitorTypeDef = {
  id: "dns",
  label: "DNS",
  category: "Network",
  description: "Resolves a record, optionally checking the answer",
  fields: [
    { key: "hostname", label: "Name to resolve", kind: "text", placeholder: "erp.corp.local", mono: true },
    { key: "recordType", label: "Record type", kind: "select", options: ["A", "AAAA", "CNAME", "MX", "TXT", "NS"].map((m) => ({ value: m, label: m })) },
    { key: "server", label: "DNS server", kind: "text", placeholder: "System default", mono: true, hint: "Optional IP of the server to ask" },
    { key: "expected", label: "Answer must contain", kind: "text", placeholder: "Optional, e.g. 10.20.4.15", mono: true },
  ],
  schema: z.object({
    hostname: host,
    recordType: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS"]).default("A"),
    server: z.string().trim().regex(/^([0-9.]+|[0-9a-fA-F:]+)?$/, "Use an IP address").optional().default(""),
    expected: z.string().trim().max(500).optional().default(""),
  }),
  defaults: { hostname: "", recordType: "A", server: "", expected: "" },
  summary: (c) => `${c.hostname} ${c.recordType}`,
};

const tls: MonitorTypeDef = {
  id: "tls",
  label: "TLS certificate",
  category: "Web",
  description: "Certificate validity and days until expiry",
  fields: [
    { key: "host", label: "Host", kind: "text", placeholder: "erp.corp.local", mono: true },
    { key: "port", label: "Port", kind: "number" },
    { key: "warnDays", label: "Degraded when expiring within (days)", kind: "number" },
    { key: "servername", label: "Server name (SNI)", kind: "text", placeholder: "Same as host", mono: true, advanced: true },
    { key: "allowUntrusted", label: "Accept untrusted certificates (check expiry only)", kind: "checkbox", advanced: true },
  ],
  schema: z.object({
    host,
    port: port.default(443),
    warnDays: z.coerce.number().int().min(1).max(365).default(21),
    servername: z.string().trim().max(253).optional().default(""),
    allowUntrusted: z.boolean().default(false),
  }),
  defaults: { host: "", port: 443, warnDays: 21, servername: "", allowUntrusted: false },
  summary: (c) => `${c.host}:${c.port}`,
  defaultIntervalS: 3600,
};

const push: MonitorTypeDef = {
  id: "push",
  label: "Push heartbeat",
  category: "Passive",
  description: "A job or script calls a URL; Down when it stops calling",
  fields: [{ key: "graceS", label: "Grace period (s)", kind: "number", hint: "Extra time allowed after each interval before Down" }],
  schema: z.object({ graceS: z.coerce.number().int().min(0).max(86400).default(30) }),
  defaults: { graceS: 30 },
  summary: () => "Push URL",
  defaultIntervalS: 300,
};

import { EXTRA_TYPES } from "./definitions-extra.js";

export const MONITOR_TYPES: MonitorTypeDef[] = [http, ping, tcp, dns, tls, push, ...EXTRA_TYPES];
/** keys of secret fields: stored encrypted, never returned to the browser */
export const secretKeysOf = (type: string) => getMonitorType(type)?.fields.filter((f) => f.kind === "secret").map((f) => f.key) ?? [];
/**
 * Whether a field is shown. With `all` (the type's fields), conditions chain: a field whose
 * controlling field is hidden is hidden too (SNMP auth fields depend on the security level,
 * which is only shown for v3).
 */
export function fieldVisible(f: FieldDef, cfg: Record<string, unknown>, all?: FieldDef[], depth = 0): boolean {
  if (!f.showIf) return true;
  if (!f.showIf.values.includes(cfg[f.showIf.key] as string | boolean)) return false;
  const parent = all?.find((x) => x.key === f.showIf!.key);
  return !parent || depth > 5 || fieldVisible(parent, cfg, all, depth + 1);
}
export const MONITOR_TYPE_IDS = MONITOR_TYPES.map((t) => t.id) as [string, ...string[]];
export const SECRET_PLACEHOLDER = "__unchanged__";
export const getMonitorType = (id: string) => MONITOR_TYPES.find((t) => t.id === id);

/** Common fields for every monitor. Type-specific settings live in `config`. */
export const monitorInputSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a name").max(100),
    type: z.enum(MONITOR_TYPE_IDS, { message: "Choose a monitor type" }),
    config: z.record(z.string(), z.unknown()),
    intervalS: z.coerce.number().int().min(20, "At least 20 seconds").max(86400),
    retryIntervalS: z.coerce.number().int().min(10, "At least 10 seconds").max(86400),
    timeoutS: z.coerce.number().int().min(1).max(120),
    failuresBeforeDown: z.coerce.number().int().min(1).max(10),
    successesBeforeUp: z.coerce.number().int().min(1).max(10),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    description: z.string().trim().max(500).optional().default(""),
    /** the asset this check tells us about (its status feeds the asset's status) */
    assetId: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable().optional().default(null)),
    /** a shared credential of the same scope fills the account fields (see credentials.ts) */
    credentialId: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable().optional().default(null)),
  })
  .refine((m) => m.timeoutS < m.intervalS, { path: ["timeoutS"], message: "Must be shorter than the interval" });

export type MonitorInput = z.infer<typeof monitorInputSchema>;

/** Validates `config` against the type's schema; returns field errors keyed "config.<field>". */
export function parseMonitorConfig(type: string, config: unknown):
  | { ok: true; config: Record<string, unknown> }
  | { ok: false; fields: Record<string, string> } {
  const def = getMonitorType(type);
  if (!def) return { ok: false, fields: { type: "Unknown monitor type" } };
  const r = def.schema.safeParse(config ?? {});
  if (r.success) return { ok: true, config: r.data };
  const fields: Record<string, string> = {};
  for (const i of r.error.issues) fields[`config.${i.path.join(".")}`] ??= issueMessage(i);
  return { ok: false, fields };
}

export const MONITOR_DEFAULTS = { intervalS: 60, retryIntervalS: 30, timeoutS: 10, failuresBeforeDown: 3, successesBeforeUp: 1 };
