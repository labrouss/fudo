import { OwnerCard } from "../../components/Owner";
import { SortSelect, STATUS_RANK, TableFilter, useTable } from "../../components/Table";
import { t, uiLocale, tmsg } from "../../i18n";
import { AvailabilityCard } from "../../components/Charts";
import { useLiveReload } from "../../live";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { ApplicationChannelDto, ApplicationDetail, ApplicationDto, GraphNode, MonitorDto, TenantPermissions } from "@fudo/shared";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { Dialog } from "../../components/Dialog";
import { Field, FormError } from "../../components/Field";
import { CauseNote, StatusPill } from "../../components/Monitoring";
import { Link, navigate } from "../../router";
import { StatusBanner, useAssets } from "../assets/Assets";
import { getChannelType } from "../../defs";

const RULE: Record<string, string> = { all: t("apps.rule.all"), any: t("apps.rule.any"), n_of_m: t("apps.rule.n_of_m") };

export function AppList({ perms }: { perms: TenantPermissions }) {
  const [apps, setApps] = useState<ApplicationDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => api.get<ApplicationDto[]>("/applications").then((a) => { setApps(a); setError(null); }).catch((e) => setError(errorFields(e).message)), []);
  useLiveReload(load, ["status", "monitor", "incident"]);
  const CRIT_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  // default: problems first, then by name
  const byDefault = useMemo(() => [...(apps ?? [])].sort((x, y) => (STATUS_RANK[x.status]! - STATUS_RANK[y.status]!) || x.name.localeCompare(y.name)), [apps]);
  const table = useTable("applications", byDefault, {
    name: { value: (a) => a.name },
    status: { value: (a) => STATUS_RANK[a.status] },
    criticality: { value: (a) => CRIT_RANK[a.criticality] ?? 9 },
    owner: { value: (a) => a.owner },
    sla: { value: (a) => a.slaTarget, desc: true },
  }, { text: (a) => `${a.summary} ${t(`criticality.${a.criticality}`)}` });
  const sorted = table.rows;
  return (
    <>
      <PageHeader help="concepts" title={t("common.applications")}>{apps && apps.length > 0 && <><TableFilter table={table} /><SortSelect table={table} options={[{ key: "name", label: t("common.name") }, { key: "status", label: t("common.status") }, { key: "criticality", label: t("apps.criticality") }, { key: "owner", label: t("apps.owner") }, { key: "sla", label: t("reports.sla") }]} /></>}{perms.manage && <button className="btn btn--primary" onClick={() => setCreating(true)}>{t("apps.new_application")}</button>}</PageHeader>
      <div className="content">
        <FormError message={error} />
        {apps && apps.length === 0 ? (
          <section className="card empty">
            <p>{t("apps.an_application_groups_the_monitors_that")}</p>
            {perms.manage && <button className="btn btn--primary" onClick={() => setCreating(true)}>{t("apps.create_the_first_application")}</button>}
          </section>
        ) : (
          <div className="app-grid">
            {sorted.map((a) => (
              <Link key={a.id} href={`/applications/${a.id}`} className={`card app-card app-card--${a.status}`}>
                <div className="app-card__head"><span className="app-card__name">{a.name}</span><StatusPill status={a.status} /></div>
                <CauseNote status={a.status} cause={a.cause} atRisk={a.atRisk} />
                <span className="muted small">{a.summary || t("apps.no_members_yet")}</span>
                <span className="small"><span className={`crit crit--${a.criticality}`}>{t(`criticality.${a.criticality}`)}</span>{a.owner && <span className="muted"> · {a.owner}</span>}<span className="muted">{" "}{t("apps.sla")}{" "}{a.slaTarget}%</span></span>
              </Link>
            ))}
            {table.filtering && sorted.length === 0 && <p className="muted">{t("table.no_match", { q: table.q.trim() })}{" "}<button type="button" className="btn btn--link small" onClick={() => table.setQ("")}>{t("table.clear")}</button></p>}
          </div>
        )}
      </div>
      <Dialog title={t("apps.new_application")} open={creating} onClose={() => setCreating(false)}>{creating && <AppForm onSaved={(id) => { setCreating(false); navigate(`/applications/${id}`); }} />}</Dialog>
    </>
  );
}

