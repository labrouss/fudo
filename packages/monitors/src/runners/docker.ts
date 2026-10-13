import http from "node:http";
import https from "node:https";
import type { MsgPart } from "@fudo/shared";
import { down, elapsed, errorPart, result, type Runner } from "./types.js";

function dockerGet(cfg: Record<string, unknown>, path: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const common = { method: "GET", path, timeout: timeoutMs, headers: { host: "docker" } };
    let req: http.ClientRequest;
    if (cfg.connection === "http") {
      const u = new URL(String(cfg.url));
      const lib = u.protocol === "https:" ? https : http;
      req = lib.request({ ...common, hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 2376 : 2375), headers: {}, rejectUnauthorized: !cfg.ignoreTls } as https.RequestOptions);
    } else req = http.request({ ...common, socketPath: String(cfg.socketPath || "/var/run/docker.sock") });
    req.on("response", (res) => { let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => resolve({ status: res.statusCode ?? 0, body: b })); });
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    req.end();
  });
}

export const dockerRunner: Runner = async (cfg, ctx) => {
  const start = process.hrtime.bigint();
  let r;
  try { r = await dockerGet(cfg, `/containers/${encodeURIComponent(String(cfg.container))}/json`, ctx.timeoutMs); }
  catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") return down([["docker.noSocket", { path: String(cfg.socketPath) }]]);
    if (code === "EACCES") return down([["docker.noPermission", { path: String(cfg.socketPath) }]]);
    return down([errorPart(err, ctx.timeoutMs)]);
  }
  if (r.status === 404) return down([["docker.notFound", { name: String(cfg.container) }]]);
  if (r.status !== 200) return down([["docker.http", { status: r.status }], r.body.slice(0, 120)]);
  const info = JSON.parse(r.body) as { Name?: string; State?: { Status?: string; Running?: boolean; Restarting?: boolean; ExitCode?: number; StartedAt?: string; Health?: { Status?: string; Log?: Array<{ Output?: string }> } } };
  const s = info.State ?? {};
  const ms = elapsed(start);
  const name = (info.Name ?? String(cfg.container)).replace(/^\//, "");
  if (!s.Running) return down([["docker.state", { name, state: s.Status ?? "not running" }], ...(s.ExitCode ? [["docker.exitCode", { code: s.ExitCode }] as MsgPart] : [])], ms);
  if (s.Restarting) return down([["docker.restarting", { name }]], ms);
  const h = s.Health?.Status;
  if (h === "unhealthy") { const out = (s.Health?.Log?.at(-1)?.Output ?? "").trim().slice(0, 120); return down(out ? [["docker.unhealthy", { name }], out] : [["docker.unhealthy", { name }]], ms); }
  if (h === "starting") return result("DEGRADED", ms, [["docker.starting", { name }]]);
  const parts: MsgPart[] = [["docker.running", { name }]];
  if (h) parts.push(h === "healthy" ? ["docker.healthy"] : h);
  if (s.StartedAt) parts.push(["docker.since", { since: s.StartedAt.slice(0, 16).replace("T", " ") }]);
  return result("UP", ms, parts);
};
