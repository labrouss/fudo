import { issueMessage } from "@fudo/shared";
/**
 * Configuration as code (F-602): export a scope to YAML and import it back. An item's entry in
 * the file is authoritative for that item (fields, dependencies, members); items not in the file
 * are left alone, so a partial file (e.g. from bulk add) only adds or updates.
 */
import { sql } from "drizzle-orm";
import { parseDocument, stringify, LineCounter, isMap, isSeq } from "yaml";
import { z } from "zod";
import type { Tx } from "@fudo/db";
import { wouldCreateCycle } from "@fudo/engine";
import { MONITOR_DEFAULTS, getMonitorType, monitorInputSchema, parseMonitorConfig } from "@fudo/monitors/definitions";
import { maskConfig, mergeSecrets, openConfig, sealConfig } from "@fudo/monitors/secrets";
import { canUseCredential, openCredentialSecrets } from "@fudo/monitors/credentials";
import { ownSecretMissing, withCredential, withoutCredential, type OpenCredential } from "./credentials.js";
import { applicationSchema, assetSchema, randomToken, type ImportAction, type ImportError, type ImportResult } from "@fudo/shared";
import type { TenantScope } from "./tenant-scope.js";
import { rows, textArray, type Row } from "../routes/common.js";

type Doc = { assets: unknown[]; monitors: unknown[]; applications: unknown[] };
const lower = (s: string) => s.trim().toLowerCase();
const names = z.array(z.string().trim().min(1)).default([]);
const assetItem = assetSchema.extend({ dependsOn: names });
const appItem = applicationSchema.extend({
  dependsOn: names,
  /** channels (by name) that receive this application's incidents; absent = leave the links as they are */
  notify: z.array(z.string().trim().min(1)).optional(),
  members: z.array(z.union([z.string().trim().min(1), z.object({ monitor: z.string().trim().min(1), required: z.boolean().default(true) })])).default([]),
});

// ---------------- export ----------------
export async function exportConfig(tx: Tx, scope: TenantScope, scopeName: string): Promise<string> {
  const own = sql`tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid`;
  const assets = await rows(tx, sql`SELECT * FROM assets WHERE ${own} ORDER BY name`);
  const allAssets = new Map((await rows(tx, sql`SELECT id, name FROM assets`)).map((a) => [a.id as string, a.name as string]));
  const monitors = await rows(tx, sql`SELECT * FROM monitors WHERE ${own} ORDER BY name`);
  const credName = new Map((await rows(tx, sql`SELECT id, name FROM credentials WHERE ${own}`)).map((c) => [c.id as string, c.name as string]));
  const allMonitors = new Map((await rows(tx, sql`SELECT id, name FROM monitors`)).map((m) => [m.id as string, m.name as string]));
  const apps = scope.isGlobal ? [] : await rows(tx, sql`SELECT * FROM applications WHERE ${own} ORDER BY name`);
  const deps = await rows(tx, sql`SELECT from_type, from_id, to_asset_id FROM dependencies`);
  const members = await rows(tx, sql`SELECT application_id, monitor_id, required FROM application_members`);
  const appChannels = scope.isGlobal ? [] : await rows(tx, sql`SELECT ac.application_id, ch.name FROM application_channels ac JOIN notification_channels ch ON ch.id = ac.channel_id ORDER BY ch.name`);
  const depsOf = (type: string, id: string) => deps.filter((d) => d.from_type === type && d.from_id === id).map((d) => allAssets.get(d.to_asset_id as string)!).filter(Boolean).sort();
  const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)));

  const doc = {
    fudo: 1,
    scope: scopeName,
    exported: new Date().toISOString(),
    assets: assets.map((a) => clean({ name: a.name, kind: a.kind, location: a.location, address: a.address, description: a.description, tags: a.tags, dependsOn: depsOf("asset", a.id as string) })),
    monitors: monitors.map((m) => clean({
      name: m.name, type: m.type, credential: m.credential_id ? credName.get(m.credential_id as string) : undefined,
      config: maskConfig(m.type as string, m.config as Record<string, unknown>), asset: m.asset_id ? allAssets.get(m.asset_id as string) : undefined,
      intervalS: m.interval_s, retryIntervalS: m.retry_interval_s, timeoutS: m.timeout_s, failuresBeforeDown: m.failures_before_down, successesBeforeUp: m.successes_before_up,
      tags: m.tags, description: m.description, paused: m.paused || undefined, dependsOn: depsOf("monitor", m.id as string),
    })),
    ...(scope.isGlobal ? {} : {
      applications: apps.map((a) => clean({
        name: a.name, description: a.description, owner: a.owner, criticality: a.criticality, aggregation: a.aggregation,
        minUp: a.aggregation === "n_of_m" ? a.min_up : undefined, slaTarget: Number(a.sla_target),
        members: members.filter((x) => x.application_id === a.id).map((x) => (x.required ? allMonitors.get(x.monitor_id as string) : { monitor: allMonitors.get(x.monitor_id as string), required: false })),
        dependsOn: depsOf("application", a.id as string),
        notify: appChannels.filter((x) => x.application_id === a.id).map((x) => x.name as string),
      })),
    }),
  };
  return `# Fudo configuration. Import it under Configuration (dry run first).\n# Push URLs are not exported: imported push monitors get new URLs.\n# Passwords and keys are exported as __unchanged__: they keep their saved values on re-import;\n# replace them with the real values when importing into another tenant or installation.\n# Shared credentials are referenced by name (credential:); they must exist in the target scope.\n${stringify(doc, { lineWidth: 0 })}`;
}

