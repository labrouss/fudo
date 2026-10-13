import { APP_VERSION } from "../version.js";

type Op = { summary: string; description?: string; perm: "read" | "operate" | "manage"; params?: string[]; query?: Array<[string, string, string]>; body?: string; tag: string; responses?: string };

const OPS: Record<string, Record<string, Op>> = {
  "/monitors": {
    get: { tag: "Monitors", summary: "List monitors", perm: "read", query: [["include", "global", "Also return shared (global) monitors"]] },
    post: { tag: "Monitors", summary: "Create a monitor", perm: "manage", body: "MonitorInput" },
  },
  "/monitors/{id}": {
    get: { tag: "Monitors", summary: "Monitor details, recent results, uptime and status changes", perm: "read", params: ["id"] },
    put: { tag: "Monitors", summary: "Update a monitor", perm: "manage", params: ["id"], body: "MonitorInput" },
    delete: { tag: "Monitors", summary: "Delete a monitor and its history", perm: "manage", params: ["id"] },
  },
  "/monitors/{id}/pause": { post: { tag: "Monitors", summary: "Pause checks", perm: "operate", params: ["id"], body: "Empty" } },
  "/monitors/{id}/resume": { post: { tag: "Monitors", summary: "Resume checks", perm: "operate", params: ["id"], body: "Empty" } },
  "/monitors/{id}/series": { get: { tag: "Monitors", summary: "Response-time and failure series", perm: "read", params: ["id"], query: [["range", "1h|6h|24h|7d|30d|90d", "Time range (resolution is chosen automatically)"]] } },
  "/monitors/test": { post: { tag: "Monitors", summary: "Run a check once without saving", perm: "operate", body: "MonitorTest" } },
  "/applications": { get: { tag: "Applications", summary: "List applications with status and cause", perm: "read" } },
  "/applications/{id}": { get: { tag: "Applications", summary: "Application details, members, dependency graph, history", perm: "read", params: ["id"] } },
  "/applications/{id}/availability": { get: { tag: "Applications", summary: "Availability with daily buckets", perm: "read", params: ["id"], query: [["days", "1–365", "Period length"]] } },
  "/assets": { get: { tag: "Assets", summary: "List assets (own and shared)", perm: "read" } },
  "/assets/{id}": { get: { tag: "Assets", summary: "Asset details", perm: "read", params: ["id"] } },
  "/assets/{id}/impact": { get: { tag: "Assets", summary: "What-if: applications affected if this asset fails", perm: "read", params: ["id"] } },
  "/incidents": { get: { tag: "Incidents", summary: "List incidents", perm: "read", query: [["status", "active|resolved|all", "Filter"], ["q", "text", "Search title, INC number or tag"]] } },
  "/incidents/{id}": { get: { tag: "Incidents", summary: "Incident with timeline, similar incidents and notifications", perm: "read", params: ["id"] } },
  "/incidents/{id}/ack": { post: { tag: "Incidents", summary: "Acknowledge", perm: "operate", params: ["id"], body: "Empty" } },
  "/incidents/{id}/snooze": { post: { tag: "Incidents", summary: "Snooze notifications", perm: "operate", params: ["id"], body: "Snooze" } },
  "/incidents/{id}/resolve": { post: { tag: "Incidents", summary: "Resolve (only after the item recovered)", perm: "operate", params: ["id"], body: "Resolve" } },
  "/incidents/{id}/notes": { post: { tag: "Incidents", summary: "Add a comment, action or resolution note", perm: "operate", params: ["id"], body: "Note" } },
  "/maintenance": {
    get: { tag: "Maintenance", summary: "List maintenance windows", perm: "read" },
    post: { tag: "Maintenance", summary: "Schedule a maintenance window", perm: "manage", body: "Maintenance" },
  },
  "/maintenance/{id}/end": { post: { tag: "Maintenance", summary: "End now (or cancel if upcoming)", perm: "operate", params: ["id"], body: "Empty" } },
  "/config/export": { get: { tag: "Configuration", summary: "Export this scope (assets, monitors, applications, dependencies) as YAML", perm: "manage" } },
  "/config/import": { post: { tag: "Configuration", summary: "Import YAML (dry run by default); items in the file are created or updated, others untouched", perm: "manage", body: "Import" } },
  "/dashboard": { get: { tag: "Reports", summary: "Dashboard data: availability, incidents, monitor counts", perm: "read" } },
  "/reports/download": {
    get: {
      tag: "Reports", summary: "Availability / SLA report", perm: "read",
      query: [["preset", "last-week|last-month|last-30-days|custom", "Period"], ["from", "YYYY-MM-DD", "Custom start"], ["to", "YYYY-MM-DD", "Custom end (inclusive)"], ["tz", "IANA time zone", "e.g. Europe/Athens"], ["bh", "0|1", "Include business-hours availability"], ["format", "json|pdf|csv-availability|csv-incidents", "Output"]],
    },
  },
  "/push/{token}": { get: { tag: "Push", summary: "Push heartbeat (no API token needed; the push token authenticates)", perm: "read", params: ["token"], query: [["status", "up|down", "Default up"], ["msg", "text", "Message"], ["ping", "ms", "Duration"]] } },
};

