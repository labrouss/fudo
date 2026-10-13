/**
 * Uptime Kuma → Fudo. Produces a Fudo configuration document (monitors, and applications from
 * Kuma groups) plus the channels to create from Kuma notifications. Nothing is dropped silently:
 * whatever cannot be imported faithfully is listed in `skipped`, every adjustment in `warnings`
 * (both as codes with parameters, translated by the interface).
 */
import type { KumaData, KumaMonitor, KumaNotification } from "./read.js";

export interface Note { name: string; code: string; params?: Record<string, string | number> }
export interface PlannedChannel { kumaId: number; name: string; type: string; config: Record<string, unknown>; routing: "all" | "applications"; applications: string[]; usedBy: number; isDefault: boolean }
export interface Converted {
  monitors: Array<Record<string, unknown>>;
  applications: Array<Record<string, unknown>>;
  channels: PlannedChannel[];
  skipped: Note[];
  warnings: Note[];
}
export interface ConvertOptions {
  /** names already used in the target scope (lower-case): those items are not touched */
  existingMonitors: Set<string>;
  existingApplications: Set<string>;
  existingChannels: Set<string>;
  /** the Fudo field keys of a Kuma notification provider, or null if Fudo does not support it */
  providerFields: (kumaType: string) => string[] | null;
  /** tenant scopes have applications; the Global infrastructure scope does not */
  allowApplications: boolean;
}

const LIMITS = { interval: [20, 86400], retry: [10, 86400], timeout: [1, 120], failures: [1, 10] } as const;
const METHODS = new Set(["GET", "HEAD", "POST", "PUT"]);
const DNS_TYPES = new Set(["A", "AAAA", "CNAME", "MX", "TXT", "NS"]);
const STATUS = /^\d{3}(-\d{3})?$/;
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

