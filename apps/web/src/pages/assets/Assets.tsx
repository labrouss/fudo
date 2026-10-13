import { OwnerCard } from "../../components/Owner";
import { NoMatch, SortTh, STATUS_RANK, TableFilter, useTable } from "../../components/Table";
import { ASSET_KIND_LABELS } from "../../defs";
import { T } from "../../components/T";
import { t, uiLocale, tmsg } from "../../i18n";
import { AvailabilityCard } from "../../components/Charts";
import { useLiveReload } from "../../live";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { type AssetDetail, type AssetDto, type ImpactDto, type MonitorDto, type TenantPermissions } from "@fudo/shared";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { Dialog } from "../../components/Dialog";
import { Field, FormError } from "../../components/Field";
import { CauseNote, StatusPill } from "../../components/Monitoring";
import { Link, navigate } from "../../router";

export function useAssets() {
  const [assets, setAssets] = useState<AssetDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.get<AssetDto[]>("/assets").then((a) => { setAssets(a); setError(null); }).catch((e) => setError(errorFields(e).message)), []);
  useLiveReload(load, ["status", "monitor"]);
  return { assets, error, reload: load };
}

const Scope = ({ scope, hide }: { scope: "tenant" | "global"; hide?: boolean }) => (scope === "global" && !hide ? <span className="scope-badge" title={t("assets.shared_infrastructure_managed_in_the")}>{t("common.global")}</span> : null);

export function AssetList({ perms, isGlobal }: { perms: TenantPermissions; isGlobal: boolean }) {
  const { assets, error, reload } = useAssets();
  const [creating, setCreating] = useState(false);
  const table = useTable("assets", assets, {
    status: { value: (a) => STATUS_RANK[a.status] },
    name: { value: (a) => a.name },
    depends: { value: (a) => a.dependsOn.map((d) => d.name).join(", ") },
    checks: { value: (a) => a.monitorCount, desc: true },
    used: { value: (a) => a.dependentCount, desc: true },
  }, { text: (a) => `${ASSET_KIND_LABELS[a.kind] ?? a.kind} ${a.location} ${a.tags.join(" ")}` });
  const shown = table.rows;
  return (
    <>
      <PageHeader help="concepts" title={isGlobal ? t("assets.assets_shared_infrastructure") : t("common.assets")}>
        <TableFilter table={table} placeholder={t("assets.search_assets")} />
        {perms.manage && <button className="btn btn--primary" onClick={() => setCreating(true)}>{t("assets.add_asset")}</button>}
      </PageHeader>
      <div className="content">
        <FormError message={error} />
        {!isGlobal && <p className="muted small"><T k="assets.scope_note" values={{ scope: <strong>{t("common.global_infrastructure")}</strong> }} /></p>}
        <section className="card card--flush">
          {assets && assets.length === 0 ? (
            <div className="empty">
              <p>{t("assets.no_assets_yet_assets_are_the")}</p>
              {perms.manage && <button className="btn btn--primary" onClick={() => setCreating(true)}>{t("assets.add_the_first_asset")}</button>}
            </div>
          ) : (
            <table className="table">
              <thead><tr><SortTh table={table} col="status">{t("common.status")}</SortTh><SortTh table={table} col="name">{t("common.asset")}</SortTh><SortTh table={table} col="depends">{t("assets.depends_on")}</SortTh><SortTh table={table} col="checks" className="num">{t("common.checks")}</SortTh><SortTh table={table} col="used" className="num">{t("assets.used_by")}</SortTh></tr></thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id} className="row-link" onClick={() => navigate(`/assets/${a.id}`)}>
                    <td><StatusPill status={a.status} /></td>
                    <td>
                      <Link href={`/assets/${a.id}`} className="strong row-link__a" onClick={(e) => e.stopPropagation()}>{a.name}</Link><Scope scope={a.scope} hide={isGlobal} />
                      <div className="muted small">{ASSET_KIND_LABELS[a.kind] ?? a.kind}{a.location && ` · ${a.location}`}</div>
                      <CauseNote status={a.status} cause={a.cause} atRisk={a.atRisk} />
                    </td>
                    <td><div className="chips">{a.dependsOn.map((d) => <span key={d.edgeId} className="chip">{d.name}</span>)}{a.dependsOn.length === 0 && <span className="muted small">—</span>}</div></td>
                    <td className="num">{a.monitorCount || <span className="muted">0</span>}</td>
                    <td className="num">{a.dependentCount}</td>
                  </tr>
                ))}
                <NoMatch table={table} colSpan={5} />
              </tbody>
            </table>
          )}
        </section>
      </div>
      <Dialog title={t("assets.add_asset")} open={creating} onClose={() => setCreating(false)}>
        {creating && <AssetForm onSaved={(id) => { setCreating(false); void reload(); navigate(`/assets/${id}`); }} />}
      </Dialog>
    </>
  );
}

