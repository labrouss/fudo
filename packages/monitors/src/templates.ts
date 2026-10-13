/**
 * Monitor templates (F-207): a set of checks created together for one host or URL, optionally
 * with an asset that the checks describe. Browser-safe; used by bulk add and the API import.
 */
export interface TemplateMonitor { name: string; type: string; config: Record<string, unknown>; intervalS?: number; retryIntervalS?: number; timeoutS?: number; /** a shared credential of the scope, by name */ credential?: string }
export interface MonitorTemplate {
  id: string;
  label: string;
  description: string;
  input: "host" | "url";
  /** asset kind to create when "one asset per line" is chosen */
  assetKind: string;
  build: (v: { name: string; host: string; url: string; port?: number }) => TemplateMonitor[];
}

const https = (host: string, path = "/") => `https://${host}${path}`;

export const MONITOR_TEMPLATES: MonitorTemplate[] = [
  {
    id: "web-app", label: "Web application", description: "HTTP(S) availability + TLS certificate expiry", input: "url", assetKind: "service",
    build: ({ name, url }) => {
      const u = new URL(url);
      return [
        { name: `${name} web`, type: "http", config: { url, method: "GET", acceptedStatus: "200-399", followRedirects: true } },
        ...(u.protocol === "https:" ? [{ name: `${name} certificate`, type: "tls", config: { host: u.hostname, port: Number(u.port || 443), warnDays: 21 }, intervalS: 3600 }] : []),
      ];
    },
  },
  {
    id: "windows-server", label: "Windows server", description: "Ping, RDP (3389), WinRM (5985)", input: "host", assetKind: "server",
    build: ({ name, host }) => [
      { name: `${name} ping`, type: "ping", config: { host, packets: 3, degradedLossPct: 20 } },
      { name: `${name} RDP`, type: "tcp", config: { host, port: 3389 } },
      { name: `${name} WinRM`, type: "tcp", config: { host, port: 5985 } },
    ],
  },
  {
    id: "linux-server", label: "Linux server", description: "Ping, SSH (22)", input: "host", assetKind: "server",
    build: ({ name, host }) => [
      { name: `${name} ping`, type: "ping", config: { host, packets: 3, degradedLossPct: 20 } },
      { name: `${name} SSH`, type: "tcp", config: { host, port: 22 } },
    ],
  },
  {
    id: "hpe-ilo", label: "HPE iLO / BMC", description: "Ping, iLO web interface, iLO certificate", input: "host", assetKind: "bmc",
    build: ({ name, host }) => [
      { name: `${name} ping`, type: "ping", config: { host, packets: 3, degradedLossPct: 20 } },
      { name: `${name} iLO web`, type: "http", config: { url: https(host), method: "GET", acceptedStatus: "200-399", ignoreTls: true, followRedirects: true } },
      { name: `${name} iLO certificate`, type: "tls", config: { host, port: 443, warnDays: 30, allowUntrusted: true }, intervalS: 3600 },
    ],
  },
  {
    id: "network-device", label: "Network switch / router", description: "Ping, SSH (22)", input: "host", assetKind: "switch",
    build: ({ name, host }) => [
      { name: `${name} ping`, type: "ping", config: { host, packets: 5, degradedLossPct: 10 } },
      { name: `${name} SSH`, type: "tcp", config: { host, port: 22 } },
    ],
  },
  {
    id: "esxi-host", label: "VMware ESXi host", description: "Ping, HTTPS (443), vSphere agent (902)", input: "host", assetKind: "hypervisor",
    build: ({ name, host }) => [
      { name: `${name} ping`, type: "ping", config: { host, packets: 3, degradedLossPct: 20 } },
      { name: `${name} HTTPS`, type: "tcp", config: { host, port: 443 } },
      { name: `${name} vpxa`, type: "tcp", config: { host, port: 902 } },
    ],
  },
  {
    id: "vcenter", label: "VMware vCenter", description: "vSphere Client, API health, certificate", input: "host", assetKind: "vcenter",
    build: ({ name, host }) => [
      { name: `${name} vSphere Client`, type: "http", config: { url: https(host, "/ui/"), method: "GET", acceptedStatus: "200-399", ignoreTls: true, followRedirects: true } },
      { name: `${name} API`, type: "http", config: { url: https(host, "/api"), method: "GET", acceptedStatus: "200-499", ignoreTls: true } },
      { name: `${name} certificate`, type: "tls", config: { host, port: 443, warnDays: 30, allowUntrusted: true }, intervalS: 3600 },
    ],
  },
  {
    id: "sql-server", label: "SQL Server", description: "Ping, SQL Server port (1433)", input: "host", assetKind: "database",
    build: ({ name, host, port }) => [
      { name: `${name} ping`, type: "ping", config: { host, packets: 3, degradedLossPct: 20 } },
      { name: `${name} SQL`, type: "tcp", config: { host, port: port ?? 1433 } },
    ],
  },
  {
    id: "storage-array", label: "Storage array (HPE 3PAR/Primera/Alletra)", description: "Ping, management HTTPS, WSAPI (8080)", input: "host", assetKind: "storage-array",
    build: ({ name, host }) => [
      { name: `${name} ping`, type: "ping", config: { host, packets: 3, degradedLossPct: 20 } },
      { name: `${name} HTTPS`, type: "tcp", config: { host, port: 443 } },
      { name: `${name} WSAPI`, type: "tcp", config: { host, port: 8080 } },
    ],
  },
];

