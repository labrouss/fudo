import { t, uiLocale } from "../../i18n";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CredentialDto, CredentialSuggestion, MonitorDto, TenantPermissions } from "@fudo/shared";
import { SECRET_PLACEHOLDER, fieldVisible } from "@fudo/monitors/definitions";
import { canUseCredential } from "@fudo/monitors/credentials";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { Dialog } from "../../components/Dialog";
import { Field, FormError } from "../../components/Field";
import { NoMatch, SortTh, TableFilter, time, useTable } from "../../components/Table";
import { CREDENTIAL_KINDS, getCredentialKindDef, getMonitorType } from "../../defs";
import { Link } from "../../router";
import { DynamicField } from "../monitors/MonitorForm";

const kindLabel = (k: string) => getCredentialKindDef(k)?.label ?? k;
const typeLabel = (type: string) => getMonitorType(type)?.label ?? type;

/** Shared credentials of the scope: one account (SNMP community, SSH key…) for many monitors. */
export function CredentialsPage({ perms, isGlobal }: { perms: TenantPermissions; isGlobal: boolean }) {
  const [list, setList] = useState<CredentialDto[] | null>(null);
  const [suggestions, setSuggestions] = useState<CredentialSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CredentialDto | "new" | null>(null);
  const [attaching, setAttaching] = useState<CredentialDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([api.get<CredentialDto[]>("/credentials"), api.get<CredentialSuggestion[]>("/credentials/suggestions")]);
      setList(l); setSuggestions(s);
    } catch (e) { setError(errorFields(e).message); }
  }, []);
  useEffect(() => { if (perms.manage) void load(); }, [load, perms.manage]);
  const table = useTable("credentials", list, {
    name: { value: (c) => c.name },
    kind: { value: (c) => kindLabel(c.kind) },
    account: { value: (c) => c.account },
    used: { value: (c) => c.usedBy.length, desc: true },
    updated: { value: (c) => time(c.updatedAt), desc: true },
  }, { text: (c) => `${c.description} ${c.usedBy.map((m) => m.name).join(" ")}` });

  if (!perms.manage) return <><PageHeader help="monitors" title={t("credentials.title")} /><div className="content"><p className="muted">{t("credentials.only_admins")}</p></div></>;

  async function remove(c: CredentialDto) {
    if (!confirm(t("credentials.delete_confirm", { name: c.name }))) return;
    try { await api.del(`/credentials/${c.id}`); void load(); } catch (e) { setError(errorFields(e).message); }
  }

  return (
    <>
      <PageHeader help="monitors" title={t("credentials.title")}><button className="btn btn--primary" onClick={() => setEditing("new")}>{t("credentials.new")}</button></PageHeader>
      <div className="content">
        <FormError message={error} />
        {notice && <div className="invite-result" role="status"><p className="strong" style={{ margin: 0 }}>{notice}</p></div>}
        {suggestions.length > 0 && <Suggestions list={suggestions} onDone={(msg) => { setNotice(msg); void load(); }} />}
        <div className="list-tools"><p className="muted small" style={{ margin: 0, flex: 1 }}>{t("credentials.intro")}</p><TableFilter table={table} /></div>
        <section className="card card--flush">
          {list && list.length === 0 ? <div className="empty"><p>{t("credentials.none_yet")}</p></div> : (
            <table className="table">
              <thead><tr>
                <SortTh table={table} col="name">{t("common.name")}</SortTh>
                <SortTh table={table} col="kind">{t("credentials.kind")}</SortTh>
                <SortTh table={table} col="account">{t("credentials.account")}</SortTh>
                <SortTh table={table} col="used">{t("credentials.used_by")}</SortTh>
                <SortTh table={table} col="updated">{t("credentials.updated")}</SortTh>
                <th><span className="sr-only">{t("common.actions")}</span></th>
              </tr></thead>
              <tbody>{table.rows.map((c) => (
                <tr key={c.id}>
                  <td><span className="strong">{c.name}</span>{c.description && <div className="small muted">{c.description}</div>}</td>
                  <td className="small">{kindLabel(c.kind)}</td>
                  <td className="mono small">{c.account || <span className="muted">—</span>}</td>
                  <td>
                    {c.usedBy.length === 0 ? <span className="muted small">{t("credentials.unused")}</span> : (
                      <div className="chips chips--small">
                        {c.usedBy.slice(0, 6).map((m) => <Link key={m.id} href={`/monitors/${m.id}`} className="chip chip--link" title={typeLabel(m.type)}>{m.name}</Link>)}
                        {c.usedBy.length > 6 && <span className="chip">{t("credentials.n_more", { n: c.usedBy.length - 6 })}</span>}
                      </div>
                    )}
                  </td>
                  <td className="small">{new Date(c.updatedAt).toLocaleString(uiLocale())}{c.updatedBy && <div className="muted">{c.updatedBy}</div>}</td>
                  <td className="actions">
                    <button className="btn btn--small" onClick={() => setAttaching(c)}>{t("credentials.use_for")}</button>
                    <button className="btn btn--small" onClick={() => setEditing(c)}>{t("common.edit")}</button>
                    <button className="btn btn--small btn--danger" disabled={c.usedBy.length > 0} title={c.usedBy.length > 0 ? t("credentials.in_use_cannot_delete") : undefined} onClick={() => void remove(c)}>{t("common.delete")}</button>
                  </td>
                </tr>
              ))}<NoMatch table={table} colSpan={6} /></tbody>
            </table>
          )}
        </section>
      </div>
      <Dialog title={editing === "new" ? t("credentials.new") : t("credentials.edit_name", { name: editing?.name ?? "" })} open={editing !== null} onClose={() => setEditing(null)}>
        {editing !== null && <CredentialForm source={editing === "new" ? null : editing} onSaved={(msg) => { setEditing(null); setNotice(msg); void load(); }} />}
      </Dialog>
      <Dialog title={t("credentials.use_name_for", { name: attaching?.name ?? "" })} open={attaching !== null} onClose={() => setAttaching(null)} wide>
        {attaching && <AttachForm cred={attaching} isGlobal={isGlobal} onDone={(msg) => { setAttaching(null); setNotice(msg); void load(); }} />}
      </Dialog>
    </>
  );
}

