import { englishMessage, type MsgPart } from "@fudo/shared";
/**
 * Fudo status engine: pure functions, no I/O.
 *
 * Model
 *   monitor  ──measures──▶ asset            (monitor.assetId: the asset this check tells us about)
 *   asset|monitor|application ──depends on──▶ asset   (edges)
 *   application ◀──members── monitors (required or optional)
 *
 * Rules
 *   - An entity whose own evidence fails (DOWN/DEGRADED) while something it depends on is down
 *     becomes IMPACTED, with `cause` pointing at the root (the upstream entity that is down on its own).
 *   - An entity whose own evidence is fine but depends on something down keeps its status and gets `atRisk`.
 *   - MAINTENANCE on an asset counts as a root for its dependents (planned, not a failure).
 *   - Applications aggregate required members by rule (all / any / n_of_m); optional members can only degrade.
 */

export type RawStatus = "UNKNOWN" | "UP" | "DEGRADED" | "DOWN";
export type Status = RawStatus | "IMPACTED" | "MAINTENANCE";
export type EntityType = "monitor" | "asset" | "application";

export interface Ref { type: EntityType; id: string; name: string; /** root is in planned maintenance, not failed */ planned?: boolean }

export interface MonitorNode { id: string; tenantId: string | null; name: string; status: RawStatus; paused: boolean; assetId: string | null }
export interface AssetNode { id: string; tenantId: string | null; name: string }
export interface Edge { fromType: EntityType; fromId: string; toAssetId: string }
export interface AppNode {
  id: string;
  tenantId: string;
  name: string;
  aggregation: "all" | "any" | "n_of_m";
  minUp: number;
  members: Array<{ monitorId: string; required: boolean }>;
}
export interface Snapshot {
  monitors: MonitorNode[];
  assets: AssetNode[];
  edges: Edge[];
  applications: AppNode[];
  maintenance: { monitors: Set<string>; assets: Set<string>; applications: Set<string> };
}

export interface Evaluation {
  status: Status;
  /** root cause when IMPACTED (or the failing member for a DOWN application) */
  cause: Ref | null;
  /** fine now, but something it depends on is down */
  atRisk: Ref | null;
  summary: string;
  /** the summary as translatable message parts (see @fudo/shared messages.ts) */
  summaryParts: MsgPart[];
}

/** English summary plus its parts. */
const sum = (parts: MsgPart[]) => ({ summary: englishMessage(parts), summaryParts: parts });

export type Results = Map<string, Evaluation>;
export const key = (type: EntityType, id: string) => `${type}:${id}`;

const FAILING = new Set<Status>(["DOWN", "IMPACTED"]);
const RANK: Record<RawStatus, number> = { UNKNOWN: 0, UP: 1, DEGRADED: 2, DOWN: 3 };

function worst(statuses: RawStatus[]): RawStatus {
  return statuses.reduce<RawStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), "UNKNOWN");
}

