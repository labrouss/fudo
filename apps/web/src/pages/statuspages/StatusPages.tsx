import { useCallback, useEffect, useState, type FormEvent } from "react";
import { NoMatch, SortTh, TableFilter, useTable } from "../../components/Table";
import type { ApplicationDto, AssetDto, MonitorDto, StatusPageDto, TenantPermissions } from "@fudo/shared";
import { t } from "../../i18n";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { Dialog } from "../../components/Dialog";
import { Field, FormError } from "../../components/Field";
import { Pill } from "../../components/Status";

type ItemType = "application" | "asset" | "monitor";
interface Row { type: ItemType; id: string; label: string; group: string; name: string }
const link = (slug: string) => `${location.origin}/status/${slug}`;
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

export function StatusPagesPage({ perms, isGlobal }: { perms: TenantPermissions; isGlobal: boolean }) {
  const [pages, setPages] = useState<StatusPageDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StatusPageDto | "new" | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const load = useCallback(() => api.get<StatusPageDto[]>("/status-pages").then((p) => { setPages(p); setError(null); }).catch((e) => setError(errorFields(e).message)), []);
  useEffect(() => { void load(); }, [load]);
  const copy = async (slug: string) => { await navigator.clipboard?.writeText(link(slug)).catch(() => {}); setCopied(slug); setTimeout(() => setCopied(null), 2000); };
  const remove = async (p: StatusPageDto) => { if (!confirm(t("status_pages.confirm_delete", { title: p.title }))) return; try { await api.del(`/status-pages/${p.id}`); await load(); } catch (e) { setError(errorFields(e).message); } };

  const table = useTable("status-pages", pages, {
    title: { value: (p) => p.title },
    slug: { value: (p) => p.slug },
    visibility: { value: (p) => p.visibility },
    items: { value: (p) => p.items.length, desc: true },
  }, { text: (p) => p.description });
  return (
    <>
      <PageHeader help="dashboards-and-reports" title={t("common.status_pages")}>{perms.manage && <button className="btn btn--primary" onClick={() => setEditing("new")}>{t("status_pages.new")}</button>}</PageHeader>
      <div className="content">
        <FormError message={error} />
        <div className="list-tools"><p className="muted small" style={{ margin: 0, flex: 1 }}>{t("status_pages.lead")}</p><TableFilter table={table} /></div>
        <section className="card card--flush">
          {pages && pages.length === 0 ? <div className="empty"><p>{t("status_pages.none")}</p></div> : (
            <table className="table">
              <thead><tr><SortTh table={table} col="title">{t("status_pages.title")}</SortTh><SortTh table={table} col="slug">{t("status_pages.address")}</SortTh><SortTh table={table} col="visibility">{t("status_pages.visibility")}</SortTh><SortTh table={table} col="items" className="num">{t("status_pages.items")}</SortTh><th><span className="sr-only">{t("common.actions")}</span></th></tr></thead>
              <tbody>
                {table.rows.map((p) => (
                  <tr key={p.id}>
                    <td><span className="strong">{p.title}</span>{p.description && <div className="muted small">{p.description}</div>}</td>
                    <td className="small"><a href={`/status/${p.slug}`} target="_blank" rel="noreferrer">/status/{p.slug}</a></td>
                    <td><Pill tone={p.visibility === "public" ? "info" : "neutral"}>{p.visibility === "public" ? t("status_pages.public") : t("status_pages.internal")}</Pill></td>
                    <td className="num">{p.items.length}</td>
                    <td className="actions">
                      <button className="btn btn--small" onClick={() => void copy(p.slug)}>{copied === p.slug ? t("status_pages.copied") : t("status_pages.copy_link")}</button>
                      {perms.manage && <><button className="btn btn--small" onClick={() => setEditing(p)}>{t("common.edit")}</button><button className="btn btn--small btn--danger" onClick={() => void remove(p)}>{t("common.delete")}</button></>}
                    </td>
                  </tr>
                ))}
                <NoMatch table={table} colSpan={5} />
              </tbody>
            </table>
          )}
        </section>
      </div>
      <Dialog wide title={editing === "new" ? t("status_pages.new") : t("status_pages.edit")} open={editing !== null} onClose={() => setEditing(null)}>
        {editing && <PageForm page={editing === "new" ? undefined : editing} isGlobal={isGlobal} onSaved={() => { setEditing(null); void load(); }} />}
      </Dialog>
    </>
  );
}