/** Kuma JSON queries are JSONata; simple paths (a.b[0].c) become Fudo paths ($.a.b[0].c). */
export function jsonPathFrom(expr: string): string | null {
  const e = expr.trim().replace(/^\$\.?/, "");
  if (!e) return null;
  if (!/^[A-Za-z_][\w-]*(\[\d+\])*(\.[A-Za-z_][\w-]*(\[\d+\])*)*$/.test(e)) return null;
  return `$.${e}`.replace(/\.\[/g, "[");
}

export function convertKuma(k: KumaData, o: ConvertOptions): Converted {
  const out: Converted = { monitors: [], applications: [], channels: [], skipped: [], warnings: [] };
  const used = new Set<string>();
  /** Unique names inside the import; Kuma allows duplicates, Fudo does not. */
  const uniqueName = (raw: string) => {
    let base = raw.trim().slice(0, 96) || "Kuma monitor";
    if (base.length < 2) base = `${base} (Kuma)`;
    let name = base, n = 2;
    while (used.has(name.toLowerCase())) name = `${base} (${n++})`;
    used.add(name.toLowerCase());
    return name;
  };
  const byId = new Map(k.monitors.map((m) => [m.id, m]));
  const nameOf = new Map<number, string>(); // Kuma monitor id → imported Fudo monitor name
  const groupName = new Map<number, string>();

  for (const m of k.monitors.filter((x) => x.type === "group")) {
    if (!o.allowApplications) { out.skipped.push({ name: m.name, code: "group_global" }); continue; }
    if (o.existingApplications.has(m.name.toLowerCase())) { out.skipped.push({ name: m.name, code: "exists_application" }); continue; }
    groupName.set(m.id, uniqueName(m.name));
  }

  for (const m of k.monitors.filter((x) => x.type !== "group")) {
    const skip = (code: string, params?: Note["params"]) => out.skipped.push({ name: m.name, code, ...(params ? { params } : {}) });
    if (o.existingMonitors.has(m.name.toLowerCase())) { skip("exists_monitor"); continue; }
    if (m.upsideDown) { skip("upside_down"); continue; }
    const warn = (code: string, params?: Note["params"]) => out.warnings.push({ name: m.name, code, ...(params ? { params } : {}) });
    let type: string, config: Record<string, unknown>;
    switch (m.type) {
      case "http": case "keyword": case "json-query": {
        if (!/^https?:\/\//i.test(m.url)) { skip("bad_url"); continue; }
        if (!METHODS.has(m.method)) { skip("method", { method: m.method }); continue; }
        if (m.authMethod && !["", "null", "basic"].includes(m.authMethod)) { skip("auth", { method: m.authMethod }); continue; }
        const headerLines: string[] = [];
        if (m.headers.trim()) {
          try { for (const [h, v] of Object.entries(JSON.parse(m.headers) as Record<string, unknown>)) headerLines.push(`${h}: ${String(v)}`); }
          catch { warn("headers_dropped"); }
        }
        if (m.basicAuthUser) {
          headerLines.push(`Authorization: Basic ${Buffer.from(`${m.basicAuthUser}:${m.basicAuthPass}`).toString("base64")}`);
          warn("basic_auth");
        }
        const codes = m.acceptedStatusCodes.map((c) => c.replace(/\s/g, "")).filter((c) => STATUS.test(c));
        if (codes.length < m.acceptedStatusCodes.length) warn("status_codes");
        config = {
          url: m.url, method: m.method, acceptedStatus: codes.join(",") || "200-299",
          headers: headerLines.join("\n"), body: m.body, followRedirects: (m.maxRedirects ?? 10) > 0, ignoreTls: m.ignoreTls,
          keyword: "", keywordMode: "contains", jsonPath: "", jsonExpected: "",
        };
        if (m.type === "keyword") Object.assign(config, { keyword: m.keyword, keywordMode: m.invertKeyword ? "absent" : "contains" });
        if (m.type === "json-query") {
          const path = jsonPathFrom(m.jsonPath);
          if (!path || (m.jsonPathOperator && !["", "==", "null"].includes(m.jsonPathOperator))) { skip("json_query", { expression: m.jsonPath.slice(0, 60) }); continue; }
          Object.assign(config, { jsonPath: path, jsonExpected: m.expectedValue });
        }
        type = "http";
        break;
      }
      case "port":
        if (!m.hostname || !m.port) { skip("incomplete"); continue; }
        type = "tcp"; config = { host: m.hostname, port: String(m.port) };
        break;
      case "ping":
        if (!m.hostname) { skip("incomplete"); continue; }
        type = "ping"; config = { host: m.hostname, packets: 3, degradedLossPct: 20 };
        break;
      case "dns": {
        const rt = (m.dnsResolveType || "A").toUpperCase();
        if (!DNS_TYPES.has(rt)) { skip("dns_type", { type: rt }); continue; }
        type = "dns"; config = { hostname: m.hostname, recordType: rt, server: m.dnsResolveServer, expected: "" };
        break;
      }
      case "push":
        type = "push"; config = { graceS: 30 };
        warn("push_url");
        break;
      default:
        skip("type", { type: m.type || "?" });
        continue;
    }

    const interval = m.interval ?? 60;
    const iv = clamp(interval, LIMITS.interval);
    if (iv !== interval) warn("interval", { from: interval, to: iv });
    const retry = clamp(m.retryInterval ?? iv, LIMITS.retry);
    const wantTimeout = Math.round(m.timeout && m.timeout > 0 ? m.timeout : Math.min(48, iv * 0.8));
    const timeout = Math.min(clamp(wantTimeout, LIMITS.timeout), iv - 1);
    const fails = (m.maxretries ?? 0) + 1;
    const failures = clamp(fails, LIMITS.failures);
    if (failures !== fails) warn("retries", { from: m.maxretries ?? 0, to: failures - 1 });
    const name = uniqueName(m.name);
    nameOf.set(m.id, name);
    const tags = [...new Set(m.tags.map((t) => (t.value ? `${t.name}:${t.value}` : t.name).slice(0, 40)))].slice(0, 20);
    out.monitors.push({
      name, type, config, intervalS: iv, retryIntervalS: retry, timeoutS: timeout, failuresBeforeDown: failures, successesBeforeUp: 1,
      tags, description: m.description.slice(0, 500), ...(m.active ? {} : { paused: true }),
    });

    // Kuma checks certificate expiry on HTTPS monitors; Fudo has a separate certificate monitor
    if (type === "http" && m.expiryNotification && /^https:/i.test(m.url)) {
      const u = new URL(m.url);
      const certName = uniqueName(`${name.slice(0, 84)} (certificate)`);
      if (o.existingMonitors.has(certName.toLowerCase())) { out.skipped.push({ name: certName, code: "exists_monitor" }); }
      else {
        out.monitors.push({ name: certName, type: "tls", config: { host: u.hostname, port: Number(u.port || 443), warnDays: 21, servername: "", allowUntrusted: false },
          intervalS: Math.max(iv, 3600), retryIntervalS: Math.max(retry, 300), timeoutS: 10, failuresBeforeDown: 1, successesBeforeUp: 1, tags, description: "", ...(m.active ? {} : { paused: true }) });
        out.warnings.push({ name: certName, code: "certificate" });
      }
    }
  }

  // groups → applications with their (imported) direct members
  for (const [gid, app] of groupName) {
    const members = k.monitors.filter((m) => m.parent === gid && nameOf.has(m.id)).map((m) => nameOf.get(m.id)!);
    if (!members.length) { out.skipped.push({ name: byId.get(gid)!.name, code: "empty_group" }); groupName.delete(gid); continue; }
    out.applications.push({ name: app, description: byId.get(gid)!.description.slice(0, 500), aggregation: "all", members });
  }

  // notifications → channels (enabled or not is decided when applying)
  for (const n of k.notifications) {
    // Kuma's email notification becomes Fudo's own Email channel (Fudo's mail server, from Settings)
    if (n.type === "smtp") {
      const list = (v: unknown) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      const to = list(n.config.smtpTo), extra = [...list(n.config.smtpCC), ...list(n.config.smtpBCC)];
      if (!to.length && !extra.length) { out.skipped.push({ name: n.name, code: "no_recipients" }); continue; }
      if (o.existingChannels.has(n.name.toLowerCase())) { out.skipped.push({ name: n.name, code: "exists_channel" }); continue; }
      out.warnings.push({ name: n.name, code: extra.length ? "smtp_cc" : "smtp_server" });
      n.type = "email"; n.config = { to: [...new Set([...to, ...extra])].join(", ") };
    }
    const fields = n.type === "email" ? ["to"] : o.providerFields(n.type);
    if (!fields) { out.skipped.push({ name: n.name, code: "provider", params: { type: n.type || "?" } }); continue; }
    if (o.existingChannels.has(n.name.toLowerCase())) { out.skipped.push({ name: n.name, code: "exists_channel" }); continue; }
    const users = k.monitors.filter((m) => m.notificationIds.includes(n.id) && nameOf.has(m.id));
    // only group members use it: route to those applications; otherwise to all incidents of the scope
    const apps = [...new Set(users.map((m) => (m.parent !== null ? groupName.get(m.parent) : undefined)))];
    const onlyGroups = users.length > 0 && apps.every(Boolean) && o.allowApplications;
    const config = Object.fromEntries(fields.filter((f) => n.config[f] !== undefined && n.config[f] !== null).map((f) => [f, n.config[f]]));
    out.channels.push({ kumaId: n.id, name: n.name.slice(0, 80) || `Kuma ${n.type}`, type: n.type === "email" ? "email" : `kuma:${n.type}`, config, routing: onlyGroups ? "applications" : "all", applications: onlyGroups ? (apps as string[]) : [], usedBy: users.length, isDefault: n.isDefault });
  }
  return out;
}