const SCHEMAS: Record<string, unknown> = {
  Empty: { type: "object" },
  MonitorInput: {
    type: "object", required: ["name", "type", "config", "intervalS", "retryIntervalS", "timeoutS", "failuresBeforeDown", "successesBeforeUp"],
    properties: {
      name: { type: "string" }, type: { type: "string", enum: ["http", "ping", "tcp", "dns", "tls", "push"] },
      config: { type: "object", description: "Type-specific settings, e.g. http: { url, method, acceptedStatus, keyword, jsonPath, jsonExpected }; tcp: { host, port }; ping: { host }" },
      intervalS: { type: "integer", minimum: 20 }, retryIntervalS: { type: "integer", minimum: 10 }, timeoutS: { type: "integer" },
      failuresBeforeDown: { type: "integer" }, successesBeforeUp: { type: "integer" }, tags: { type: "array", items: { type: "string" } },
      description: { type: "string" }, assetId: { type: "string", format: "uuid", nullable: true },
    },
    example: { name: "ERP health", type: "http", config: { url: "https://erp.corp.local/health", acceptedStatus: "200-299" }, intervalS: 60, retryIntervalS: 30, timeoutS: 10, failuresBeforeDown: 3, successesBeforeUp: 1, tags: ["prod"] },
  },
  MonitorTest: { type: "object", required: ["type", "config"], properties: { type: { type: "string" }, config: { type: "object" }, timeoutS: { type: "integer" } } },
  Snooze: { type: "object", required: ["minutes"], properties: { minutes: { type: "integer", minimum: 5 } } },
  Resolve: { type: "object", properties: { note: { type: "string", description: "Optional resolution note" } } },
  Note: { type: "object", required: ["type", "body"], properties: { type: { type: "string", enum: ["comment", "action", "resolution"] }, body: { type: "string" }, tags: { type: "array", items: { type: "string" } } } },
  Maintenance: {
    type: "object", required: ["name", "startsAt", "endsAt", "targets"],
    properties: { name: { type: "string" }, description: { type: "string" }, startsAt: { type: "string", format: "date-time" }, endsAt: { type: "string", format: "date-time" },
      targets: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: ["asset", "monitor", "application"] }, id: { type: "string", format: "uuid" } } } } },
  },
  Import: { type: "object", properties: { yaml: { type: "string", description: "YAML document as exported" }, doc: { type: "object", description: "Alternatively the parsed document" }, dryRun: { type: "boolean", default: true } } },
  Error: { type: "object", properties: { error: { type: "string" }, message: { type: "string" }, fields: { type: "object", additionalProperties: { type: "string" } } } },
};