/** Single-type bulk add: which monitor types can be built from one host/URL (+ optional port). */
/** Settings entered once for a whole bulk list (e.g. a shared read-only iLO account). */
export interface SharedField { key: string; kind: "text" | "secret" | "number"; default?: string }
export const SINGLE_TYPES: Record<string, { input: "host" | "url"; shared?: SharedField[]; build: (v: { name: string; host: string; url: string; port?: number }, shared?: Record<string, string>) => TemplateMonitor }> = {
  ping: { input: "host", build: ({ name, host }) => ({ name, type: "ping", config: { host, packets: 3, degradedLossPct: 20 } }) },
  tcp: { input: "host", build: ({ name, host, port }) => ({ name, type: "tcp", config: { host, port: port ?? 443 } }) },
  http: { input: "url", build: ({ name, url }) => ({ name, type: "http", config: { url, method: "GET", acceptedStatus: "200-399", followRedirects: true } }) },
  tls: { input: "host", build: ({ name, host, port }) => ({ name, type: "tls", config: { host, port: port ?? 443, warnDays: 21 }, intervalS: 3600 }) },
  dns: { input: "host", build: ({ name, host }) => ({ name, type: "dns", config: { hostname: host, recordType: "A" } }) },
  "redfish-temperature": {
    input: "host",
    shared: [{ key: "username", kind: "text" }, { key: "password", kind: "secret" }, { key: "warnC", kind: "number", default: "27" }, { key: "criticalC", kind: "number", default: "32" }],
    build: ({ name, host }, s = {}) => ({ name, type: "redfish-temperature", intervalS: 120,
      config: { host, username: s.username ?? "", password: s.password ?? "", warnC: Number(s.warnC || 27), criticalC: Number(s.criticalC || 32), riseC: 3, riseMin: 15, ignoreTls: true } }),
  },
};

export interface BulkLine { name: string; host: string; url: string; port?: number; line: number }

/**
 * Parses pasted text or CSV into lines: "host", "name,host", "name,host,port" or "name,url".
 * Separators: comma, semicolon, tab. A header row (name/host/url/port) is detected and used.
 */
export function parseBulk(text: string, input: "host" | "url"): { lines: BulkLine[]; errors: Array<{ line: number; message: string }> } {
  const rows = text.split(/\r?\n/).map((l, i) => ({ raw: l.trim(), line: i + 1 })).filter((r) => r.raw && !r.raw.startsWith("#"));
  const split = (s: string) => s.split(/[,;\t]/).map((x) => x.trim().replace(/^"(.*)"$/, "$1"));
  let cols: string[] | null = null;
  if (rows.length && /\b(name|host|hostname|address|url|port)\b/i.test(rows[0]!.raw) && !/[./:]/.test(rows[0]!.raw.replace(/[,;\t]/g, ""))) {
    cols = split(rows.shift()!.raw).map((c) => c.toLowerCase().replace(/^(hostname|address|ip)$/, "host"));
  }
  const lines: BulkLine[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  for (const r of rows) {
    const p = split(r.raw);
    const get = (k: string, pos: number) => (cols ? p[cols.indexOf(k)] : p[pos]) ?? "";
    let name: string, target: string, portS: string;
    if (cols) { target = get(input, -1) || get("host", -1) || get("url", -1); name = get("name", -1) || target; portS = get("port", -1); }
    else if (p.length === 1) { target = p[0]!; name = target; portS = ""; }
    else { name = p[0]!; target = p[1]!; portS = p[2] ?? ""; }
    if (!target) { errors.push({ line: r.line, message: `No ${input} found` }); continue; }
    let url = "", host = target;
    if (input === "url") {
      url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
      try { host = new URL(url).hostname; } catch { errors.push({ line: r.line, message: `"${target}" is not a valid URL` }); continue; }
    } else if (!/^(?!-)[A-Za-z0-9._:%-]+$/.test(target)) { errors.push({ line: r.line, message: `"${target}" is not a host name or IP address` }); continue; }
    const port = portS ? Number(portS) : undefined;
    if (portS && (!Number.isInteger(port) || port! < 1 || port! > 65535)) { errors.push({ line: r.line, message: `"${portS}" is not a valid port` }); continue; }
    lines.push({ name: name.slice(0, 80), host, url, port, line: r.line });
  }
  return { lines, errors };
}