function AppForm({ app, onSaved }: { app?: ApplicationDto; onSaved: (id: string) => void }) {
  const [form, setForm] = useState({ name: app?.name ?? "", description: app?.description ?? "", owner: app?.owner ?? "", criticality: app?.criticality ?? "medium", aggregation: app?.aggregation ?? "all", minUp: String(app?.minUp ?? 1), slaTarget: String(app?.slaTarget ?? 99.9) });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setFields({}); setMessage(null);
    const body = { ...form, minUp: Number(form.minUp), slaTarget: Number(form.slaTarget) };
    try {
      if (app) { await api.put(`/applications/${app.id}`, body); onSaved(app.id); }
      else onSaved((await api.post<{ id: string }>("/applications", body)).id);
    } catch (err) { const r = errorFields(err); setFields(r.fields); setMessage(Object.keys(r.fields).length ? null : r.message); } finally { setBusy(false); }
  }
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <Field label={t("common.name")} value={form.name} onChange={set("name")} error={fields.name} placeholder={t("apps.erp_production")} />
      <div className="grid-2">
        <Field label={t("apps.owner")} value={form.owner} onChange={set("owner")} placeholder={t("apps.team_or_person")} />
        <label className="field">{t("apps.criticality")}<select value={form.criticality} onChange={set("criticality")}>{["low", "medium", "high", "critical"].map((c) => <option key={c} value={c}>{t(`criticality.${c}`)}</option>)}</select></label>
        <label className="field">{t("apps.healthy_when")}<select value={form.aggregation} onChange={set("aggregation")}>{Object.entries(RULE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {form.aggregation === "n_of_m" ? <Field label={t("apps.n_members_that_must_be_up")} type="number" value={form.minUp} onChange={set("minUp")} error={fields.minUp} /> : <span />}
        <Field label={t("apps.sla_target")} type="number" step="0.01" value={form.slaTarget} onChange={set("slaTarget")} error={fields.slaTarget} />
      </div>
      <Field label={t("common.description")} value={form.description} onChange={set("description")} />
      <div className="row-actions row-actions--end"><button className="btn btn--primary" disabled={busy}>{busy ? t("common.saving") : app ? t("common.save_changes") : t("apps.create_application")}</button></div>
    </form>
  );
}