/** Monitors that already store the same account and secret: one click turns them into a shared credential. */
function Suggestions({ list, onDone }: { list: CredentialSuggestion[]; onDone: (msg: string) => void }) {
  return (
    <section className="card" aria-labelledby="cred-sugg">
      <h2 id="cred-sugg">{t("credentials.suggest_title")}</h2>
      <p className="muted small">{t("credentials.suggest_lead")}</p>
      <div className="stack">{list.map((g) => <SuggestionRow key={g.monitors.map((m) => m.id).join()} g={g} onDone={onDone} />)}</div>
    </section>
  );
}

function SuggestionRow({ g, onDone }: { g: CredentialSuggestion; onDone: (msg: string) => void }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  async function create(e: FormEvent) {
    e.preventDefault(); setErr(undefined); setBusy(true);
    try {
      const r = await api.post<{ attached: number }>("/credentials/from-monitors", { name, monitorIds: g.monitors.map((m) => m.id) });
      onDone(t("credentials.created_from", { name, n: r.attached }));
    } catch (x) { const f = errorFields(x); setErr(f.fields.name ?? f.message ?? undefined); } finally { setBusy(false); }
  }
  return (
    <form className="suggestion" onSubmit={create} noValidate>
      <p style={{ margin: "0 0 6px" }}>
        <span className="strong">{t("credentials.suggest_row", { n: g.monitors.length, kind: kindLabel(g.kind) })}</span>
        {g.account && <> <span className="mono">{g.account}</span></>}
      </p>
      <div className="chips chips--small">{g.monitors.map((m) => <Link key={m.id} href={`/monitors/${m.id}`} className="chip chip--link" title={typeLabel(m.type)}>{m.name}</Link>)}</div>
      <div className="copy-row" style={{ marginTop: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("credentials.name_placeholder")} aria-label={t("credentials.name_for_new")} aria-invalid={err ? true : undefined} />
        <button className="btn" disabled={busy}>{t("credentials.make_shared")}</button>
      </div>
      {err && <span className="field__error">{err}</span>}
    </form>
  );
}

function CredentialForm({ source, onSaved }: { source: CredentialDto | null; onSaved: (msg: string) => void }) {
  const [name, setName] = useState(source?.name ?? "");
  const [description, setDescription] = useState(source?.description ?? "");
  const [kind, setKind] = useState(source?.kind ?? "password");
  const def = getCredentialKindDef(kind)!;
  const initial = (k: string) => {
    const d = getCredentialKindDef(k)!;
    const v: Record<string, unknown> = {};
    for (const f of d.fields) {
      if (f.kind === "secret") v[f.key] = source?.kind === k && source.secretsSet.includes(f.key) ? SECRET_PLACEHOLDER : "";
      else v[f.key] = source?.kind === k ? source.fields[f.key] ?? "" : f.kind === "select" ? f.options?.[f.options.length - 1]?.value ?? "" : "";
    }
    if (k === "snmpv3" && source?.kind !== k) Object.assign(v, { level: "authPriv", authProtocol: "sha", privProtocol: "aes" });
    return v;
  };
  const [values, setValues] = useState<Record<string, unknown>>(() => initial(kind));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inUse = (source?.usedBy.length ?? 0) > 0;
  const saved = (k: string) => source?.kind === kind && source.secretsSet.includes(k);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setFields({}); setMessage(null);
    const body = { name, kind, description, values };
    try {
      if (source) {
        const r = await api.put<{ monitors: number }>(`/credentials/${source.id}`, body);
        onSaved(r.monitors > 0 ? t("credentials.saved_applies", { name, n: r.monitors }) : t("credentials.saved", { name }));
      } else {
        await api.post("/credentials", body);
        onSaved(t("credentials.saved", { name }));
      }
    } catch (x) {
      const r = errorFields(x);
      setFields(r.fields);
      setMessage(Object.keys(r.fields).length ? t("common.check_the_highlighted_fields") : r.message);
    } finally { setBusy(false); }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <Field label={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} error={fields.name} placeholder={t("credentials.name_placeholder")} />
      <label className="field">{t("credentials.kind")}
        <select value={kind} disabled={inUse} onChange={(e) => { setKind(e.target.value); setValues(initial(e.target.value)); setFields({}); }} aria-invalid={fields.kind ? true : undefined}>
          {CREDENTIAL_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        {fields.kind ? <span className="field__error">{fields.kind}</span> : inUse ? <span className="field__hint">{t("credentials.kind_locked")}</span> : null}
      </label>
      <div className="form-grid">
        {def.fields.filter((f) => fieldVisible(f, values, def.fields)).map((f) => (
          <DynamicField key={`${kind}.${f.key}`} f={f} saved={saved(f.key)} value={values[f.key]} error={fields[`values.${f.key}`]} onChange={(v) => setValues({ ...values, [f.key]: v })} />
        ))}
      </div>
      <Field label={t("common.description")} value={description} onChange={(e) => setDescription(e.target.value)} error={fields.description} placeholder={t("credentials.description_placeholder")} />
      <p className="muted small" style={{ margin: 0 }}>{t("credentials.write_only")}</p>
      <div className="row-actions row-actions--end"><button className="btn btn--primary" disabled={busy}>{busy ? t("common.saving") : source ? t("common.save_changes") : t("credentials.create")}</button></div>
    </form>
  );
}

/** Points monitors of this scope at the credential; their own account and secret are removed. */
function AttachForm({ cred, isGlobal, onDone }: { cred: CredentialDto; isGlobal: boolean; onDone: (msg: string) => void }) {
  const [monitors, setMonitors] = useState<MonitorDto[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get<MonitorDto[]>("/monitors").then((l) => setMonitors(l.filter((m) => m.scope === (isGlobal ? "global" : "tenant")))).catch((e) => setError(errorFields(e).message)); }, [isGlobal]);
  const candidates = (monitors ?? []).filter((m) => canUseCredential(m.type, cred.kind) && m.credentialId !== cred.id);
  const table = useTable("credential-attach", candidates, {
    name: { value: (m) => m.name },
    type: { value: (m) => typeLabel(m.type) },
    current: { value: (m) => m.credentialName ?? "" },
  });
  const toggle = (id: string) => setChosen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = await api.post<{ attached: string[]; skipped: unknown[] }>(`/credentials/${cred.id}/attach`, { monitorIds: [...chosen] });
      onDone(t("credentials.attached", { name: cred.name, n: r.attached.length }));
    } catch (x) { setError(errorFields(x).message); } finally { setBusy(false); }
  }
  if (!monitors) return <p className="muted">{error ?? t("common.loading")}</p>;
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={error} />
      <p className="muted small" style={{ margin: 0 }}>{t("credentials.attach_lead")}</p>
      {candidates.length === 0 ? <p className="muted">{t("credentials.attach_none")}</p> : (
        <>
          <div className="list-tools" style={{ margin: 0 }}><span style={{ flex: 1 }} /><TableFilter table={table} /></div>
          <div className="table-scroll" style={{ maxHeight: 360, overflow: "auto" }}>
            <table className="table">
              <thead><tr>
                <th><input type="checkbox" aria-label={t("credentials.select_all")} checked={table.rows.length > 0 && table.rows.every((m) => chosen.has(m.id))} onChange={(e) => setChosen(e.target.checked ? new Set([...chosen, ...table.rows.map((m) => m.id)]) : new Set([...chosen].filter((id) => !table.rows.some((m) => m.id === id))))} /></th>
                <SortTh table={table} col="name">{t("common.name")}</SortTh>
                <SortTh table={table} col="type">{t("credentials.monitor_type")}</SortTh>
                <SortTh table={table} col="current">{t("credentials.current")}</SortTh>
              </tr></thead>
              <tbody>{table.rows.map((m) => (
                <tr key={m.id} onClick={() => toggle(m.id)} style={{ cursor: "pointer" }}>
                  <td><input type="checkbox" checked={chosen.has(m.id)} onChange={() => toggle(m.id)} onClick={(e) => e.stopPropagation()} aria-label={m.name} /></td>
                  <td className="strong">{m.name}</td>
                  <td className="small">{typeLabel(m.type)}</td>
                  <td className="small">{m.credentialName ?? <span className="muted">{t("credentials.own_account")}</span>}</td>
                </tr>
              ))}<NoMatch table={table} colSpan={4} /></tbody>
            </table>
          </div>
        </>
      )}
      <div className="row-actions row-actions--end"><button className="btn btn--primary" disabled={busy || chosen.size === 0}>{t("credentials.use_for_n", { n: chosen.size })}</button></div>
    </form>
  );
}