function AssetForm({ asset, onSaved }: { asset?: AssetDto; onSaved: (id: string) => void }) {
  const [form, setForm] = useState({ name: asset?.name ?? "", kind: asset?.kind ?? "switch", location: asset?.location ?? "", address: asset?.address ?? "", description: asset?.description ?? "", tags: asset?.tags.join(", ") ?? "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setFields({}); setMessage(null);
    const body = { ...form, tags: form.tags.split(",").map((item) => item.trim()).filter(Boolean) };
    try {
      if (asset) { await api.put(`/assets/${asset.id}`, body); onSaved(asset.id); }
      else onSaved((await api.post<{ id: string }>("/assets", body)).id);
    } catch (err) { const r = errorFields(err); setFields(r.fields); setMessage(Object.keys(r.fields).length ? null : r.message); } finally { setBusy(false); }
  }
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <div className="grid-2">
        <Field label={t("common.name")} value={form.name} onChange={set("name")} error={fields.name} placeholder={t("assets.core_sw_01")} />
        <label className="field">{t("assets.kind")}
          <select value={form.kind} onChange={set("kind")}>{Object.entries(ASSET_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <Field label={t("assets.location")} value={form.location} onChange={set("location")} placeholder={t("assets.dc1_row_a_rack_12")} />
        <Field label={t("assets.management_address")} value={form.address} onChange={set("address")} placeholder="10.10.0.1 or https://ilo-host" />
      </div>
      <Field label={t("common.tags")} value={form.tags} onChange={set("tags")} hint={t("common.comma_separated")} />
      <Field label={t("common.description")} value={form.description} onChange={set("description")} />
      <div className="row-actions row-actions--end"><button className="btn btn--primary" disabled={busy}>{busy ? t("common.saving") : asset ? t("common.save_changes") : t("assets.add_asset")}</button></div>
    </form>
  );
}

export function AssetDetailPage({ id, perms, scopeIsGlobal }: { id: string; perms: TenantPermissions; scopeIsGlobal: boolean }) {
  const [a, setA] = useState<AssetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [impact, setImpact] = useState<ImpactDto | null>(null);
  const { assets } = useAssets();
  const [dep, setDep] = useState("");
  const [linking, setLinking] = useState(false);
  const load = useCallback(() => api.get<AssetDetail>(`/assets/${id}`).then((d) => { setA(d); setError(null); }).catch((e) => setError(errorFields(e).message)), [id]);
  useLiveReload(load, ["status", "monitor"]);

  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); } catch (e) { setError(errorFields(e).message); } };
  if (!a) return <><PageHeader help="concepts" title={t("common.asset")} /><div className="content">{error ? <FormError message={error} /> : <p className="muted">{t("common.loading")}</p>}</div></>;
  const owned = (a.scope === "global") === scopeIsGlobal;
  const canEdit = perms.manage && owned;
  // a tenant may put its own monitors on shared (Global) assets too
  const canLink = perms.manage && (owned || !scopeIsGlobal);
  const candidates = (assets ?? []).filter((x) => x.id !== a.id && !a.dependsOn.some((d) => d.id === x.id) && (scopeIsGlobal ? x.scope === "global" : true));

  return (
    <>
      <PageHeader help="concepts" title={a.name}>
        {canEdit && <button className="btn" onClick={() => setEditing(true)}>{t("common.edit")}</button>}
        {canEdit && <button className="btn btn--danger" onClick={() => { if (confirm(t("assets.delete_asset_name_its_dependencies_are", { name: a.name }))) void act(async () => { await api.del(`/assets/${a.id}`); navigate("/assets"); }); }}>{t("common.delete")}</button>}
      </PageHeader>
      <div className="content">
        <FormError message={error} />
        <StatusBanner status={a.status} cause={a.cause} atRisk={a.atRisk} what={t("assets.this_asset")} />
        <section className="card detail-head">
          <div className="detail-head__main"><StatusPill status={a.status} /><span className="type-tag">{ASSET_KIND_LABELS[a.kind] ?? a.kind}</span><Scope scope={a.scope} />{a.address && <span className="mono small">{a.address}</span>}</div>
          <p className="muted small">{tmsg(a.summaryParts, a.summary)}{a.location && ` · ${a.location}`}{a.statusChangedAt && t("common.status_since_p0", { p0: new Date(a.statusChangedAt).toLocaleString(uiLocale()) })}</p>
          {a.description && <p className="small">{a.description}</p>}
          {!owned && <p className="muted small">{t("assets.shared_infrastructure_read_only_here")}</p>}
        </section>
        <OwnerCard type="asset" id={id} canManage={perms.manage} />

        <AvailabilityCard path={`/assets/${a.id}`} />

        <div className="two-col">
          <section className="card">
            <div className="card-head"><h2>{t("assets.checks_on_this_asset")}</h2>{canLink && (
              <div className="row-actions">
                <button className="btn btn--small" onClick={() => setLinking(true)}>{t("assets.add_existing")}</button>
                <button className="btn btn--small" onClick={() => navigate(`/monitors/new?asset=${a.id}`)}>{t("assets.new_monitor")}</button>
              </div>
            )}</div>
            {a.monitors.length === 0 ? <p className="muted small">{t("assets.no_monitors_linked_without_checks_the")}</p> : (
              <div className="list-rows">{a.monitors.map((m) => (
                <div key={m.id} className="list-row list-row--4"><StatusPill status={m.effectiveStatus} /><Link href={`/monitors/${m.id}`}>{m.name}</Link><span className="muted small">{m.type}</span>
                  {canLink && (m.scope === "global") === scopeIsGlobal ? <button className="btn btn--small" title={t("assets.remove_monitor_hint")} onClick={() => act(() => api.del(`/assets/${a.id}/monitors/${m.id}`))}>{t("common.remove")}</button> : <span />}</div>
              ))}</div>
            )}
          </section>
          <section className="card">
            <div className="card-head"><h2>{t("assets.depends_on")}</h2></div>
            {a.dependsOn.length === 0 ? <p className="muted small">{t("assets.nothing_yet_add_what_this_asset_needs_to")}</p> : (
              <div className="list-rows">{a.dependsOn.map((d) => (
                <div key={d.edgeId} className="list-row"><StatusPill status={d.status} /><Link href={`/assets/${d.id}`}>{d.name}</Link>
                  {canEdit ? <button className="btn btn--small" onClick={() => act(() => api.del(`/dependencies/${d.edgeId}`))}>{t("common.remove")}</button> : <span />}</div>
              ))}</div>
            )}
            {canEdit && (
              <div className="add-row">
                <select value={dep} onChange={(e) => setDep(e.target.value)} aria-label={t("assets.asset_to_depend_on")}><option value="">{t("common.choose_an_asset")}</option>{candidates.map((x) => <option key={x.id} value={x.id}>{x.name}{x.scope === "global" && !scopeIsGlobal ? t("common.global_2") : ""}</option>)}</select>
                <button className="btn" disabled={!dep} onClick={() => act(async () => { await api.post("/dependencies", { fromType: "asset", fromId: a.id, toAssetId: dep }); setDep(""); })}>{t("common.add_dependency")}</button>
              </div>
            )}
          </section>
        </div>

        <section className="card">
          <div className="card-head"><h2>{t("assets.used_by")}</h2><button className="btn btn--small" onClick={() => api.get<ImpactDto>(`/assets/${a.id}/impact`).then(setImpact).catch((e) => setError(errorFields(e).message))}>{t("assets.what_if_this_fails")}</button></div>
          {a.usedBy.length === 0 ? <p className="muted small">{t("assets.nothing_depends_on_this_asset_yet")}</p> : (
            <div className="list-rows">{a.usedBy.map((u) => (
              <div key={`${u.type}${u.id}`} className="list-row"><StatusPill status={u.status} />
                <Link href={u.type === "asset" ? `/assets/${u.id}` : u.type === "monitor" ? `/monitors/${u.id}` : `/applications/${u.id}`}>{u.name}</Link>
                <span className="muted small">{u.type}{u.tenantName ? ` · ${u.tenantName}` : ""}</span></div>
            ))}</div>
          )}
          {impact && <ImpactView impact={impact} name={a.name} />}
        </section>
      </div>
      <Dialog wide title={t("assets.add_existing_title", { name: a.name })} open={linking} onClose={() => setLinking(false)}>{linking && <MonitorLinker assetId={a.id} onDone={() => { setLinking(false); void load(); }} />}</Dialog>
      <Dialog title={t("assets.edit_asset")} open={editing} onClose={() => setEditing(false)}>{editing && <AssetForm asset={a} onSaved={() => { setEditing(false); void load(); }} />}</Dialog>
    </>
  );
}