// ---------------- import ----------------
export function parseYaml(text: string): { doc: Doc | null; lineOf: (path: Array<string | number>) => number | null; error: ImportError | null } {
  const lc = new LineCounter();
  const d = parseDocument(text, { lineCounter: lc, prettyErrors: true });
  const lineOf = (path: Array<string | number>) => {
    const node = d.getIn(path, true) as { range?: [number, number, number] } | undefined;
    return node?.range ? lc.linePos(node.range[0]).line : null;
  };
  if (d.errors.length) {
    const e = d.errors[0]!;
    return { doc: null, lineOf, error: { kind: "file", name: null, message: e.message.split("\n")[0]!, line: e.linePos?.[0]?.line ?? null } };
  }
  const root = d.contents;
  if (!isMap(root)) return { doc: null, lineOf, error: { kind: "file", name: null, message: "The file must be a YAML mapping with assets, monitors and/or applications", line: 1 } };
  const js = d.toJS() as Record<string, unknown>;
  for (const k of ["assets", "monitors", "applications"]) if (js[k] !== undefined && !isSeq(d.get(k))) return { doc: null, lineOf, error: { kind: "file", name: null, message: `"${k}" must be a list`, line: lineOf([k]) } };
  return { doc: { assets: (js.assets as unknown[]) ?? [], monitors: (js.monitors as unknown[]) ?? [], applications: (js.applications as unknown[]) ?? [] }, lineOf, error: null };
}

const firstIssue = (e: z.ZodError) => ({ field: e.issues[0]!.path.join("."), message: issueMessage(e.issues[0]!) });
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  return v;
}

/** Validates the document against the scope and returns the plan; with apply=true executes it in `tx`. */
const byNameEarly = (list: Row[]) => new Map(list.map((r) => [String(r.name).trim().toLowerCase(), r]));