function PageForm({ page: p, isGlobal, onSaved }: { page?: StatusPageDto; isGlobal: boolean; onSaved: () => void }) {
  const [form, setForm] = useState({ title: p?.title ?? "", slug: p?.slug ?? "", description: p?.description ?? "", visibility: p?.visibility ?? "public", showHistory: p?.showHistory ?? true, showIncidents: p?.showIncidents ?? true, showMaintenance: p?.showMaintenance ?? true });
  const [slugTouched, setSlugTouched] = useState(!!p);
  const [items, setItems] = useState<Row[]>(p?.items.map((i) => ({ ...i })) ?? []);
  const [options, setOptions] = useState<Array<{ group: string; type: ItemType; id: string; name: string }>>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [assets, monitors, apps] = await Promise.all([api.get<AssetDto[]>("/assets"), api.get<MonitorDto[]>("/monitors"), isGlobal ? Promise.resolve([] as ApplicationDto[]) : api.get<ApplicationDto[]>("/applications")]);
      // tenant pages may also show shared infrastructure; global pages only shared infrastructure
      const allowed = (scope: string) => !isGlobal || scope === "global";
      setOptions([
        ...apps.map((a) => ({ group: t("common.applications"), type: "application" as const, id: a.id, name: a.name })),
        ...assets.filter((a) => allowed(a.scope)).map((a) => ({ group: t("common.assets"), type: "asset" as const, id: a.id, name: a.scope === "global" && !isGlobal ? `${a.name} (${t("common.global")})` : a.name })),
        ...monitors.filter((m) => allowed(m.scope)).map((m) => ({ group: t("common.monitors"), type: "monitor" as const, id: m.id, name: m.scope === "global" && !isGlobal ? `${m.name} (${t("common.global")})` : m.name })),
      ]);
    })().catch(() => {});
  }, [isGlobal]);

  const chosen = new Set(items.map((i) => `${i.type}:${i.id}`));
  const add = (key: string) => { const o = options.find((x) => `${x.type}:${x.id}` === key); if (o) setItems([...items, { type: o.type, id: o.id, name: o.name, label: o.name.replace(/ \(.+\)$/, ""), group: items[items.length - 1]?.group ?? "" }]); };
  const set = (n: number, patch: Partial<Row>) => setItems(items.map((x, i) => (i === n ? { ...x, ...patch } : x)));
  const move = (n: number, d: -1 | 1) => { const m = n + d; if (m < 0 || m >= items.length) return; const c = [...items]; [c[n], c[m]] = [c[m]!, c[n]!]; setItems(c); };

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setFields({}); setMessage(null);
    const body = { ...form, items: items.map(({ type, id, label, group }) => ({ type, id, label, group })) };
    try { if (p) await api.put(`/status-pages/${p.id}`, body); else await api.post("/status-pages", body); onSaved(); }
    catch (err) { const x = errorFields(err); setFields(x.fields); setMessage(Object.keys(x.fields).length ? (x.fields.items ?? null) : x.message); }
    finally { setBusy(false); }
  }
  const groups = [...new Set(options.map((o) => o.group))];

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <Field label={t("status_pages.title")} value={form.title} error={fields.title} placeholder={t("status_pages.title_placeholder")}
        onChange={(e) => setForm({ ...form, title: e.target.value, slug: slugTouched ? form.slug : slugify(e.target.value) })} />
      <Field label={t("status_pages.address")} value={form.slug} error={fields.slug} hint={link(form.slug || "…")}
        onChange={(e) => { setSlugTouched(true); setForm({ ...form, slug: e.target.value.toLowerCase() }); }} />
      <Field label={t("status_pages.description")} value={form.description} error={fields.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <fieldset className="matrix"><legend>{t("status_pages.visibility")}</legend>
        <label className="check"><input type="radio" checked={form.visibility === "public"} onChange={() => setForm({ ...form, visibility: "public" })} />{t("status_pages.public_hint")}</label>
        <label className="check"><input type="radio" checked={form.visibility === "internal"} onChange={() => setForm({ ...form, visibility: "internal" })} />{t("status_pages.internal_hint")}</label>
      </fieldset>
      <fieldset className="matrix"><legend>{t("status_pages.show")}</legend>
        <label className="check"><input type="checkbox" checked={form.showHistory} onChange={(e) => setForm({ ...form, showHistory: e.target.checked })} />{t("status_pages.show_history")}</label>
        <label className="check"><input type="checkbox" checked={form.showIncidents} onChange={(e) => setForm({ ...form, showIncidents: e.target.checked })} />{t("status_pages.show_incidents")}</label>
        <label className="check"><input type="checkbox" checked={form.showMaintenance} onChange={(e) => setForm({ ...form, showMaintenance: e.target.checked })} />{t("status_pages.show_maintenance")}</label>
      </fieldset>
      <fieldset className="matrix"><legend>{t("status_pages.items_n", { count: items.length })}</legend>
        <p className="field__hint">{t("status_pages.labels_hint")}</p>
        {items.length > 0 && (
          <table className="table sp-edit">
            <thead><tr><th>{t("status_pages.display_name")}</th><th>{t("status_pages.group")}</th><th>{t("status_pages.item")}</th><th><span className="sr-only">{t("common.actions")}</span></th></tr></thead>
            <tbody>
              {items.map((i, n) => (
                <tr key={`${i.type}:${i.id}`}>
                  <td><input className="input" value={i.label} onChange={(e) => set(n, { label: e.target.value })} aria-label={t("status_pages.display_name")} /></td>
                  <td><input className="input" value={i.group} onChange={(e) => set(n, { group: e.target.value })} placeholder={t("status_pages.group_placeholder")} aria-label={t("status_pages.group")} /></td>
                  <td className="small muted">{i.name}</td>
                  <td className="actions">
                    <button type="button" className="btn btn--small" onClick={() => move(n, -1)} disabled={n === 0} aria-label={t("status_pages.move_up")}>↑</button>
                    <button type="button" className="btn btn--small" onClick={() => move(n, 1)} disabled={n === items.length - 1} aria-label={t("status_pages.move_down")}>↓</button>
                    <button type="button" className="btn btn--small btn--danger" onClick={() => setItems(items.filter((_, x) => x !== n))}>{t("status_pages.remove")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <select className="input" value="" onChange={(e) => add(e.target.value)} aria-label={t("status_pages.add_item")}>
          <option value="">{t("status_pages.add_item")}</option>
          {groups.map((g) => <optgroup key={g} label={g}>{options.filter((o) => o.group === g && !chosen.has(`${o.type}:${o.id}`)).map((o) => <option key={o.id} value={`${o.type}:${o.id}`}>{o.name}</option>)}</optgroup>)}
        </select>
      </fieldset>
      <div className="row-actions row-actions--end"><button className="btn btn--primary" disabled={busy}>{busy ? t("common.saving") : p ? t("common.save_changes") : t("status_pages.create")}</button></div>
    </form>
  );
}
