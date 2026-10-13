import { t, uiLocale } from "../../i18n";
import { useCallback, useMemo, useState } from "react";
import { GLOBAL_SCOPE, type ImportResult, type MeResponse, type TenantPermissions } from "@fudo/shared";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { FormError } from "../../components/Field";
import { ImportPlan } from "../../components/ImportPlan";
import { Pill } from "../../components/Status";
import { NoMatch, SortTh, TableFilter, useTable } from "../../components/Table";
import { ASSET_KIND_LABELS, MONITOR_TEMPLATES } from "../../defs";
import { useLiveReload } from "../../live";
import { Link } from "../../router";
import { DiscoveryGate, Progress, RunStatus, runTitle, type RunDto } from "./Discovery";

interface ResultDto {
  id: string; key: string; address: string; name: string; category: string; vendor: string; model: string; os: string; template: string; assetKind: string;
  parentKey: string | null; dependsOn: string[]; details: Record<string, any>;
  known: { assetId: string | null; assetName: string | null; scope: "global" | "tenant" | null; tenantId: string | null; tenantName: string | null; monitors: number } | null;
}
type RunWithResults = RunDto & { results: ResultDto[] };
interface Choice { name: string; template: string }

/** Monitors for one device: its template's, or a ping only. */
function monitorsFor(c: Choice, r: ResultDto) {
  if (c.template === "none" || !r.address) return { kind: r.assetKind, monitors: [] };
  const tpl = MONITOR_TEMPLATES.find((x) => x.id === c.template);
  if (!tpl) return { kind: r.assetKind, monitors: [{ name: `${c.name} ping`, type: "ping", config: { host: r.address, packets: 3, degradedLossPct: 20 } }] };
  return { kind: tpl.assetKind, monitors: tpl.build({ name: c.name, host: r.address, url: `https://${r.address}/` }) };
}