export function evaluate(snap: Snapshot, opts: { forceDown?: Set<string> } = {}): Results {
  const res: Results = new Map();
  const assetById = new Map(snap.assets.map((a) => [a.id, a]));
  const monitorsByAsset = new Map<string, MonitorNode[]>();
  for (const m of snap.monitors) if (m.assetId) monitorsByAsset.set(m.assetId, [...(monitorsByAsset.get(m.assetId) ?? []), m]);
  const edgesFrom = new Map<string, string[]>();
  for (const e of snap.edges) edgesFrom.set(key(e.fromType, e.fromId), [...(edgesFrom.get(key(e.fromType, e.fromId)) ?? []), e.toAssetId]);
  const inMaint = (m: MonitorNode) => snap.maintenance.monitors.has(m.id) || (m.assetId !== null && snap.maintenance.assets.has(m.assetId));
  const forced = opts.forceDown ?? new Set<string>();

  /** The root an upstream evaluation contributes, if it is down, impacted or in maintenance. */
  function rootOf(assetId: string): Ref | null {
    const r = evalAsset(assetId, new Set());
    const a = assetById.get(assetId)!;
    if (r.status === "IMPACTED") return r.cause;
    if (r.status === "DOWN") return { type: "asset", id: a.id, name: a.name };
    if (r.status === "MAINTENANCE") return { type: "asset", id: a.id, name: a.name, planned: true };
    return null;
  }
  /** Root cause or inherited risk from anything upstream (for atRisk, which passes through healthy layers). */
  function upstreamRisk(fromType: EntityType, fromId: string): Ref | null {
    for (const to of edgesFrom.get(key(fromType, fromId)) ?? []) {
      if (!assetById.has(to)) continue;
      const r = rootOf(to) ?? evalAsset(to, new Set()).atRisk;
      if (r) return r;
    }
    return null;
  }
  function upstreamRoot(fromType: EntityType, fromId: string): Ref | null {
    for (const to of edgesFrom.get(key(fromType, fromId)) ?? []) {
      if (!assetById.has(to)) continue;
      const r = rootOf(to);
      if (r) return r;
    }
    return null;
  }

  function evalAsset(id: string, visiting: Set<string>): Evaluation {
    const k = key("asset", id);
    const done = res.get(k);
    if (done) return done;
    if (visiting.has(id)) return { status: "UNKNOWN", cause: null, atRisk: null, ...sum([["eval.cycle"]]) };
    visiting.add(id);
    let out: Evaluation;
    if (snap.maintenance.assets.has(id)) {
      out = { status: "MAINTENANCE", cause: null, atRisk: null, ...sum([["eval.maintenance"]]) };
    } else {
      const mons = (monitorsByAsset.get(id) ?? []).filter((m) => !m.paused && !inMaint(m));
      const own: RawStatus = forced.has(id) ? "DOWN" : worst(mons.map((m) => (forced.has(m.id) ? "DOWN" : m.status)));
      let root: Ref | null = null;
      let risk: Ref | null = null;
      for (const to of edgesFrom.get(key("asset", id)) ?? []) {
        if (!assetById.has(to)) continue;
        const r = evalAsset(to, visiting);
        const a = assetById.get(to)!;
        root = r.status === "IMPACTED" ? r.cause : r.status === "DOWN" ? { type: "asset", id: a.id, name: a.name } : r.status === "MAINTENANCE" ? { type: "asset", id: a.id, name: a.name, planned: true } : null;
        risk ??= root ?? r.atRisk;
        if (root) break;
      }
      const failing = own === "DOWN" || own === "DEGRADED";
      const summary = sum(mons.length === 0 && !forced.has(id) ? [["eval.notMonitored"]] : [["eval.checksUp", { up: mons.filter((m) => m.status === "UP").length, total: mons.length }]]);
      if (failing && root && !forced.has(id)) out = { status: "IMPACTED", cause: root, atRisk: null, ...summary };
      else out = { status: own, cause: null, atRisk: failing ? null : (root ?? risk), ...summary };
    }
    visiting.delete(id);
    res.set(k, out);
    return out;
  }

  for (const a of snap.assets) evalAsset(a.id, new Set());

  for (const m of snap.monitors) {
    let out: Evaluation;
    if (m.paused) out = { status: "UNKNOWN", cause: null, atRisk: null, ...sum([["eval.paused"]]) };
    else if (inMaint(m)) out = { status: "MAINTENANCE", cause: null, atRisk: null, ...sum([["eval.maintenance"]]) };
    else {
      const own: RawStatus = forced.has(m.id) ? "DOWN" : m.status;
      const assetEval = m.assetId ? res.get(key("asset", m.assetId)) : undefined;
      const root = (assetEval?.status === "IMPACTED" ? assetEval.cause : null) ?? upstreamRoot("monitor", m.id);
      const failing = own === "DOWN" || own === "DEGRADED";
      if (failing && root) out = { status: "IMPACTED", cause: root, atRisk: null, summary: "", summaryParts: [] };
      else out = { status: own, cause: null, atRisk: failing ? null : (root ?? assetEval?.atRisk ?? upstreamRisk("monitor", m.id)), summary: "", summaryParts: [] };
    }
    res.set(key("monitor", m.id), out);
  }

  const monitorById = new Map(snap.monitors.map((m) => [m.id, m]));
  for (const app of snap.applications) {
    let out: Evaluation;
    if (snap.maintenance.applications.has(app.id)) {
      out = { status: "MAINTENANCE", cause: null, atRisk: null, ...sum([["eval.maintenance"]]) };
    } else {
      const members = app.members
        .map((mm) => ({ ...mm, node: monitorById.get(mm.monitorId), ev: res.get(key("monitor", mm.monitorId)) }))
        .filter((x) => x.node && x.ev && !x.node.paused);
      const req = members.filter((x) => x.required);
      const opt = members.filter((x) => !x.required);
      const healthy = req.filter((x) => x.ev!.status === "UP" || x.ev!.status === "DEGRADED" || x.ev!.status === "MAINTENANCE");
      const failing = req.filter((x) => FAILING.has(x.ev!.status));
      const degraded = req.some((x) => x.ev!.status === "DEGRADED") || opt.some((x) => FAILING.has(x.ev!.status) || x.ev!.status === "DEGRADED");
      const minUp = app.aggregation === "all" ? req.length : app.aggregation === "any" ? 1 : Math.min(app.minUp, req.length);
      const bad = failing.length > 0 && healthy.length < Math.max(1, minUp) && (app.aggregation !== "all" || failing.length > 0);
      const badAll = app.aggregation === "all" ? failing.length > 0 : bad;
      const summary = sum(req.length === 0 ? [["eval.noRequired"]] : [["eval.requiredHealthy", { healthy: healthy.length, total: req.length }], ...(app.aggregation === "n_of_m" ? [["eval.needs", { n: minUp }] as MsgPart] : app.aggregation === "any" ? [["eval.needs", { n: 1 }] as MsgPart] : [])]);
      if (badAll) {
        const down = failing.find((x) => x.ev!.status === "DOWN");
        if (down) {
          const root = upstreamRoot("application", app.id);
          out = root ? { status: "IMPACTED", cause: root, atRisk: null, ...summary } : { status: "DOWN", cause: { type: "monitor", id: down.node!.id, name: down.node!.name }, atRisk: null, ...summary };
        } else {
          out = { status: "IMPACTED", cause: failing[0]!.ev!.cause, atRisk: null, ...summary };
        }
      } else {
        const status: Status = req.length === 0 && opt.length === 0 ? "UNKNOWN" : failing.length > 0 || degraded ? "DEGRADED" : req.every((x) => x.ev!.status === "UNKNOWN") && req.length > 0 ? "UNKNOWN" : "UP";
        const risk = upstreamRisk("application", app.id) ?? members.map((x) => x.ev!.atRisk).find(Boolean) ?? null;
        out = { status, cause: null, atRisk: risk, ...summary };
      }
    }
    res.set(key("application", app.id), out);
  }
  return res;
}

