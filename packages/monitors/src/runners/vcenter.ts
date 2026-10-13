import { createHash } from "node:crypto";
import { Agent, fetch } from "undici";
import type { MsgPart } from "@fudo/shared";
import { down, elapsed, errorPart, result, type Runner } from "./types.js";

/**
 * vCenter REST: /api (7.0 U2+; the session token is a JSON string) or /rest (6.5–7.0; { value: token }).
 * The flavor is detected positively: /api only counts when it returns a token string, because on 6.x
 * the reverse proxy may answer /api/session with a 2xx page. Sessions are cached per vCenter and user
 * (one login every 20 minutes) and the working flavor per vCenter.
 */
export type Flavor = "api" | "rest";
const sessions = new Map<string, { token: string; flavor: Flavor; at: number; version: string | null }>();
const flavorOf = new Map<string, Flavor>();
export const insecure = new Agent({ connect: { rejectUnauthorized: false } });

class AuthError extends Error {}

export async function readJson(r: { text: () => Promise<string> }): Promise<unknown> {
  try { return JSON.parse(await r.text()); } catch { return undefined; }
}

/** Tries one session endpoint: the token, or why it did not work. */
async function trySession(base: string, flavor: Flavor, auth: string, dispatcher: Agent | undefined, timeoutMs: number): Promise<{ token?: string; status: number }> {
  const r = await fetch(`${base}${flavor === "api" ? "/api/session" : "/rest/com/vmware/cis/session"}`, {
    method: "POST", headers: { authorization: auth, "content-type": "application/json", accept: "application/json" }, dispatcher, signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) { await r.text().catch(() => ""); return { status: r.status }; }
  const body = await readJson(r);
  const token = flavor === "api" ? (typeof body === "string" ? body : undefined) : typeof (body as { value?: unknown })?.value === "string" ? (body as { value: string }).value : undefined;
  return { token: token && /^[A-Za-z0-9-]{16,}$/.test(token) ? token : undefined, status: r.status };
}

/** Logs in, preferring the flavor that worked last time for this vCenter. */
export async function login(base: string, user: string, pass: string, dispatcher: Agent | undefined, timeoutMs: number, prefer?: Flavor): Promise<{ token: string; flavor: Flavor }> {
  const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  const order: Flavor[] = (prefer ?? flavorOf.get(base)) === "rest" ? ["rest", "api"] : ["api", "rest"];
  const statuses: string[] = [];
  let denied = 0, notSessionApi = 0;
  for (const flavor of order) {
    const r = await trySession(base, flavor, auth, dispatcher, timeoutMs);
    if (r.token) { flavorOf.set(base, flavor); return { token: r.token, flavor }; }
    if (r.status === 401 || r.status === 403) denied++;
    else if (r.status < 300 || r.status === 404 || r.status === 405) notSessionApi++; // e.g. 6.x answering /api with a page
    statuses.push(`/${flavor}: HTTP ${r.status}${r.status < 300 ? " without a session token" : ""}`);
  }
  // credentials were rejected where a session API exists, and nothing else went wrong
  if (denied > 0 && denied + notSessionApi === order.length) throw new AuthError("Authentication failed");
  throw new Error(`Login failed (${statuses.join(", ")})`);
}

/** Appliance version, best effort (needs no extra privilege on most setups; ignored when refused). */
async function applianceVersion(base: string, s: { token: string; flavor: Flavor }, dispatcher: Agent | undefined, timeoutMs: number): Promise<string | null> {
  try {
    const r = await fetch(`${base}${s.flavor === "api" ? "/api/appliance/system/version" : "/rest/appliance/system/version"}`, { headers: { "vmware-api-session-id": s.token, accept: "application/json" }, dispatcher, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const b = (await readJson(r)) as { version?: string; value?: { version?: string } } | undefined;
    return b?.version ?? b?.value?.version ?? null;
  } catch { return null; }
}

export interface VmSummary { vm: string; name: string; power_state: string; cpu_count?: number; memory_size_MiB?: number }

/** Extracts the VM list from either API flavor. */
export const vmList = (flavor: Flavor, body: unknown): VmSummary[] => {
  const list = flavor === "rest" ? (body as { value?: unknown } | undefined)?.value : body;
  return Array.isArray(list) ? (list as VmSummary[]) : [];
};

const STATE: Record<string, string> = { POWERED_ON: "powered on", POWERED_OFF: "powered off", SUSPENDED: "suspended" };

export const vcenterVmRunner: Runner = async (cfg, ctx) => {
  const start = process.hrtime.bigint();
  const base = /^https?:\/\//.test(String(cfg.server)) ? String(cfg.server).replace(/\/$/, "") : `https://${cfg.server}`;
  const dispatcher = cfg.ignoreTls ? insecure : undefined;
  // the password is part of the key: a monitor with other (or wrong) credentials never reuses a session
  const key = `${base}|${cfg.username}|${createHash("sha256").update(String(cfg.password)).digest("hex")}`;
  const get = async (path: string, s: { token: string }) => fetch(`${base}${path}`, { headers: { "vmware-api-session-id": s.token, accept: "application/json" }, dispatcher, signal: AbortSignal.timeout(ctx.timeoutMs) });
  try {
    const fresh = async (prefer?: Flavor) => {
      const l = await login(base, String(cfg.username), String(cfg.password), dispatcher, ctx.timeoutMs, prefer);
      const v = { ...l, at: Date.now(), version: await applianceVersion(base, l, dispatcher, ctx.timeoutMs) };
      sessions.set(key, v);
      return v;
    };
    let s = sessions.get(key);
    if (!s || Date.now() - s.at > 20 * 60_000) s = await fresh();
    const name = encodeURIComponent(String(cfg.vmName));
    const listPath = () => (s!.flavor === "api" ? `/api/vcenter/vm?names=${name}` : `/rest/vcenter/vm?filter.names=${name}`);
    let r = await get(listPath(), s);
    if (r.status === 401) { s = await fresh(s.flavor); r = await get(listPath(), s); }
    // an /api session on a vCenter without the /api VM service: use /rest instead (and remember it)
    if (s.flavor === "api" && [400, 404, 405].includes(r.status)) {
      flavorOf.set(base, "rest");
      s = await fresh("rest");
      r = await get(listPath(), s);
    }
    if (!r.ok) return down([["vcenter.http", { status: r.status, path: `${s.flavor === "api" ? "/api" : "/rest"}/vcenter/vm` }]]);
    const vms = vmList(s.flavor, await readJson(r));
    if (!vms.length) return down([["vcenter.vmNotFound", { vm: String(cfg.vmName), user: String(cfg.username) }]]);
    const vm = vms[0]!;
    const ms = elapsed(start);
    const detail: MsgPart[] = [
      ["vcenter.cpu", { count: vm.cpu_count ?? "?" }],
      vm.memory_size_MiB ? ["vcenter.memory", { gib: vm.memory_size_MiB / 1024 }] : "? GiB",
      ...(vms.length > 1 ? [["vcenter.sameName", { count: vms.length, id: String(vm.vm) }] as MsgPart] : []),
    ];
    const stateRef = (st: string) => (STATE[st] ? `@vcenter.state.${st}` : st);
    if (vm.power_state !== cfg.expectedState) return down([["vcenter.stateMismatch", { vm: vm.name, state: stateRef(vm.power_state), expected: stateRef(String(cfg.expectedState)) }]], ms);
    if (cfg.checkTools && cfg.expectedState === "POWERED_ON") {
      if (s.flavor === "rest") return result("UP", ms, [["vcenter.vmState", { vm: vm.name, state: "@vcenter.state.POWERED_ON" }], ...detail, ["vcenter.toolsNeed7"]]);
      const t = await get(`/api/vcenter/vm/${vm.vm}/tools`, s);
      const tools = t.ok ? ((await t.json()) as { run_state?: string; version_status?: string }) : null;
      if (tools?.run_state !== "RUNNING") return result("DEGRADED", ms, [["vcenter.vmState", { vm: vm.name, state: "@vcenter.state.POWERED_ON" }], ["vcenter.toolsState", { state: tools?.run_state?.toLowerCase().replace("_", " ") ?? "?" }]]);
      return result("UP", ms, [["vcenter.vmState", { vm: vm.name, state: "@vcenter.state.POWERED_ON" }], tools.version_status === "CURRENT" ? ["vcenter.toolsRunning"] : ["vcenter.toolsVersion", { status: tools.version_status?.toLowerCase() ?? "?" }], ...detail]);
    }
    return result("UP", ms, [["vcenter.vmState", { vm: vm.name, state: stateRef(vm.power_state) }], ...detail, s.version ? `vCenter ${s.version}` : `vCenter ${s.flavor === "api" ? "7+" : "6.x"} API`]);
  } catch (err) {
    sessions.delete(key);
    return down([err instanceof AuthError ? ["auth.failedFor", { user: String(cfg.username) }] : /^Login failed/.test((err as Error).message) ? (err as Error).message : errorPart(err, ctx.timeoutMs)]);
  }
};