export function DiscoveryRunPage({ id, me, perms, isGlobal }: { id: string; me: MeResponse; perms: TenantPermissions; isGlobal: boolean }) {
  const [run, setRun] = useState<RunWithResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hideKnown, setHideKnown] = useState(true);
  const [target, setTarget] = useState<string>(GLOBAL_SCOPE);
  const [tags, setTags] = useState("");
  const [plan, setPlan] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const allowed = isGlobal && perms.manage;
  const load = useCallback(() => (allowed ? api.get<RunWithResults>(`/discovery/runs/${id}`).then((r) => {
    setRun(r);
    setChoices((c) => { const n = { ...c }; for (const x of r.results) n[x.id] ??= { name: x.name, template: x.template }; return n; });
  }).catch((e) => setError(errorFields(e).message)) : Promise.resolve()), [id, allowed]);
  const active = run?.status === "running" || run?.status === "queued" || run?.status === "cancelling";
  useLiveReload(load, [], active ? 2000 : 60_000);
  const shown = useMemo(() => (run?.results ?? []).filter((r) => !hideKnown || !r.known), [run, hideKnown]);
  const table = useTable("discovery-results", shown, {
    address: { value: (r) => r.address.split(".").map((p) => p.padStart(3, "0")).join(".") },
    name: { value: (r) => choices[r.id]?.name ?? r.name },
    category: { value: (r) => t(`discovery.cat.${r.category}`) },
    template: { value: (r) => choices[r.id]?.template ?? r.template },
  }, { initial: { key: "address", dir: "asc" }, text: (r) => `${r.address} ${t(`discovery.cat.${r.category}`)} ${r.vendor} ${r.model} ${r.os} ${r.details.rdns ?? ""} ${r.details.snmp?.sysDescr ?? ""} ${r.details.cluster ?? ""}` });
  if (!allowed) return <DiscoveryGate perms={perms} isGlobal={isGlobal} />;
  if (!run) return <div className="content"><FormError message={error} />{!error && <p className="muted">{t("common.loading")}</p>}</div>;

  const scopes = [{ id: GLOBAL_SCOPE, name: t("common.global") }, ...me.tenants.map((x) => ({ id: x.id, name: x.name }))];
  const toggle = (rid: string) => { setPlan(null); setSelected((s) => { const n = new Set(s); if (n.has(rid)) n.delete(rid); else n.add(rid); return n; }); };
  const setChoice = (rid: string, patch: Partial<Choice>) => { setPlan(null); setChoices((c) => ({ ...c, [rid]: { ...c[rid]!, ...patch } })); };

  function doc() {
    const tagList = tags.split(",").map((x) => x.trim()).filter(Boolean);
    const assets: Array<Record<string, unknown>> = [], monitors: Array<Record<string, unknown>> = [];
    const chosen = run!.results.filter((x) => selected.has(x.id));
    const byKey = new Map(run!.results.map((x) => [x.key, x]));
    for (const r of chosen) {
      const c = choices[r.id]!;
      const m = monitorsFor(c, r);
      // dependencies: on devices created together, or already known in this scope (or shared from Global)
      const deps = r.dependsOn.map((k) => byKey.get(k)).filter((d): d is ResultDto => !!d).map((d) => selected.has(d.id) ? choices[d.id]!.name
        : d.known?.assetName && (d.known.scope === "global" || d.known.tenantId === target) ? d.known.assetName : null).filter((n): n is string => !!n);
      const own = [...tagList, ...(((r.details.tags as string[] | undefined) ?? []))];
      assets.push({ name: c.name, kind: m.kind, address: r.address, tags: own, description: [r.vendor, r.model].filter(Boolean).join(" ").slice(0, 500), ...(deps.length ? { dependsOn: deps } : {}) });
      for (const x of m.monitors) monitors.push({ ...x, asset: c.name, tags: tagList });
    }
    return { assets, monitors };
  }
  async function submit(dryRun: boolean) {
    setBusy(true); setError(null);
    try {
      const r = await api.in(target).post<ImportResult>("/config/import", { doc: doc(), dryRun });
      setPlan(r);
      if (!dryRun && r.applied) { setSelected(new Set()); await load(); }
    } catch (e) { setError(errorFields(e).message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader help="discovery" title={runTitle(run)}>
        {active && <button className="btn" onClick={() => void api.post(`/discovery/runs/${run.id}/cancel`).then(load)}>{t("discovery.stop")}</button>}
        <Link className="btn" href="/discovery">{t("discovery.all_runs")}</Link>
      </PageHeader>
      <div className="content">
        <FormError message={error} />
        <section className="card disc-head">
          <div><RunStatus r={run} /> <span className="small muted">{t(`discovery.source.${run.source}`)} · {new Date(run.createdAt).toLocaleString(uiLocale())}{run.startedBy ? ` · ${run.startedBy}` : ""}</span></div>
          <div className="mono small">{String(run.params.targets ?? run.params.host ?? "")}</div>
          {active ? <Progress r={run} /> : <p className="small muted" style={{ margin: 0 }}>{(run.source === "subnet" ? t("discovery.summary", { total: run.total, found: run.found, known: run.results.filter((r) => r.known).length }) : t("discovery.summary_items", { found: run.results.length, known: run.results.filter((r) => r.known).length }))}</p>}
          {run.error && <p className="field__error" style={{ margin: 0 }}>{run.error}</p>}
        </section>

        <div className="list-tools">
          <label className="check small" style={{ flex: 1 }}><input type="checkbox" checked={hideKnown} onChange={(e) => setHideKnown(e.target.checked)} />{t("discovery.hide_known")}</label>
          <TableFilter table={table} />
        </div>
        <section className="card card--flush">
          {shown.length === 0 ? <div className="empty"><p>{active ? t("discovery.searching") : run.results.length ? t("discovery.all_known") : t("discovery.nothing")}</p></div> : (
            <table className="table">
              <thead><tr>
                <th><input type="checkbox" aria-label={t("credentials.select_all")} checked={table.rows.length > 0 && table.rows.every((r) => selected.has(r.id))} onChange={(e) => { setPlan(null); setSelected(e.target.checked ? new Set([...selected, ...table.rows.map((r) => r.id)]) : new Set([...selected].filter((x) => !table.rows.some((r) => r.id === x)))); }} /></th>
                <SortTh table={table} col="address">{t("discovery.address")}</SortTh>
                <SortTh table={table} col="name">{t("common.name")}</SortTh>
                <SortTh table={table} col="category">{t("discovery.looks_like")}</SortTh>
                <SortTh table={table} col="template">{t("discovery.monitors")}</SortTh>
                <th>{t("discovery.known")}</th>
              </tr></thead>
              <tbody>{table.rows.map((r) => {
                const c = choices[r.id] ?? { name: r.name, template: r.template };
                return (
                  <tr key={r.id} className={selected.has(r.id) ? "row--selected" : undefined}>
                    <td><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={r.address} /></td>
                    <td>{r.address ? <span className="mono">{r.address}</span> : <span className="muted small">{t("discovery.no_address")}</span>}{r.details.rdns && <div className="small muted">{r.details.rdns}</div>}
                      {r.dependsOn.length > 0 && <div className="small muted">↳ {r.dependsOn.map((k) => run.results.find((x) => x.key === k)?.name ?? k).join(", ")}</div>}</td>
                    <td><input className="input--inline" value={c.name} onChange={(e) => setChoice(r.id, { name: e.target.value })} aria-label={t("common.name")} /></td>
                    <td>
                      <span className="strong">{t(`discovery.cat.${r.category}`)}</span>
                      {(r.vendor || r.model) && <div className="small">{[r.vendor, r.model].filter(Boolean).join(" · ")}</div>}
                      <details className="small muted disc-details"><summary>{t("discovery.details")}</summary>
                        {r.details.ports?.length > 0 && <div>{t("discovery.open_ports")}: <span className="mono">{r.details.ports.join(", ")}</span></div>}
                        <div>{t("discovery.ping")}: {r.details.ping ? t("discovery.yes") : t("discovery.no")}</div>
                        {r.details.snmp && <div>SNMP: <span className="mono">{r.details.snmp.sysName}</span> — {r.details.snmp.sysDescr}</div>}
                        {r.details.redfish && <div>Redfish: {[r.details.redfish.vendor, r.details.redfish.product, r.details.redfish.version].filter(Boolean).join(" · ")}</div>}
                        {r.details.certName && <div>{t("discovery.certificate")}: <span className="mono">{r.details.certName}</span></div>}
                        {r.details.cluster && <div>{t("discovery.cluster")}: {r.details.cluster}</div>}
                        {r.details.power && <div>{t("discovery.power")}: {String(r.details.power).toLowerCase().replace(/_/g, " ")}</div>}
                        {r.details.bay && <div>{t("discovery.bay")}: {r.details.bay}</div>}
                        {r.details.serial && <div>{t("discovery.serial")}: <span className="mono">{r.details.serial}</span></div>}
                        {r.details.description && <div>{r.details.description}</div>}
                        {Array.isArray(r.details.via) && r.details.via.map((v: { switch: string; port: string; remotePort: string; protocol: string }, i: number) => <div key={i}>{t("discovery.connected_to", { sw: v.switch, port: v.port })}{v.remotePort ? ` (${v.remotePort})` : ""} · {v.protocol}</div>)}
                        {Array.isArray(r.details.links) && r.details.links.length > 0 && <div>{t("discovery.neighbours")}: {r.details.links.map((l: { port: string; to: string }) => `${l.port} → ${l.to}`).join(", ")}</div>}
                      </details>
                    </td>
                    <td>
                      <select value={r.address ? c.template : "none"} disabled={!r.address} onChange={(e) => setChoice(r.id, { template: e.target.value })} aria-label={t("discovery.monitors")}>
                        <option value="none">{t("discovery.asset_only")}</option>
                        <option value="">{t("discovery.ping_only")}</option>
                        {MONITOR_TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                      </select>
                      <div className="small muted">{ASSET_KIND_LABELS[MONITOR_TEMPLATES.find((x) => x.id === c.template)?.assetKind ?? r.assetKind] ?? ""}</div>
                    </td>
                    <td>{r.known ? <><Pill tone="neutral">{t("discovery.known_yes")}</Pill><div className="small">{r.known.assetName ? <>{r.known.assetName}{r.known.scope === "tenant" ? ` (${r.known.tenantName})` : ` (${t("common.global")})`}</> : t("discovery.monitors_n", { n: r.known.monitors })}</div></> : <span className="muted small">{t("discovery.new_device")}</span>}</td>
                  </tr>
                );
              })}<NoMatch table={table} colSpan={6} /></tbody>
            </table>
          )}
        </section>

        {selected.size > 0 && (
          <section className="card disc-create" aria-label={t("discovery.create_title")}>
            <h2>{t("discovery.create_title_n", { n: selected.size })}</h2>
            <div className="form-grid">
              <label className="field">{t("discovery.create_in")}
                <select value={target} onChange={(e) => { setTarget(e.target.value); setPlan(null); }}>{scopes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                <span className="field__hint">{t("discovery.create_in_hint")}</span>
              </label>
              <label className="field">{t("common.tags")}<input value={tags} onChange={(e) => { setTags(e.target.value); setPlan(null); }} placeholder="discovered, dc1" /><span className="field__hint">{t("common.comma_separated")}</span></label>
            </div>
            {plan && <ImportPlan r={plan} />}
            <div className="row-actions row-actions--end">
              <button className="btn" disabled={busy} onClick={() => void submit(true)}>{t("monitors.preview")}</button>
              <button className="btn btn--primary" disabled={busy || !plan || plan.dryRun === false || plan.errors.length > 0} onClick={() => void submit(false)}>{t("discovery.create", { n: selected.size })}</button>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