export function AppDetailPage({ id, perms }: { id: string; perms: TenantPermissions }) {
  const [a, setA] = useState<ApplicationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const { assets } = useAssets();
  const [dep, setDep] = useState("");
  const load = useCallback(() => api.get<ApplicationDetail>(`/applications/${id}`).then((d) => { setA(d); setError(null); }).catch((e) => setError(errorFields(e).message)), [id]);
  useLiveReload(load, ["status", "monitor", "incident"]);
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); } catch (e) { setError(errorFields(e).message); } };
  if (!a) return <><PageHeader title={t("common.application")} /><div className="content">{error ? <FormError message={error} /> : <p className="muted">{t("common.loading")}</p>}</div></>;

  const saveMembers = (members: Array<{ monitorId: string; required: boolean }>) => act(() => api.put(`/applications/${a.id}/members`, { members }));
  const current = a.members.map((m) => ({ monitorId: m.monitorId, required: m.required }));

  return (
    <>
      <PageHeader help="concepts" title={a.name}>
        {perms.manage && <button className="btn" onClick={() => setEditing(true)}>{t("common.edit")}</button>}
        {perms.manage && <button className="btn btn--danger" onClick={() => { if (confirm(t("apps.delete_application_name_its_monitors_are", { name: a.name }))) void act(async () => { await api.del(`/applications/${a.id}`); navigate("/applications"); }); }}>{t("common.delete")}</button>}
      </PageHeader>
      <div className="content">
        <FormError message={error} />
        <StatusBanner status={a.status} cause={a.cause} atRisk={a.atRisk} what={t("apps.this_application")} />
        <section className="card detail-head">
          <div className="detail-head__main"><StatusPill status={a.status} /><span className={`crit crit--${a.criticality}`}>{t(`criticality.${a.criticality}`)}</span>{a.owner && <span className="muted small">{t("apps.owner_2")}{" "}{a.owner}</span>}<span className="muted small">{t("apps.sla_target_2")}{" "}{a.slaTarget}%</span></div>
          <p className="muted small">{tmsg(a.summaryParts, a.summary)} · {RULE[a.aggregation]}{a.aggregation === "n_of_m" && ` (N = ${a.minUp})`}{a.statusChangedAt && t("common.status_since_p0", { p0: new Date(a.statusChangedAt).toLocaleString(uiLocale()) })}</p>
          {a.description && <p className="small">{a.description}</p>}
        </section>

        <AvailabilityCard path={`/applications/${a.id}`} />
        <AppNotifications appId={a.id} canManage={perms.manage} />
        <OwnerCard type="application" id={a.id} canManage={perms.manage} />

        <section className="card">
          <div className="card-head"><h2>{t("apps.dependency_path")}</h2><span className="muted small">{t("apps.application_checks_infrastructure")}</span></div>
          <DependencyGraph nodes={a.graph.nodes} />
        </section>

        <div className="two-col">
          <section className="card">
            <div className="card-head"><h2>{t("common.members")}</h2>{perms.manage && <button className="btn btn--small" onClick={() => setPicking(true)}>{t("apps.add_monitors")}</button>}</div>
            {a.members.length === 0 ? <p className="muted small">{t("apps.no_monitors_yet_add_the_checks_that_tell")}</p> : (
              <table className="table table--dense"><tbody>
                {a.members.map((m) => (
                  <tr key={m.monitorId}>
                    <td><StatusPill status={m.effectiveStatus} /></td>
                    <td><Link href={`/monitors/${m.monitorId}`}>{m.name}</Link>{m.scope === "global" && <span className="scope-badge">{t("common.global")}</span>}<div><CauseNote status={m.effectiveStatus} cause={m.cause} atRisk={null} /></div></td>
                    <td>{perms.manage ? (
                      <label className="check small"><input type="checkbox" checked={m.required} onChange={(e) => saveMembers(current.map((x) => (x.monitorId === m.monitorId ? { ...x, required: e.target.checked } : x)))} />{t("apps.required")}</label>
                    ) : <span className="muted small">{m.required ? t("apps.required") : t("apps.optional")}</span>}</td>
                    <td className="actions">{perms.manage && <button className="btn btn--small" onClick={() => saveMembers(current.filter((x) => x.monitorId !== m.monitorId))}>{t("common.remove")}</button>}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </section>
          <section className="card">
            <div className="card-head"><h2>{t("apps.depends_on_infrastructure")}</h2></div>
            {a.dependsOn.length === 0 ? <p className="muted small">{t("apps.direct_infrastructure_this_application")}</p> : (
              <div className="list-rows">{a.dependsOn.map((d) => (
                <div key={d.edgeId} className="list-row"><StatusPill status={d.status} /><Link href={`/assets/${d.id}`}>{d.name}</Link>
                  {perms.manage ? <button className="btn btn--small" onClick={() => act(() => api.del(`/dependencies/${d.edgeId}`))}>{t("common.remove")}</button> : <span />}</div>
              ))}</div>
            )}
            {perms.manage && (
              <div className="add-row">
                <select value={dep} onChange={(e) => setDep(e.target.value)} aria-label={t("common.asset")}><option value="">{t("common.choose_an_asset")}</option>{(assets ?? []).filter((x) => !a.dependsOn.some((d) => d.id === x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}{x.scope === "global" ? t("common.global_2") : ""}</option>)}</select>
                <button className="btn" disabled={!dep} onClick={() => act(async () => { await api.post("/dependencies", { fromType: "application", fromId: a.id, toAssetId: dep }); setDep(""); })}>{t("common.add_dependency")}</button>
              </div>
            )}
          </section>
        </div>

        <section className="card card--flush">
          <div className="card-head card-head--pad"><h2>{t("apps.status_history")}</h2></div>
          {a.events.length === 0 ? <p className="muted pad">{t("common.no_changes_yet")}</p> : (
            <table className="table table--dense"><tbody>
              {a.events.map((e, i) => <tr key={i}><td className="nowrap muted small">{new Date(e.ts).toLocaleString(uiLocale())}</td><td className="nowrap"><StatusPill status={e.from} /> <span className="flip-rtl">→</span> <StatusPill status={e.to} /></td><td className="small">{tmsg(e.messageParts, e.message)}</td></tr>)}
            </tbody></table>
          )}
        </section>
      </div>
      <Dialog title={t("apps.edit_application")} open={editing} onClose={() => setEditing(false)}>{editing && <AppForm app={a} onSaved={() => { setEditing(false); void load(); }} />}</Dialog>
      <Dialog wide title={t("apps.add_monitors")} open={picking} onClose={() => setPicking(false)}>{picking && <MemberPicker existing={current} onSave={async (m) => { await saveMembers(m); setPicking(false); }} />}</Dialog>
    </>
  );
}

function MemberPicker({ existing, onSave }: { existing: Array<{ monitorId: string; required: boolean }>; onSave: (m: Array<{ monitorId: string; required: boolean }>) => void }) {
  const [monitors, setMonitors] = useState<MonitorDto[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  useEffect(() => { api.get<MonitorDto[]>("/monitors?include=global").then(setMonitors).catch(() => setMonitors([])); }, []);
  const avail = (monitors ?? []).filter((m) => !existing.some((e) => e.monitorId === m.id));
  // every word must match the name, type, asset or a tag; ticked monitors stay ticked while filtering
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = avail.filter((m) => { const hay = `${m.name} ${m.type} ${m.assetName ?? ""} ${m.tags.join(" ")}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
  const groups = useMemo(() => [[t("apps.this_tenant"), shown.filter((m) => m.scope === "tenant")], [t("overview.shared_infrastructure"), shown.filter((m) => m.scope === "global")]] as const, [shown]);
  const toggle = (id: string) => setChosen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="stack">
      <p className="muted small">{t("apps.required_members_decide_the_application_s")}</p>
      <input type="search" className="search" style={{ width: "100%" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("assets.search_monitors")} aria-label={t("assets.search_monitors")} data-autofocus />
      <div className="pick-list">
        {groups.map(([label, list]) => list.length > 0 && (
          <div key={label}><h4>{label}</h4>{list.map((m) => (
            <label key={m.id} className="check small" style={{ padding: "4px 0" }}>
              <input type="checkbox" checked={chosen.has(m.id)} onChange={() => toggle(m.id)} /><StatusPill status={m.effectiveStatus} />{m.name}
              <span className="muted">{m.type}{m.assetName ? ` · ${m.assetName}` : ""}</span>
            </label>
          ))}</div>
        ))}
        {monitors && avail.length === 0 && <p className="muted small">{t("apps.all_available_monitors_are_already_members")}</p>}
        {monitors && avail.length > 0 && shown.length === 0 && <p className="muted small">{t("table.no_match", { q: q.trim() })}</p>}
        {!monitors && <p className="muted small">{t("common.loading")}</p>}
      </div>
      <div className="row-actions row-actions--end"><button className="btn btn--primary" disabled={chosen.size === 0} onClick={() => onSave([...existing, ...[...chosen].map((monitorId) => ({ monitorId, required: true }))])}>{t("apps.add")}{" "}{chosen.size || ""}{" "}{t("apps.as_required")}</button></div>
    </div>
  );
}

/** Columns by distance from the application; each column depends on the next one. */
function DependencyGraph({ nodes }: { nodes: GraphNode[] }) {
  const depths = [...new Set(nodes.map((n) => n.depth))].sort((x, y) => x - y);
  const label = (d: number) => (d === 0 ? t("common.application") : d === 1 ? t("apps.graph.checks") : d === 2 ? t("def.monitor_category.Infrastructure") : t("apps.graph.upstream"));
  if (nodes.length <= 1) return <p className="muted small">{t("apps.add_members_and_dependencies_to_see_the")}</p>;
  return (
    <div className="graph" role="list" aria-label={t("apps.dependency_path")}>
      {depths.map((d, i) => (
        <div key={d} style={{ display: "contents" }}>
          {i > 0 && <div className="graph__arrow" aria-hidden="true"><svg width="28" height="14" viewBox="0 0 28 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 7h24M19 2l6 5-6 5" /></svg></div>}
          <div className="graph__col">
            <span className="graph__label">{label(d)}</span>
            {nodes.filter((n) => n.depth === d).map((n) => (
              <Link key={n.key} role="listitem" href={n.type === "asset" ? `/assets/${n.id}` : n.type === "monitor" ? `/monitors/${n.id}` : `/applications/${n.id}`} className={`gnode gnode--${n.status}`}>
                <span className="gnode__name">{n.name}</span>
                <span className="gnode__meta"><StatusPill status={n.status} />{n.scope === "global" && n.type !== "application" && <span className="scope-badge">{t("common.global")}</span>}{n.status === "IMPACTED" && n.cause ? t("apps.by_name", { name: n.cause.name }) : n.detail}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Where this application's incidents are sent: tenant-wide channels plus the ones linked here. */
function AppNotifications({ appId, canManage }: { appId: string; canManage: boolean }) {
  const [list, setList] = useState<ApplicationChannelDto[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.get<ApplicationChannelDto[]>(`/applications/${appId}/channels`).then((l) => { setList(l); setPicked(l.filter((c) => c.routing === "selected" && c.linked).map((c) => c.id)); }).catch((e) => setError(errorFields(e).message)), [appId]);
  useEffect(() => { void load(); }, [load]);
  if (!list) return null;
  const wide = list.filter((c) => c.routing === "all" && c.enabled);
  const selectable = list.filter((c) => c.routing === "selected");
  const saved = selectable.filter((c) => c.linked).map((c) => c.id).sort().join();
  const dirty = saved !== [...picked].sort().join();
  const reaches = wide.length + selectable.filter((c) => picked.includes(c.id) && c.enabled).length;
  async function save() {
    setError(null); setNotice(null);
    try { await api.put(`/applications/${appId}/channels`, { channelIds: picked }); setNotice(t("apps.notify.saved")); void load(); } catch (e) { setError(errorFields(e).message); }
  }
  const typeLabel = (c: ApplicationChannelDto) => getChannelType(c.type)?.label ?? c.type;
  return (
    <section className="card">
      <div className="card-head"><h2>{t("common.notifications")}</h2><Link href="/notifications">{t("apps.notify.manage")}</Link></div>
      <FormError message={error} />
      {notice && <div className="form-ok" role="status">{notice}</div>}
      {reaches === 0 && <div className="banner banner--risk" style={{ margin: "0 0 12px" }}><span>{t("apps.notify.none")}</span></div>}
      <div className="two-col">
        <div>
          <h3 className="small strong">{t("apps.notify.tenant_wide")}</h3>
          {wide.length === 0 ? <p className="muted small">{t("apps.notify.no_wide")}</p> : (
            <ul className="plain small">{wide.map((c) => <li key={c.id}>{c.name} <span className="muted">· {typeLabel(c)}</span></li>)}</ul>
          )}
        </div>
        <div>
          <h3 className="small strong">{t("apps.notify.selected")}</h3>
          {selectable.length === 0 ? <p className="muted small">{t("apps.notify.no_selected")}</p> : (
            <div className="stack stack--tight">
              {selectable.map((c) => (
                <label key={c.id} className="check small">
                  <input type="checkbox" disabled={!canManage} checked={picked.includes(c.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} />
                  {c.name} <span className="muted">· {typeLabel(c)}{!c.enabled && t("apps.notify.disabled")}</span>
                </label>
              ))}
              {canManage && <div><button className="btn btn--small btn--primary" disabled={!dirty} onClick={() => void save()}>{t("common.save_changes")}</button></div>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
