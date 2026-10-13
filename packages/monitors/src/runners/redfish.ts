import { Agent, fetch } from "undici";
import { englishMessage, type MsgPart } from "@fudo/shared";
import { down, elapsed, errorPart, type Runner } from "./types.js";

const insecure = new Agent({ connect: { rejectUnauthorized: false } });

/**
 * Health from a Redfish ComputerSystem: Status.Health (OK / Warning / Critical), plus HPE iLO's
 * AggregateHealthStatus to name the failing subsystem (fans, power supplies, storage, …).
 */
const HEALTH = new Set(["OK", "Warning", "Critical"]);
const POWER = new Set(["On", "Off", "PoweringOn", "PoweringOff"]);
const healthRef = (h: string) => (HEALTH.has(h) ? `@redfish.health.${h}` : h);
const powerRef = (p: string) => (POWER.has(p) ? `@redfish.power.${p}` : p.toLowerCase());

export function redfishVerdict(sys: Record<string, any>, requirePowerOn: boolean): { status: "UP" | "DEGRADED" | "DOWN"; message: string; parts: MsgPart[] } {
  const health: string = sys.Status?.HealthRollup ?? sys.Status?.Health ?? "Unknown";
  const model = [sys.Manufacturer, sys.Model].filter(Boolean).join(" ") || "System";
  const power: string = sys.PowerState ?? "Unknown";
  const agg = sys.Oem?.Hpe?.AggregateHealthStatus as Record<string, any> | undefined;
  const bad: string[] = [];
  if (agg) {
    for (const [k, v] of Object.entries(agg)) {
      const h = v?.Status?.Health;
      if (h && h !== "OK") bad.push(`${k.replace(/([a-z])([A-Z])/g, "$1 $2")}: ${h}`);
    }
    if (agg.FanRedundancy && agg.FanRedundancy !== "Redundant") bad.push(`Fan redundancy: ${agg.FanRedundancy}`);
    if (agg.PowerSupplyRedundancy && agg.PowerSupplyRedundancy !== "Redundant") bad.push(`Power redundancy: ${agg.PowerSupplyRedundancy}`);
  }
  const extra: MsgPart[] = bad.length ? [bad.join(", ")] : [];
  const out = (status: "UP" | "DEGRADED" | "DOWN", parts: MsgPart[]) => ({ status, message: englishMessage(parts), parts });
  const h: MsgPart = ["redfish.health", { health: healthRef(health) }];
  const pw: MsgPart = ["redfish.power", { power: powerRef(power) }];
  if (requirePowerOn && power !== "On") return out("DOWN", [["redfish.poweredState", { model, power: powerRef(power) }]]);
  if (health === "Critical") return out("DOWN", [h, model, ...extra]);
  if (health === "Warning" || bad.length) return out("DEGRADED", [h, model, ...extra]);
  if (health !== "OK") return out("DEGRADED", [h, model, pw]);
  return out("UP", [h, model, pw, ...(sys.HostName ? [String(sys.HostName)] : [])]);
}

/** GET for Redfish paths of one BMC (Basic auth; a 401/403 is marked `auth`; a 404 is marked `missing`). */
export function redfishGetter(cfg: Record<string, unknown>, ctx: { timeoutMs: number }) {
  const base = /^https?:\/\//.test(String(cfg.host)) ? String(cfg.host).replace(/\/$/, "") : `https://${cfg.host}`;
  const headers = { authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64")}`, accept: "application/json", "odata-version": "4.0" };
  const dispatcher = cfg.ignoreTls ? insecure : undefined;
  return async (path: string) => {
    const r = await fetch(`${base}${path}`, { headers, dispatcher, signal: AbortSignal.timeout(ctx.timeoutMs) });
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error("Authentication failed"), { auth: true });
    if (r.status === 404) throw Object.assign(new Error(`HTTP 404 for ${path}`), { missing: true });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
    return (await r.json()) as Record<string, any>;
  };
}

export const redfishRunner: Runner = async (cfg, ctx) => {
  const start = process.hrtime.bigint();
  const get = redfishGetter(cfg, ctx);
  try {
    let path = String(cfg.systemPath || "");
    if (!path) {
      const col = await get("/redfish/v1/Systems");
      path = col.Members?.[0]?.["@odata.id"];
      if (!path) return down([["redfish.noSystems"]]);
    }
    const v = redfishVerdict(await get(path), Boolean(cfg.requirePowerOn));
    return { ...v, latencyMs: elapsed(start) };
  } catch (err) {
    return down([(err as { auth?: boolean }).auth ? ["auth.failedFor", { user: String(cfg.username) }] : errorPart(err, ctx.timeoutMs)]);
  }
};