/** Existing monitors of this scope to put on the asset; those on another asset move here. */
function MonitorLinker({ assetId, onDone }: { assetId: string; onDone: () => void }) {
  const [monitors, setMonitors] = useState<MonitorDto[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get<MonitorDto[]>("/monitors").then(setMonitors).catch((e) => { setMonitors([]); setError(errorFields(e).message); }); }, []);
  const avail = (monitors ?? []).filter((m) => m.assetId !== assetId);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = avail.filter((m) => { const hay = `${m.name} ${m.type} ${m.assetName ?? ""} ${m.tags.join(" ")}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
  const groups = [[t("assets.not_on_an_asset"), shown.filter((m) => !m.assetId)], [t("assets.on_another_asset"), shown.filter((m) => m.assetId)]] as const;
  const toggle = (id: string) => setChosen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const moving = avail.filter((m) => chosen.has(m.id) && m.assetId).length;
  const save = async () => {
    setBusy(true); setError(null);
    try { await api.post(`/assets/${assetId}/monitors`, { monitorIds: [...chosen] }); onDone(); } catch (e) { setError(errorFields(e).message); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <FormError message={error} />
      <input type="search" className="search" style={{ width: "100%" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("assets.search_monitors")} aria-label={t("assets.search_monitors")} data-autofocus />
      <div className="pick-list">
        {groups.map(([label, list]) => list.length > 0 && (
          <div key={label}><h4>{label}</h4>{list.map((m) => (
            <label key={m.id} className="check small" style={{ padding: "4px 0" }}>
              <input type="checkbox" checked={chosen.has(m.id)} onChange={() => toggle(m.id)} /><StatusPill status={m.effectiveStatus} />{m.name}
              <span className="muted">{m.type}{m.assetName ? ` · ${t("assets.now_on", { asset: m.assetName })}` : ""}</span>
            </label>
          ))}</div>
        ))}
        {monitors && avail.length === 0 && <p className="muted small">{t("assets.every_monitor_is_on_this_asset")}</p>}
        {monitors && avail.length > 0 && shown.length === 0 && <p className="muted small">{t("table.no_match", { q: q.trim() })}</p>}
        {!monitors && <p className="muted small">{t("common.loading")}</p>}
      </div>
      {moving > 0 && <p className="muted small">{t("assets.monitors_move_here", { n: moving })}</p>}
      <div className="row-actions row-actions--end"><button className="btn btn--primary" disabled={chosen.size === 0 || busy} onClick={() => void save()}>{t("assets.add_n_monitors", { n: chosen.size })}</button></div>
    </div>
  );
}

function ImpactView({ impact, name }: { impact: ImpactDto; name: string }) {
  const hit = impact.applications.filter((x) => x.after.status === "DOWN" || x.after.status === "IMPACTED");
  const survive = impact.applications.filter((x) => !(x.after.status === "DOWN" || x.after.status === "IMPACTED"));
  return (
    <div className="banner banner--risk" style={{ marginTop: 16, flexDirection: "column", alignItems: "stretch" }}>
      <strong>{t("assets.whatif.summary", { name, hit: hit.length, survive: survive.length })}</strong>
      <span className="small">{t("assets.whatif.also", { assets: impact.assets.length, list: impact.assets.length ? ` (${impact.assets.map((x) => x.name).join(", ")})` : "", checks: impact.monitorCount })}{impact.hiddenApplications > 0 && ` ${t("assets.whatif.hidden", { count: impact.hiddenApplications })}`}</span>
      {impact.applications.length > 0 && (
        <ul className="impact-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {impact.applications.map((x) => (
            <li key={x.id}><StatusPill status={x.after.status} /><span><Link href={`/applications/${x.id}`}>{x.name}</Link>{x.tenantName && <span className="muted small"> · {x.tenantName}</span>}</span><span className="small muted">{tmsg(x.after.summaryParts, x.after.summary)}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StatusBanner({ status, cause, atRisk, what }: { status: string; cause: { type: string; id: string; name: string; planned?: boolean } | null; atRisk: { type: string; id: string; name: string; planned?: boolean } | null; what: string }) {
  const href = (r: { type: string; id: string }) => (r.type === "asset" ? `/assets/${r.id}` : r.type === "monitor" ? `/monitors/${r.id}` : `/applications/${r.id}`);
  if (status === "IMPACTED" && cause?.planned) return <div className="banner banner--maint" role="status"><strong>{t("assets.impacted_by_maintenance")}</strong><span><T k="assets.banner.maintenance" values={{ what, cause: <Link href={href(cause)}>{cause.name}</Link> }} /></span></div>;
  if (status === "IMPACTED" && cause) return <div className="banner banner--impact" role="status"><strong>{t("assets.impacted")}</strong><span><T k="assets.banner.impacted" values={{ what, cause: <Link href={href(cause)}>{cause.name}</Link> }} /></span></div>;
  if (status === "DOWN" && cause) return <div className="banner banner--down" role="status"><strong>{t("common.down")}</strong><span><T k="assets.banner.down" values={{ cause: <Link href={href(cause)}>{cause.name}</Link> }} /></span></div>;
  if (status === "MAINTENANCE") return <div className="banner banner--maint" role="status"><strong>{t("common.maintenance")}</strong><span>{t("assets.planned_work_in_progress_results_are")}</span></div>;
  if (atRisk) return <div className="banner banner--risk" role="status"><strong>{t("assets.at_risk")}</strong><span><T k={atRisk.planned ? "assets.banner.at_risk_maintenance" : "assets.banner.at_risk"} values={{ what, dep: <Link href={href(atRisk)}>{atRisk.name}</Link> }} /></span></div>;
  return null;
}
