import { t, uiLocale } from "../../i18n";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CredentialDto, TenantPermissions } from "@fudo/shared";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { Dialog } from "../../components/Dialog";
import { Field, FormError } from "../../components/Field";
import { Pill } from "../../components/Status";
import { NoMatch, SortTh, TableFilter, time, useTable } from "../../components/Table";
import { useLiveReload } from "../../live";
import { Link, navigate } from "../../router";

export interface RunDto { id: string; source: string; name: string; params: Record<string, unknown>; status: string; total: number; done: number; found: number; error: string | null; startedBy: string | null; createdAt: string; startedAt: string | null; finishedAt: string | null }

const TONE: Record<string, "up" | "down" | "info" | "neutral" | "warn"> = { queued: "neutral", running: "info", done: "up", failed: "down", cancelling: "warn", cancelled: "neutral" };
export const RunStatus = ({ r }: { r: RunDto }) => <Pill tone={TONE[r.status] ?? "neutral"}>{t(`discovery.status.${r.status}`)}</Pill>;
export const runTitle = (r: RunDto) => r.name || String(r.params.targets ?? r.params.host ?? "").split(/[\s,;]+/).slice(0, 3).join(", ");

export function Progress({ r }: { r: RunDto }) {
  const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
  return (
    <div className="disc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="disc-progress__bar"><span style={{ width: `${pct}%` }} /></div>
      <span className="small muted">{t("discovery.progress", { done: r.done, total: r.total, found: r.found })}</span>
    </div>
  );
}

/** Not in the Global scope, or not allowed: say where discovery lives. */
export function DiscoveryGate({ perms, isGlobal }: { perms: TenantPermissions; isGlobal: boolean }) {
  return (
    <>
      <PageHeader help="discovery" title={t("discovery.title")} />
      <div className="content"><section className="card"><p className="lead" style={{ margin: 0 }}>{!isGlobal ? t("discovery.global_only") : !perms.manage ? t("discovery.admins_only") : ""}</p></section></div>
    </>
  );
}

