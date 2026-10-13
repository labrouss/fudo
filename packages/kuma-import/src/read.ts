/**
 * Reads what Fudo needs from Uptime Kuma: monitors (with tags and notification links) and
 * notifications. Two sources: the JSON backup of Kuma 1.x, and the kuma.db SQLite file of 1.x and
 * 2.x (read in place with node:sqlite, so its heartbeat history is never loaded into memory).
 */
import { openSync, readSync, closeSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export interface KumaMonitor {
  id: number; name: string; type: string; active: boolean; parent: number | null;
  url: string; method: string; hostname: string; port: number | null;
  interval: number | null; retryInterval: number | null; maxretries: number | null; timeout: number | null;
  upsideDown: boolean; keyword: string; invertKeyword: boolean; acceptedStatusCodes: string[];
  maxRedirects: number | null; ignoreTls: boolean; headers: string; body: string;
  dnsResolveType: string; dnsResolveServer: string; expiryNotification: boolean;
  jsonPath: string; jsonPathOperator: string; expectedValue: string;
  description: string; authMethod: string; basicAuthUser: string; basicAuthPass: string;
  notificationIds: number[]; tags: Array<{ name: string; value: string }>;
}
export interface KumaNotification { id: number; name: string; type: string; config: Record<string, unknown>; active: boolean; isDefault: boolean }
export interface KumaData { source: "json" | "sqlite"; monitors: KumaMonitor[]; notifications: KumaNotification[] }

export class KumaReadError extends Error {
  constructor(public code: "not_kuma" | "too_large" | "unreadable", message: string) { super(message); }
}

type Raw = Record<string, unknown>;
/** First of several spellings (snake_case in the database, camelCase in the JSON backup). */
const pick = (o: Raw, ...keys: string[]) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const bool = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";
const jsonArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  try { const a = JSON.parse(String(v ?? "[]")); return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
};

function monitorFrom(o: Raw, notificationIds: number[], tags: KumaMonitor["tags"]): KumaMonitor {
  return {
    id: Number(o.id), name: str(o.name).trim(), type: str(o.type), active: o.active === undefined ? true : bool(o.active),
    parent: num(o.parent), url: str(o.url), method: str(o.method || "GET").toUpperCase(), hostname: str(o.hostname), port: num(o.port),
    interval: num(o.interval), retryInterval: num(pick(o, "retry_interval", "retryInterval")), maxretries: num(o.maxretries), timeout: num(o.timeout),
    upsideDown: bool(pick(o, "upside_down", "upsideDown")), keyword: str(o.keyword), invertKeyword: bool(pick(o, "invert_keyword", "invertKeyword")),
    acceptedStatusCodes: jsonArray(pick(o, "accepted_statuscodes_json", "accepted_statuscodes", "acceptedStatuscodes")),
    maxRedirects: num(pick(o, "maxredirects", "maxRedirects")), ignoreTls: bool(pick(o, "ignore_tls", "ignoreTls")),
    headers: str(o.headers), body: str(o.body),
    dnsResolveType: str(pick(o, "dns_resolve_type", "dnsResolveType")), dnsResolveServer: str(pick(o, "dns_resolve_server", "dnsResolveServer")),
    expiryNotification: bool(pick(o, "expiry_notification", "expiryNotification")),
    jsonPath: str(pick(o, "json_path", "jsonPath")), jsonPathOperator: str(pick(o, "json_path_operator", "jsonPathOperator")), expectedValue: str(pick(o, "expected_value", "expectedValue")),
    description: str(o.description), authMethod: str(pick(o, "auth_method", "authMethod")),
    basicAuthUser: str(pick(o, "basic_auth_user", "basicAuthUser")), basicAuthPass: str(pick(o, "basic_auth_pass", "basicAuthPass")),
    notificationIds, tags,
  };
}
function notificationFrom(o: Raw): KumaNotification {
  let config: Raw = {};
  try { config = typeof o.config === "string" ? JSON.parse(o.config) : ((o.config as Raw) ?? {}); } catch { /* unreadable settings: skipped later */ }
  return { id: Number(o.id), name: str(o.name || config.name).trim(), type: str(config.type), config, active: o.active === undefined ? true : bool(o.active), isDefault: bool(pick(o, "is_default", "isDefault") ?? config.isDefault) };
}

export function readKumaJson(text: string): KumaData {
  let d: Raw;
  try { d = JSON.parse(text); } catch { throw new KumaReadError("not_kuma", "This is not an Uptime Kuma backup"); }
  if (!Array.isArray(d.monitorList) && !Array.isArray(d.notificationList)) throw new KumaReadError("not_kuma", "This is not an Uptime Kuma backup");
  const monitors = ((d.monitorList as Raw[]) ?? []).map((m) => {
    const ids = Object.entries((m.notificationIDList as Raw) ?? {}).filter(([, on]) => bool(on)).map(([id]) => Number(id));
    const tags = ((m.tags as Raw[]) ?? []).map((t) => ({ name: str(t.name).trim(), value: str(t.value).trim() })).filter((t) => t.name);
    return monitorFrom(m, ids, tags);
  });
  return { source: "json", monitors, notifications: ((d.notificationList as Raw[]) ?? []).map(notificationFrom) };
}

export function readKumaSqlite(path: string): KumaData {
  let db: DatabaseSync;
  try { db = new DatabaseSync(path, { readOnly: true }); } catch { throw new KumaReadError("unreadable", "The database file cannot be read"); }
  try {
    const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Raw[]).map((r) => String(r.name)));
    if (!tables.has("monitor")) throw new KumaReadError("not_kuma", "This is not an Uptime Kuma database");
    const all = (sql: string) => db.prepare(sql).all() as Raw[];
    const links = tables.has("monitor_notification") ? all("SELECT monitor_id, notification_id FROM monitor_notification") : [];
    const tagRows = tables.has("monitor_tag") && tables.has("tag") ? all("SELECT mt.monitor_id, t.name, mt.value FROM monitor_tag mt JOIN tag t ON t.id = mt.tag_id") : [];
    const monitors = all("SELECT * FROM monitor ORDER BY id").map((m) => monitorFrom(m,
      links.filter((l) => Number(l.monitor_id) === Number(m.id)).map((l) => Number(l.notification_id)),
      tagRows.filter((t) => Number(t.monitor_id) === Number(m.id)).map((t) => ({ name: str(t.name).trim(), value: str(t.value).trim() })).filter((t) => t.name)));
    const notifications = tables.has("notification") ? all("SELECT * FROM notification ORDER BY id").map(notificationFrom) : [];
    return { source: "sqlite", monitors, notifications };
  } finally { db.close(); }
}

/** JSON backup or SQLite database, told apart by the first bytes of the file. */
export function readKuma(path: string, maxJsonBytes = 50 * 1024 * 1024): KumaData {
  const fd = openSync(path, "r");
  const head = Buffer.alloc(16);
  try { readSync(fd, head, 0, 16, 0); } finally { closeSync(fd); }
  if (head.toString("latin1").startsWith("SQLite format 3")) return readKumaSqlite(path);
  const text = readFileSync(path);
  if (text.length > maxJsonBytes) throw new KumaReadError("too_large", "The backup file is too large");
  return readKumaJson(text.toString("utf8"));
}