/** Would adding from → to create a cycle among asset dependencies? */
export function wouldCreateCycle(edges: Edge[], fromAssetId: string, toAssetId: string): boolean {
  if (fromAssetId === toAssetId) return true;
  const next = new Map<string, string[]>();
  for (const e of edges) if (e.fromType === "asset") next.set(e.fromId, [...(next.get(e.fromId) ?? []), e.toAssetId]);
  const stack = [toAssetId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === fromAssetId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(next.get(cur) ?? []));
  }
  return false;
}

export interface BlastRadius { assets: string[]; monitors: string[]; applications: string[] }

/** Everything that depends on `assetId`, directly or transitively. */
export function blastRadius(snap: Snapshot, assetId: string): BlastRadius {
  const assets = new Set<string>([assetId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of snap.edges) if (e.fromType === "asset" && assets.has(e.toAssetId) && !assets.has(e.fromId)) { assets.add(e.fromId); grew = true; }
  }
  const monitors = new Set(snap.monitors.filter((m) => (m.assetId && assets.has(m.assetId))).map((m) => m.id));
  for (const e of snap.edges) if (e.fromType === "monitor" && assets.has(e.toAssetId)) monitors.add(e.fromId);
  const apps = new Set<string>();
  for (const a of snap.applications) {
    if (a.members.some((mm) => monitors.has(mm.monitorId))) apps.add(a.id);
  }
  for (const e of snap.edges) if (e.fromType === "application" && assets.has(e.toAssetId)) apps.add(e.fromId);
  assets.delete(assetId);
  return { assets: [...assets], monitors: [...monitors], applications: [...apps] };
}

/**
 * What-if: assume `assetId` fails and every check in its blast radius fails with it;
 * returns the predicted evaluation of the affected applications.
 */
export function whatIf(snap: Snapshot, assetId: string): { radius: BlastRadius; applications: Array<{ id: string; before: Evaluation; after: Evaluation }> } {
  const radius = blastRadius(snap, assetId);
  const before = evaluate(snap);
  const after = evaluate(snap, { forceDown: new Set([assetId, ...radius.monitors]) });
  return {
    radius,
    applications: radius.applications.map((id) => ({ id, before: before.get(key("application", id))!, after: after.get(key("application", id))! })),
  };
}

export * from "./incidents.js";
export * from "./availability.js";