export function DiscoveryPage({ perms, isGlobal }: { perms: TenantPermissions; isGlobal: boolean }) {
  const [runs, setRuns] = useState<RunDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const allowed = isGlobal && perms.manage;
  const load = useCallback(() => (allowed ? api.get<RunDto[]>("/discovery/runs").then(setRuns).catch((e) => setError(errorFields(e).message)) : Promise.resolve()), [allowed]);
  useLiveReload(load, [], runs?.some((r) => r.status === "running" || r.status === "queued") ? 2000 : 30_000);
  const table = useTable("discovery-runs", runs, {
    name: { value: (r) => runTitle(r) },
    status: { value: (r) => r.status },
    found: { value: (r) => r.found, desc: true },
    created: { value: (r) => time(r.createdAt), desc: true },
  }, { initial: { key: "created", dir: "desc" }, text: (r) => `${String(r.params.targets ?? "")} ${r.startedBy ?? ""}` });
  if (!allowed) return <DiscoveryGate perms={perms} isGlobal={isGlobal} />;

  return (
    <>
      <PageHeader help="discovery" title={t("discovery.title")}><button className="btn btn--primary" onClick={() => setCreating(true)}>{t("discovery.new")}</button></PageHeader>
      <div className="content">
        <FormError message={error} />
        <div className="list-tools"><p className="muted small" style={{ margin: 0, flex: 1 }}>{t("discovery.lead")}</p><TableFilter table={table} /></div>
        <section className="card card--flush">
          {runs && runs.length === 0 ? <div className="empty"><p>{t("discovery.none")}</p></div> : (
            <table className="table">
              <thead><tr>
                <SortTh table={table} col="name">{t("discovery.what")}</SortTh>
                <SortTh table={table} col="status">{t("common.status")}</SortTh>
                <SortTh table={table} col="found">{t("discovery.found")}</SortTh>
                <SortTh table={table} col="created">{t("discovery.started")}</SortTh>
                <th><span className="sr-only">{t("common.actions")}</span></th>
              </tr></thead>
              <tbody>{table.rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/discovery/${r.id}`} className="strong">{runTitle(r)}</Link><div className="small muted">{t(`discovery.source.${r.source}`)}</div></td>
                  <td><RunStatus r={r} />{(r.status === "running" || r.status === "cancelling") && <Progress r={r} />}{r.error && <div className="small field__error">{r.error}</div>}</td>
                  <td className="num">{r.found}</td>
                  <td className="small">{new Date(r.createdAt).toLocaleString(uiLocale())}{r.startedBy && <div className="muted">{r.startedBy}</div>}</td>
                  <td className="actions">
                    {(r.status === "running" || r.status === "queued") ? <button className="btn btn--small" onClick={() => void api.post(`/discovery/runs/${r.id}/cancel`).then(load)}>{t("discovery.stop")}</button>
                      : <button className="btn btn--small btn--danger" onClick={() => { if (confirm(t("discovery.delete_confirm"))) void api.del(`/discovery/runs/${r.id}`).then(load); }}>{t("common.delete")}</button>}
                  </td>
                </tr>
              ))}<NoMatch table={table} colSpan={5} /></tbody>
            </table>
          )}
        </section>
      </div>
      <Dialog title={t("discovery.new")} open={creating} onClose={() => setCreating(false)}>
        {creating && <NewRunForm onStarted={(id) => { setCreating(false); navigate(`/discovery/${id}`); }} />}
      </Dialog>
    </>
  );
}

const SOURCES = ["subnet", "vcenter", "lldp", "oneview"] as const;
type SourceId = (typeof SOURCES)[number];

function NewRunForm({ onStarted }: { onStarted: (id: string) => void }) {
  const [source, setSource] = useState<SourceId>("subnet");
  const [f, setF] = useState({ name: "", targets: "", host: "", timeoutMs: "1000", domain: "", includeVms: true, poweredOffVms: false });
  const [creds, setCreds] = useState<CredentialDto[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [account, setAccount] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get<CredentialDto[]>("/credentials").then(setCreds).catch(() => {}); }, []);
  const snmpCreds = creds.filter((c) => c.kind === "snmp-community" || c.kind === "snmpv3");
  const accounts = creds.filter((c) => c.kind === "password");
  const usesSnmp = source === "subnet" || source === "lldp";
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setFields({}); setMessage(null);
    const body = source === "subnet" ? { source, name: f.name, targets: f.targets, credentialIds: chosen, timeoutMs: Number(f.timeoutMs) }
      : source === "lldp" ? { source, name: f.name, targets: f.targets, credentialIds: chosen }
      : source === "vcenter" ? { source, name: f.name, host: f.host, credentialId: account || undefined, includeVms: f.includeVms, poweredOffVms: f.poweredOffVms }
      : { source, name: f.name, host: f.host, credentialId: account || undefined, domain: f.domain };
    try {
      const r = await api.post<{ id: string }>("/discovery/runs", body);
      onStarted(r.id);
    } catch (err) { const x = errorFields(err); setFields(x.fields); setMessage(Object.keys(x.fields).length ? null : x.message); } finally { setBusy(false); }
  }
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <fieldset className="disc-sources"><legend>{t("discovery.source_label")}</legend>
        {SOURCES.map((x) => (
          <label key={x} className={source === x ? "disc-source disc-source--on" : "disc-source"}>
            <input type="radio" name="disc-source" checked={source === x} onChange={() => { setSource(x); setFields({}); }} />
            <span><span className="strong">{t(`discovery.source.${x}`)}</span><span className="small muted">{t(`discovery.source_hint.${x}`)}</span></span>
          </label>
        ))}
      </fieldset>
      {usesSnmp ? (
        <label className="field">{source === "lldp" ? t("discovery.switches") : t("discovery.targets")}
          <textarea rows={4} className="mono" value={f.targets} onChange={(e) => setF({ ...f, targets: e.target.value })} placeholder={source === "lldp" ? "core-sw-01.corp.local\n10.0.12.2-10.0.12.20" : "10.0.12.0/24\n10.0.20.10-10.0.20.60\nesx01.corp.local"} aria-invalid={fields.targets ? true : undefined} />
          {fields.targets ? <span className="field__error">{fields.targets}</span> : <span className="field__hint">{source === "lldp" ? t("discovery.switches_hint") : t("discovery.targets_hint")}</span>}
        </label>
      ) : (
        <Field label={source === "vcenter" ? t("discovery.vcenter_host") : t("discovery.oneview_host")} value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} error={fields.host} placeholder={source === "vcenter" ? "vcenter.corp.local" : "oneview.corp.local"} />
      )}
      {usesSnmp ? (
        <fieldset className="matrix"><legend>{source === "lldp" ? t("discovery.snmp_creds_required") : t("discovery.snmp_creds")}</legend>
          {snmpCreds.length === 0 ? <p className="muted small" style={{ margin: 0 }}>{source === "lldp" ? t("discovery.no_snmp_creds_lldp") : t("discovery.no_snmp_creds")} <Link href="/credentials">{t("credentials.title")}</Link></p>
            : snmpCreds.map((c) => <label key={c.id} className="check small" style={{ padding: "4px 0" }}><input type="checkbox" checked={chosen.includes(c.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, c.id] : chosen.filter((x) => x !== c.id))} />{c.name}{c.account ? ` (${c.account})` : ""}</label>)}
          {fields.credentialIds && <span className="field__error">{fields.credentialIds}</span>}
        </fieldset>
      ) : (
        <label className="field">{t("discovery.account")}
          <select value={account} onChange={(e) => setAccount(e.target.value)} aria-invalid={fields.credentialId ? true : undefined}>
            <option value="">{t("credentials.choose")}</option>
            {accounts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.account ? ` (${c.account})` : ""}</option>)}
          </select>
          {fields.credentialId ? <span className="field__error">{fields.credentialId}</span> : <span className="field__hint">{accounts.length ? t("discovery.account_hint") : t("discovery.no_accounts")} {!accounts.length && <Link href="/credentials">{t("credentials.title")}</Link>}</span>}
        </label>
      )}
      {source === "subnet" && (
        <label className="field">{t("discovery.speed")}
          <select value={f.timeoutMs} onChange={(e) => setF({ ...f, timeoutMs: e.target.value })}>
            <option value="500">{t("discovery.speed_fast")}</option><option value="1000">{t("discovery.speed_normal")}</option><option value="2500">{t("discovery.speed_patient")}</option>
          </select>
        </label>
      )}
      {source === "vcenter" && (
        <div className="stack" style={{ gap: 4 }}>
          <label className="check small"><input type="checkbox" checked={f.includeVms} onChange={(e) => setF({ ...f, includeVms: e.target.checked })} />{t("discovery.include_vms")}</label>
          {f.includeVms && <label className="check small"><input type="checkbox" checked={f.poweredOffVms} onChange={(e) => setF({ ...f, poweredOffVms: e.target.checked })} />{t("discovery.powered_off_vms")}</label>}
        </div>
      )}
      {source === "oneview" && <Field label={t("discovery.domain")} value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} placeholder="LOCAL" hint={t("discovery.domain_hint")} />}
      <Field label={t("discovery.name")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t("discovery.name_placeholder")} />
      <p className="muted small" style={{ margin: 0 }}>{t(`discovery.what_it_does.${source}`)}</p>
      <div className="row-actions row-actions--end"><button className="btn btn--primary" disabled={busy}>{t("discovery.start")}</button></div>
    </form>
  );
}