export function openApiSpec(baseUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [path, ops] of Object.entries(OPS)) {
    paths[path] = {};
    for (const [method, op] of Object.entries(ops)) {
      paths[path]![method] = {
        tags: [op.tag], summary: op.summary,
        description: `${op.description ? op.description + "\n\n" : ""}Requires an API token with **${op.perm}** permission (or higher).`,
        parameters: [
          ...(op.params ?? []).map((p) => ({ name: p, in: "path", required: true, schema: { type: "string" } })),
          ...(op.query ?? []).map(([name, values, d]) => ({ name, in: "query", required: false, description: `${d} (${values})`, schema: { type: "string" } })),
        ],
        ...(op.body ? { requestBody: { required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${op.body}` } } } } } : {}),
        responses: { 200: { description: "OK" }, 400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }, 401: { description: "Missing or invalid token" }, 403: { description: "Permission or scope does not allow this" }, 404: { description: "Not found (or not in this token's scope)" } },
        ...(path.startsWith("/push/") ? { security: [] } : {}),
      };
    }
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "Fudo API", version: APP_VERSION,
      description: "Automate Fudo from scripts and other tools.\n\n**Authentication:** create a token under *API access* (per tenant or for the Global infrastructure scope) and send `Authorization: Bearer fudo_…`. A token acts only in its own scope with its permission: **read**, **operate** (also pause/resume, acknowledge, notes, tests) or **manage** (also create, change, delete).\n\nState-changing requests must send `Content-Type: application/json`. Errors return `{ error, message, fields? }`.",
    },
    servers: [{ url: `${baseUrl}/api` }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "fudo_…" } }, schemas: SCHEMAS },
    security: [{ bearer: [] }],
    paths,
  };
}

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Self-contained documentation page rendered from the spec (no CDN: works in isolated networks). */
export function docsHtml(baseUrl: string): string {
  const spec = openApiSpec(baseUrl);
  const tags = [...new Set(Object.values(OPS).flatMap((ops) => Object.values(ops).map((o) => o.tag)))];
  const md = (t: string) => esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/\n\n/g, "</p><p>");
  const section = (tag: string) => {
    const rows = Object.entries(OPS).flatMap(([path, ops]) => Object.entries(ops).filter(([, o]) => o.tag === tag).map(([m, o]) => {
      const body = o.body && o.body !== "Empty" ? SCHEMAS[o.body] as { example?: unknown; properties?: Record<string, unknown> } : null;
      const example = body?.example ?? (body?.properties ? Object.fromEntries(Object.keys(body.properties).map((k) => [k, "…"])) : null);
      return `<article class="op"><h3><span class="m m-${m}">${m.toUpperCase()}</span> <code>/api${esc(path)}</code> <span class="perm perm-${o.perm}">${o.perm}</span></h3>
        <p>${esc(o.summary)}</p>
        ${o.query?.length ? `<table>${o.query.map(([n, v, d]) => `<tr><td><code>${esc(n)}</code></td><td>${esc(v)}</td><td>${esc(d)}</td></tr>`).join("")}</table>` : ""}
        ${example ? `<pre>${esc(JSON.stringify(example, null, 2))}</pre>` : ""}</article>`;
    }));
    return `<section id="${esc(tag)}"><h2>${esc(tag)}</h2>${rows.join("")}</section>`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fudo API</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon-32.png">
<style>
body{margin:0;font:15px/1.5 "IBM Plex Sans",system-ui,sans-serif;color:#16181d;background:#f4f3ef}
header{background:#1b1d22;color:#e7e5df;padding:24px 32px}header h1{margin:0 0 4px;font-size:22px}header a{color:#e7e5df}
nav{position:sticky;top:0;background:#fbfaf7;border-bottom:1px solid #e2dfd6;padding:10px 32px;display:flex;gap:16px;flex-wrap:wrap}nav a{color:#2f5fa7;text-decoration:none;font-size:14px}
main{max-width:980px;margin:0 auto;padding:24px 32px}.intro{background:#fff;border:1px solid #e2dfd6;border-radius:10px;padding:16px 20px}
h2{margin:32px 0 12px;font-size:18px}.op{background:#fff;border:1px solid #e2dfd6;border-radius:10px;padding:12px 16px;margin-bottom:10px}
.op h3{margin:0;font-size:15px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.op p{margin:6px 0 0;color:#3f3e39}
.m{font:600 12px "IBM Plex Mono",monospace;padding:2px 8px;border-radius:4px;color:#fff}.m-get{background:#2f5fa7}.m-post{background:#135c43}.m-put{background:#7a4b06}.m-delete{background:#9a1c12}
.perm{margin-left:auto;font-size:12px;border-radius:999px;padding:1px 9px;background:#f1eee7}.perm-operate{background:#eef2f9;color:#23467f}.perm-manage{background:#fbefd7;color:#7a4b06}
code{font-family:"IBM Plex Mono",monospace;font-size:13px}pre{background:#1b1d22;color:#e7e5df;border-radius:8px;padding:10px 12px;overflow-x:auto;font-size:12px}
table{border-collapse:collapse;margin-top:8px;font-size:13px}td{padding:3px 12px 3px 0;vertical-align:top;color:#3f3e39}
</style></head><body>
<header><h1>Fudo API <small>v${esc(spec.info.version)}</small></h1><div>Base URL <code>${esc(baseUrl)}/api</code> · <a href="/api/openapi.json">openapi.json</a> (import into Postman, Swagger UI, Insomnia)</div></header>
<nav>${tags.map((t) => `<a href="#${esc(t)}">${esc(t)}</a>`).join("")}</nav>
<main><div class="intro"><p>${md(spec.info.description)}</p>
<pre>curl -H "Authorization: Bearer fudo_…" ${esc(baseUrl)}/api/incidents?status=active

# PowerShell
Invoke-RestMethod -Uri ${esc(baseUrl)}/api/incidents -Headers @{ Authorization = "Bearer fudo_…" }</pre></div>
${tags.map(section).join("")}</main></body></html>`;
}