export async function importConfig(tx: Tx, scope: TenantScope, doc: Doc, lineOf: (p: Array<string | number>) => number | null, apply: boolean, appSecret: string): Promise<Omit<ImportResult, "dryRun" | "applied">> {
  const errors: ImportError[] = [];
  const actions: ImportAction[] = [];
  const own = sql`tenant_id IS NOT DISTINCT FROM ${scope.tenantId}::uuid`;
  const curAssets = await rows(tx, sql`SELECT * FROM assets WHERE ${own}`);
  const globalAssets = scope.isGlobal ? [] : await rows(tx, sql`SELECT id, name FROM assets WHERE tenant_id IS NULL`);
  const curMonitors = await rows(tx, sql`SELECT * FROM monitors WHERE ${own}`);
  const globalMonitors = scope.isGlobal ? [] : await rows(tx, sql`SELECT id, name FROM monitors WHERE tenant_id IS NULL`);
  const curApps = scope.isGlobal ? [] : await rows(tx, sql`SELECT * FROM applications WHERE ${own}`);
  const deps = await rows(tx, sql`SELECT id, from_type, from_id, to_asset_id FROM dependencies`);
  const members = await rows(tx, sql`SELECT application_id, monitor_id, required FROM application_members`);
  const channels = scope.isGlobal ? [] : await rows(tx, sql`SELECT id, name FROM notification_channels WHERE ${own}`);
  const appLinks = scope.isGlobal ? [] : await rows(tx, sql`SELECT ac.application_id, ch.name FROM application_channels ac JOIN notification_channels ch ON ch.id = ac.channel_id`);
  const creds = await rows(tx, sql`SELECT id, name, kind, fields, secrets_enc, tenant_id FROM credentials WHERE ${own}`);
  const credBy = byNameEarly(creds), credNameOf = new Map(creds.map((c) => [c.id as string, lower(c.name as string)]));
  const channelBy = new Map<string, Row[]>();
  for (const c of channels) channelBy.set(lower(c.name as string), [...(channelBy.get(lower(c.name as string)) ?? []), c]);

  const byName = (list: Row[]) => { const m = new Map<string, Row[]>(); for (const r of list) m.set(lower(r.name as string), [...(m.get(lower(r.name as string)) ?? []), r]); return m; };
  const ownAssetBy = byName(curAssets), globalAssetBy = byName(globalAssets), ownMonBy = byName(curMonitors), globalMonBy = byName(globalMonitors), ownAppBy = byName(curApps);
  const assetName = new Map([...curAssets, ...globalAssets].map((a) => [a.id as string, a.name as string]));
  const depNames = (type: string, id: string | undefined) => (id ? deps.filter((d) => d.from_type === type && d.from_id === id).map((d) => lower(assetName.get(d.to_asset_id as string) ?? "")).sort() : []);

  // ---- parse & validate items
  type A = z.infer<typeof assetItem> & { line: number | null; existing?: Row };
  type M = Record<string, any> & { line: number | null; existing?: Row };
  type P = z.infer<typeof appItem> & { line: number | null; existing?: Row };
  const assets: A[] = [], monitors: M[] = [], apps: P[] = [];
  const seen = { asset: new Set<string>(), monitor: new Set<string>(), application: new Set<string>() };
  const dup = (kind: "asset" | "monitor" | "application", name: string, line: number | null) => {
    if (seen[kind].has(lower(name))) { errors.push({ kind, name, message: `"${name}" appears more than once in the file`, line }); return true; }
    seen[kind].add(lower(name)); return false;
  };

  doc.assets.forEach((raw, i) => {
    const line = lineOf(["assets", i]);
    const r = assetItem.safeParse(raw);
    if (!r.success) { const f = firstIssue(r.error); errors.push({ kind: "asset", name: (raw as { name?: string })?.name ?? null, line: lineOf(["assets", i, f.field.split(".")[0]!]) ?? line, ...f }); return; }
    if (dup("asset", r.data.name, line)) return;
    const existing = ownAssetBy.get(lower(r.data.name))?.[0];
    if (!existing && globalAssetBy.has(lower(r.data.name))) { errors.push({ kind: "asset", name: r.data.name, line, message: `"${r.data.name}" is a shared (global) asset: it can be referenced here but only changed in the Global infrastructure scope` }); return; }
    assets.push({ ...r.data, line, existing });
  });

  doc.monitors.forEach((raw, i) => {
    const line = lineOf(["monitors", i]);
    const m = (raw ?? {}) as Record<string, any>;
    const def = getMonitorType(String(m.type ?? ""));
    const base = { ...MONITOR_DEFAULTS, ...(def?.defaultIntervalS ? { intervalS: def.defaultIntervalS } : {}), tags: [], description: "", ...m, assetId: null };
    const r = monitorInputSchema.safeParse(base);
    if (!r.success) { const f = firstIssue(r.error); errors.push({ kind: "monitor", name: m.name ?? null, line: lineOf(["monitors", i, f.field.split(".")[0]!]) ?? line, ...f }); return; }
    const matchesEarly = ownMonBy.get(lower(r.data.name)) ?? [];
    const storedOpen = matchesEarly.length === 1 && matchesEarly[0]!.type === r.data.type ? openConfig(r.data.type, matchesEarly[0]!.config as Record<string, unknown>, appSecret) : null;
    // credential: a shared credential of this scope, by name
    let cred: OpenCredential | null = null;
    if (typeof m.credential === "string" && m.credential.trim()) {
      const c = credBy.get(lower(m.credential));
      if (!c) { errors.push({ kind: "monitor", name: r.data.name, line: lineOf(["monitors", i, "credential"]) ?? line, field: "credential", message: `Unknown credential "${m.credential.trim()}" (not in this scope)` }); return; }
      if (!canUseCredential(r.data.type, c.kind as string)) { errors.push({ kind: "monitor", name: r.data.name, line: lineOf(["monitors", i, "credential"]) ?? line, field: "credential", message: `The credential "${c.name as string}" cannot be used by a ${r.data.type} monitor` }); return; }
      try { cred = { id: c.id as string, name: c.name as string, kind: c.kind as string, fields: (c.fields as Record<string, unknown>) ?? {}, secrets: openCredentialSecrets(c.secrets_enc as string, appSecret) }; }
      catch { errors.push({ kind: "monitor", name: r.data.name, line, field: "credential", message: `The credential "${c.name as string}" cannot be read (was APP_SECRET changed?)` }); return; }
    }
    const merged = mergeSecrets(r.data.type, (m.config ?? {}) as Record<string, unknown>, storedOpen);
    const cfg = parseMonitorConfig(r.data.type, cred ? withCredential(r.data.type, merged, cred) : merged);
    if (!cfg.ok) { const [field, message] = Object.entries(cfg.fields)[0]!; errors.push({ kind: "monitor", name: r.data.name, line: lineOf(["monitors", i, ...field.split(".")]) ?? line, field, message }); return; }
    // an existing monitor that leaves its credential needs its own secret in the file
    if (!cred && matchesEarly[0]?.credential_id) { const miss = ownSecretMissing(r.data.type, cfg.config); if (miss) { const [field, message] = Object.entries(miss)[0]!; errors.push({ kind: "monitor", name: r.data.name, line, field, message: `${message}, or name a credential` }); return; } }
    if (dup("monitor", r.data.name, line)) return;
    const matches = ownMonBy.get(lower(r.data.name)) ?? [];
    if (matches.length > 1) { errors.push({ kind: "monitor", name: r.data.name, line, message: `${matches.length} existing monitors are named "${r.data.name}"; rename them so names are unique before importing` }); return; }
    const dependsOn = names.safeParse(m.dependsOn);
    monitors.push({ ...r.data, config: cred ? withoutCredential(r.data.type, cred, cfg.config) : cfg.config, credentialId: cred?.id ?? null, credential: cred ? lower(cred.name) : null, asset: typeof m.asset === "string" ? m.asset.trim() : null, dependsOn: dependsOn.success ? dependsOn.data : [], paused: m.paused === true, line, existing: matches[0] });
  });

  doc.applications.forEach((raw, i) => {
    const line = lineOf(["applications", i]);
    if (scope.isGlobal) { errors.push({ kind: "application", name: (raw as { name?: string })?.name ?? null, line, message: "Applications belong to tenants; import them in a tenant scope" }); return; }
    const r = appItem.safeParse(raw);
    if (!r.success) { const f = firstIssue(r.error); errors.push({ kind: "application", name: (raw as { name?: string })?.name ?? null, line: lineOf(["applications", i, f.field.split(".")[0]!]) ?? line, ...f }); return; }
    if (dup("application", r.data.name, line)) return;
    apps.push({ ...r.data, line, existing: ownAppBy.get(lower(r.data.name))?.[0] });
  });

  // ---- references: resolve against every name in the file (also invalid entries, which already
  // have their own error), so one mistake does not cascade into "unknown" errors elsewhere
  const rawNames = (list: unknown[]) => list.map((x) => (x as { name?: unknown })?.name).filter((n): n is string => typeof n === "string").map(lower);
  const fileAssets = new Set([...assets.map((a) => lower(a.name)), ...rawNames(doc.assets)]);
  const assetKnown = (n: string) => fileAssets.has(lower(n)) || ownAssetBy.has(lower(n)) || globalAssetBy.has(lower(n));
  const fileMons = new Set([...monitors.map((m) => lower(m.name)), ...rawNames(doc.monitors)]);
  const monKnown = (n: string) => fileMons.has(lower(n)) || ownMonBy.has(lower(n)) || globalMonBy.has(lower(n));
  const ref = (kind: ImportError["kind"], name: string, line: number | null, what: string, n: string) => errors.push({ kind, name, line, message: `Unknown ${what} "${n}" (not in the file, this scope${scope.isGlobal ? "" : " or the shared infrastructure"})` });
  for (const a of assets) for (const d of a.dependsOn) if (!assetKnown(d)) ref("asset", a.name, a.line, "asset", d); else if (lower(d) === lower(a.name)) errors.push({ kind: "asset", name: a.name, line: a.line, message: "An asset cannot depend on itself" });
  for (const m of monitors) { if (m.asset && !assetKnown(m.asset)) ref("monitor", m.name, m.line, "asset", m.asset); for (const d of m.dependsOn) if (!assetKnown(d)) ref("monitor", m.name, m.line, "asset", d); }
  for (const p of apps) {
    for (const d of p.dependsOn) if (!assetKnown(d)) ref("application", p.name, p.line, "asset", d);
    for (const x of p.members) { const n = typeof x === "string" ? x : x.monitor; if (!monKnown(n)) ref("application", p.name, p.line, "monitor", n); }
    for (const n of p.notify ?? []) {
      const found = channelBy.get(lower(n)) ?? [];
      if (!found.length) errors.push({ kind: "application", name: p.name, line: p.line, message: `Unknown notification channel "${n}" (channels are not part of the file: create it under Notifications first)` });
      else if (found.length > 1) errors.push({ kind: "application", name: p.name, line: p.line, message: `${found.length} channels are named "${n}"; rename them so names are unique` });
    }
  }

  // ---- cycle check over the resulting asset graph (file entries replace their current dependencies)
  if (!errors.length) {
    const key = (n: string) => lower(n);
    const planned = new Set(assets.map((a) => key(a.name)));
    const edges = deps.filter((d) => d.from_type === "asset" && !planned.has(key(assetName.get(d.from_id as string) ?? ""))).map((d) => ({ fromType: "asset" as const, fromId: key(assetName.get(d.from_id as string) ?? ""), toAssetId: key(assetName.get(d.to_asset_id as string) ?? "") }));
    for (const a of assets) for (const d of a.dependsOn) {
      if (wouldCreateCycle(edges, key(a.name), key(d))) errors.push({ kind: "asset", name: a.name, line: a.line, message: `Depending on "${d}" would create a dependency loop` });
      else edges.push({ fromType: "asset", fromId: key(a.name), toAssetId: key(d) });
    }
  }

  // ---- plan
  const assetFields = (a: A) => ({ kind: a.kind, description: a.description, location: a.location, address: a.address, tags: [...a.tags].sort() });
  for (const a of assets) {
    if (!a.existing) { actions.push({ kind: "asset", name: a.name, action: "create", changes: [], line: a.line }); continue; }
    const cur = { kind: a.existing.kind, description: a.existing.description, location: a.existing.location, address: a.existing.address, tags: [...(a.existing.tags as string[])].sort() };
    const changes = Object.keys(cur).filter((k) => !same((cur as any)[k], (assetFields(a) as any)[k]));
    if (!same(depNames("asset", a.existing.id as string), a.dependsOn.map(lower).sort())) changes.push("dependsOn");
    actions.push({ kind: "asset", name: a.name, action: changes.length ? "update" : "unchanged", changes, line: a.line });
  }
  const monFields = (m: M) => ({ type: m.type, credential: m.credential ?? null, config: m.config, intervalS: m.intervalS, retryIntervalS: m.retryIntervalS, timeoutS: m.timeoutS, failuresBeforeDown: m.failuresBeforeDown, successesBeforeUp: m.successesBeforeUp, tags: [...m.tags].sort(), description: m.description, paused: m.paused, asset: m.asset ? lower(m.asset) : null });
  for (const m of monitors) {
    if (!m.existing) { actions.push({ kind: "monitor", name: m.name, action: "create", changes: [], line: m.line }); continue; }
    const e = m.existing;
    const cur = { type: e.type, credential: e.credential_id ? credNameOf.get(e.credential_id as string) ?? null : null, config: openConfig(e.type as string, e.config as Record<string, unknown>, appSecret), intervalS: e.interval_s, retryIntervalS: e.retry_interval_s, timeoutS: e.timeout_s, failuresBeforeDown: e.failures_before_down, successesBeforeUp: e.successes_before_up, tags: [...(e.tags as string[])].sort(), description: e.description, paused: e.paused, asset: e.asset_id ? lower(assetName.get(e.asset_id as string) ?? "") : null };
    const want = monFields(m);
    const changes = Object.keys(cur).filter((k) => !same((cur as any)[k], (want as any)[k]));
    if (!same(depNames("monitor", e.id as string), m.dependsOn.map(lower).sort())) changes.push("dependsOn");
    actions.push({ kind: "monitor", name: m.name, action: changes.length ? "update" : "unchanged", changes, line: m.line });
  }
  const monName = new Map([...curMonitors, ...globalMonitors].map((m) => [m.id as string, lower(m.name as string)]));
  for (const p of apps) {
    if (!p.existing) { actions.push({ kind: "application", name: p.name, action: "create", changes: [], line: p.line }); continue; }
    const e = p.existing;
    const cur = { description: e.description, owner: e.owner, criticality: e.criticality, aggregation: e.aggregation, minUp: e.min_up, slaTarget: Number(e.sla_target) };
    const want = { description: p.description, owner: p.owner, criticality: p.criticality, aggregation: p.aggregation, minUp: p.minUp, slaTarget: p.slaTarget };
    const changes = Object.keys(cur).filter((k) => !same((cur as any)[k], (want as any)[k]));
    const curMembers = members.filter((x) => x.application_id === e.id).map((x) => `${monName.get(x.monitor_id as string)}:${x.required}`).sort();
    const wantMembers = p.members.map((x) => (typeof x === "string" ? `${lower(x)}:true` : `${lower(x.monitor)}:${x.required}`)).sort();
    if (!same(curMembers, wantMembers)) changes.push("members");
    if (!same(depNames("application", e.id as string), p.dependsOn.map(lower).sort())) changes.push("dependsOn");
    if (p.notify && !same(appLinks.filter((x) => x.application_id === e.id).map((x) => lower(x.name as string)).sort(), p.notify.map(lower).sort())) changes.push("notify");
    actions.push({ kind: "application", name: p.name, action: changes.length ? "update" : "unchanged", changes, line: p.line });
  }

  if (!apply || errors.length) return { actions, errors, summary: summarize(actions) };

  // ---------------- apply (same transaction; all or nothing) ----------------
  const assetId = new Map<string, string>([...globalAssets, ...curAssets].map((a) => [lower(a.name as string), a.id as string]));
  for (const a of assets) {
    if (a.existing) {
      await tx.execute(sql`UPDATE assets SET kind = ${a.kind}, description = ${a.description}, location = ${a.location}, address = ${a.address}, tags = ${textArray(a.tags)}, updated_at = now() WHERE id = ${a.existing.id as string}`);
    } else {
      const id = (await rows(tx, sql`INSERT INTO assets (tenant_id, name, kind, description, location, address, tags, created_by) VALUES (${scope.tenantId}::uuid, ${a.name}, ${a.kind}, ${a.description}, ${a.location}, ${a.address}, ${textArray(a.tags)}, ${scope.userId}) RETURNING id`))[0]!.id as string;
      assetId.set(lower(a.name), id);
    }
  }
  const setDeps = async (type: string, fromId: string, list: string[]) => {
    await tx.execute(sql`DELETE FROM dependencies WHERE from_type = ${type} AND from_id = ${fromId}`);
    for (const d of new Set(list.map(lower))) await tx.execute(sql`INSERT INTO dependencies (tenant_id, from_type, from_id, to_asset_id, created_by) VALUES (${scope.tenantId}::uuid, ${type}, ${fromId}, ${assetId.get(d)!}, ${scope.userId}) ON CONFLICT DO NOTHING`);
  };
  for (const a of assets) await setDeps("asset", assetId.get(lower(a.name))!, a.dependsOn);
  const monId = new Map<string, string>([...globalMonitors, ...curMonitors].map((m) => [lower(m.name as string), m.id as string]));
  for (const m of monitors) {
    const aid = m.asset ? assetId.get(lower(m.asset)) ?? null : null;
    if (m.existing) {
      const act = actions.find((x) => x.kind === "monitor" && x.name === m.name)!;
      if (act.action === "update") {
        await tx.execute(sql`UPDATE monitors SET type = ${m.type}, credential_id = ${m.credentialId}::uuid, config = ${JSON.stringify(sealConfig(m.type, m.config, appSecret))}::jsonb, interval_s = ${m.intervalS}, retry_interval_s = ${m.retryIntervalS}, timeout_s = ${m.timeoutS},
          failures_before_down = ${m.failuresBeforeDown}, successes_before_up = ${m.successesBeforeUp}, tags = ${textArray(m.tags)}, description = ${m.description}, paused = ${m.paused}, asset_id = ${aid}::uuid,
          push_token = CASE WHEN ${m.type} = 'push' THEN coalesce(push_token, ${randomToken(24)}) ELSE NULL END, next_run_at = now(), updated_at = now() WHERE id = ${m.existing.id as string}`);
      }
    } else {
      const id = (await rows(tx, sql`INSERT INTO monitors (tenant_id, name, type, credential_id, config, interval_s, retry_interval_s, timeout_s, failures_before_down, successes_before_up, tags, description, paused, asset_id, push_token, created_by)
        VALUES (${scope.tenantId}::uuid, ${m.name}, ${m.type}, ${m.credentialId}::uuid, ${JSON.stringify(sealConfig(m.type, m.config, appSecret))}::jsonb, ${m.intervalS}, ${m.retryIntervalS}, ${m.timeoutS}, ${m.failuresBeforeDown}, ${m.successesBeforeUp}, ${textArray(m.tags)}, ${m.description}, ${m.paused}, ${aid}::uuid, ${m.type === "push" ? randomToken(24) : null}, ${scope.userId}) RETURNING id`))[0]!.id as string;
      monId.set(lower(m.name), id);
    }
    await setDeps("monitor", monId.get(lower(m.name))!, m.dependsOn);
  }
  for (const p of apps) {
    let id = p.existing?.id as string | undefined;
    if (id) await tx.execute(sql`UPDATE applications SET description = ${p.description}, owner = ${p.owner}, criticality = ${p.criticality}, aggregation = ${p.aggregation}, min_up = ${p.minUp}, sla_target = ${p.slaTarget}, updated_at = now() WHERE id = ${id}`);
    else id = (await rows(tx, sql`INSERT INTO applications (tenant_id, name, description, owner, criticality, aggregation, min_up, sla_target, created_by) VALUES (${scope.tenantId}::uuid, ${p.name}, ${p.description}, ${p.owner}, ${p.criticality}, ${p.aggregation}, ${p.minUp}, ${p.slaTarget}, ${scope.userId}) RETURNING id`))[0]!.id as string;
    await tx.execute(sql`DELETE FROM application_members WHERE application_id = ${id}`);
    for (const x of p.members) {
      const n = typeof x === "string" ? x : x.monitor;
      await tx.execute(sql`INSERT INTO application_members (application_id, monitor_id, tenant_id, required) VALUES (${id}, ${monId.get(lower(n))!}, ${scope.tenantId}::uuid, ${typeof x === "string" ? true : x.required}) ON CONFLICT DO NOTHING`);
    }
    await setDeps("application", id, p.dependsOn);
    if (p.notify) {
      await tx.execute(sql`DELETE FROM application_channels WHERE application_id = ${id}`);
      for (const n of new Set(p.notify.map(lower))) await tx.execute(sql`INSERT INTO application_channels (application_id, channel_id, tenant_id) VALUES (${id}, ${channelBy.get(n)![0]!.id as string}, ${scope.tenantId}::uuid)`);
    }
  }
  return { actions, errors, summary: summarize(actions) };
}

const summarize = (a: ImportAction[]) => ({ create: a.filter((x) => x.action === "create").length, update: a.filter((x) => x.action === "update").length, unchanged: a.filter((x) => x.action === "unchanged").length });
