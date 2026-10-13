import { t } from "../../i18n";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AssetDto, CredentialDto, MonitorDetail, TestResultDto } from "@fudo/shared";
import { MONITOR_DEFAULTS, SECRET_PLACEHOLDER, fieldVisible, type FieldDef, type MonitorTypeDef } from "@fudo/monitors/definitions";
import { credentialHiddenKeys, credentialKindsFor, credentialView } from "@fudo/monitors/credentials";
import { MONITOR_TYPES, getCredentialKindDef, getMonitorType } from "../../defs";
import { Link } from "../../router";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { FormError } from "../../components/Field";
import { Dialog } from "../../components/Dialog";
import { InterfaceFinder, ifLabel, type FoundInterface } from "./InterfaceFinder";
import { MonitorStatusPill, formatMs } from "../../components/Monitoring";
import { navigate } from "../../router";

type Common = { assetId: string; name: string; intervalS: number | string; retryIntervalS: number | string; timeoutS: number | string; failuresBeforeDown: number | string; successesBeforeUp: number | string; tags: string; description: string };

/** Add, edit or clone. `source` is the monitor being edited or cloned. */
export function MonitorForm({ source, mode }: { source?: MonitorDetail; mode: "new" | "edit" | "clone" }) {
  // a new monitor can arrive pre-filled: ?type=snmp-trap&config.source=10.0.0.5&name=…
  const qs = useMemo(() => new URLSearchParams(location.search), []);
  const preType = !source && qs.get("type") && getMonitorType(qs.get("type")!) ? qs.get("type")! : null;
  const [type, setType] = useState<string>(source?.type ?? preType ?? "http");
  // a clone must not inherit saved secrets it cannot see: they are entered again
  const [config, setConfig] = useState<Record<string, unknown>>(
    source ? Object.fromEntries(Object.entries(source.config).map(([k, v]) => [k, mode === "clone" && v === SECRET_PLACEHOLDER ? "" : v]))
      : { ...getMonitorType(preType ?? "http")!.defaults, ...Object.fromEntries([...qs].filter(([k]) => k.startsWith("config.")).map(([k, v]) => [k.slice(7), v])) },
  );
  const [assets, setAssets] = useState<AssetDto[]>([]);
  useEffect(() => { api.get<AssetDto[]>("/assets").then(setAssets).catch(() => {}); }, []);
  // shared credentials of this scope (the monitor either has its own account or uses one of these)
  const [creds, setCreds] = useState<CredentialDto[] | null>(null);
  useEffect(() => { api.get<CredentialDto[]>("/credentials").then(setCreds).catch(() => setCreds([])); }, []);
  const [shared, setShared] = useState(Boolean(source?.credentialId));
  const [credentialId, setCredentialId] = useState(source?.credentialId ?? "");
  const [common, setCommon] = useState<Common>(() => ({
    assetId: source?.assetId ?? new URLSearchParams(location.search).get("asset") ?? "",
    name: source ? (mode === "clone" ? `${source.name} (copy)` : source.name) : qs.get("name") ?? "",
    intervalS: source?.intervalS ?? (preType && getMonitorType(preType)!.defaultIntervalS) ?? MONITOR_DEFAULTS.intervalS,
    retryIntervalS: source?.retryIntervalS ?? MONITOR_DEFAULTS.retryIntervalS,
    timeoutS: source?.timeoutS ?? MONITOR_DEFAULTS.timeoutS,
    failuresBeforeDown: source?.failuresBeforeDown ?? (preType && getMonitorType(preType)!.defaultFailuresBeforeDown) ?? MONITOR_DEFAULTS.failuresBeforeDown,
    successesBeforeUp: source?.successesBeforeUp ?? MONITOR_DEFAULTS.successesBeforeUp,
    tags: source?.tags.join(", ") ?? "",
    description: source?.description ?? "",
  }));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{ busy: boolean; result?: TestResultDto; error?: string }>({ busy: false });
  const [finder, setFinder] = useState(false);
  const def = getMonitorType(type)!;

  function chooseType(item: MonitorTypeDef) {
    if (item.id === type) return;
    setType(item.id);
    setConfig({ ...item.defaults, ...pick(config, item) });
    if (mode === "new" && !source) setCommon((c) => ({ ...c, intervalS: item.defaultIntervalS ?? MONITOR_DEFAULTS.intervalS, failuresBeforeDown: item.defaultFailuresBeforeDown ?? MONITOR_DEFAULTS.failuresBeforeDown }));
    setTest({ busy: false });
    setFields({});
    const kinds = credentialKindsFor(item.id);
    if (!kinds.length) setShared(false);
    if (credentialId && !kinds.includes(creds?.find((c) => c.id === credentialId)?.kind as never)) setCredentialId("");
  }

  const kinds = credentialKindsFor(type);
  const usable = (creds ?? []).filter((c) => kinds.includes(c.kind as never));
  const cred = shared ? usable.find((c) => c.id === credentialId) : undefined;
  // fields the credential fills: hidden here and not sent (a chosen credential's, or any it could be)
  const hidden = new Set(shared ? (cred ? credentialHiddenKeys(type, cred.kind) : kinds.flatMap((k) => credentialHiddenKeys(type, k))) : []);
  const view = cred ? credentialView(type, cred.kind, config) : config;
  const ownConfig = () => (shared ? Object.fromEntries(Object.entries(view).filter(([k, v]) => (!hidden.has(k) || k === "version") && v !== undefined)) : config);

  const body = () => ({
    ...common,
    assetId: common.assetId || null,
    type,
    config: ownConfig(),
    credentialId: shared && credentialId ? credentialId : null,
    tags: common.tags.split(",").map((item) => item.trim()).filter(Boolean),
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (shared && !credentialId) { setFields({ credentialId: t("credentials.choose_one") }); setMessage(t("common.check_the_highlighted_fields")); return; }
    setBusy(true);
    setFields({});
    setMessage(null);
    try {
      if (mode === "edit" && source) {
        await api.put(`/monitors/${source.id}`, body());
        navigate(`/monitors/${source.id}`);
      } else {
        const r = await api.post<{ id: string }>("/monitors", body());
        navigate(`/monitors/${r.id}`);
      }
    } catch (err) {
      const r = errorFields(err);
      setFields(r.fields);
      setMessage(Object.keys(r.fields).length ? t("common.check_the_highlighted_fields") : r.message);
      // bring the first invalid field into view (it may be inside the collapsed Advanced section)
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(".monitor-form [aria-invalid='true']");
        el?.closest("details")?.setAttribute("open", "");
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
        el?.focus({ preventScroll: true });
      });
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    setTest({ busy: true });
    try {
      const result = await api.post<TestResultDto>("/monitors/test", { type, config: ownConfig(), ...(shared && credentialId ? { credentialId } : {}), timeoutS: Number(common.timeoutS) || 10, ...(mode === "edit" && source ? { monitorId: source.id } : {}) });
      setTest({ busy: false, result });
    } catch (err) {
      const r = errorFields(err);
      setFields((f) => ({ ...f, ...r.fields }));
      setTest({ busy: false, error: r.message ?? t("monitors.test_failed") });
    }
  }

  /** Find interfaces: one picked fills the field; several (new monitor) become one monitor each. */
  async function pickInterfaces(list: FoundInterface[]) {
    setFinder(false);
    if (list.length === 1) {
      const i = list[0]!;
      setConfig({ ...config, interface: ifLabel(i) });
      if (!common.name.trim()) setCommon({ ...common, name: `${shortHost(String(config.host ?? ""))} ${ifLabel(i)}${i.alias ? ` (${i.alias})` : ""}` });
      return;
    }
    setBusy(true); setMessage(null);
    const prefix = common.name.trim() || shortHost(String(config.host ?? ""));
    const failed: string[] = [];
    for (const i of list) {
      try { await api.post("/monitors", { ...body(), name: `${prefix} ${ifLabel(i)}${i.alias ? ` (${i.alias})` : ""}`, config: { ...ownConfig(), interface: ifLabel(i) } }); }
      catch (err) { failed.push(`${ifLabel(i)}: ${errorFields(err).message ?? ""}`); }
    }
    setBusy(false);
    if (failed.length) setMessage(t("monitors.ifs.some_failed", { list: failed.join("; ") }));
    else navigate("/monitors");
  }

  const categories = useMemo(() => [...new Set(MONITOR_TYPES.map((item) => item.category))], []);
  const visible = def.fields.filter((f) => !hidden.has(f.key) && fieldVisible(f, view, def.fields));
  const basic = visible.filter((f) => !f.advanced);
  const advanced = visible.filter((f) => f.advanced);
  const saved = (k: string) => mode === "edit" && source?.type === type && source.config[k] === SECRET_PLACEHOLDER;
  const setC = (k: keyof Common) => (e: { target: { value: string } }) => setCommon({ ...common, [k]: e.target.value });

  return (
    <>
      <PageHeader help="monitors" title={mode === "edit" ? t("monitors.edit_name", { name: source?.name }) : mode === "clone" ? t("monitors.clone_monitor") : t("common.add_monitor")}>
        <button className="btn" type="button" onClick={() => history.back()}>{t("common.cancel")}</button>
      </PageHeader>
      <form className="monitor-form" onSubmit={submit} noValidate>
        <aside className="card type-picker" aria-label={t("monitors.monitor_type")}>
          <h2>{t("monitors.monitor_type")}</h2>
          {categories.map((c) => (
            <div key={c} className="type-picker__group">
              <span className="type-picker__cat">{c}</span>
              {MONITOR_TYPES.filter((item) => item.category === c).map((item) => (
                <button type="button" key={item.id} className={item.id === type ? "type-btn type-btn--on" : "type-btn"} aria-pressed={item.id === type} onClick={() => chooseType(item)}>
                  <span className="strong">{item.label}</span>
                  <span className="type-btn__desc">{item.description}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>

        <section className="card form-main">
          <FormError message={message} />
          <div className="form-section">
            <h2>{def.label}</h2>
            <div className="form-grid">
              <Input label={t("monitors.friendly_name")} value={common.name} onChange={setC("name")} error={fields.name} span={2} placeholder={t("monitors.e_g_erp_web_front_end")} />
              {kinds.length > 0 && (
                <fieldset className="field field--span2 cred-choice">
                  <legend>{t("credentials.account_for_check")}</legend>
                  <div className="cred-choice__opts">
                    <label className="check"><input type="radio" name="cred-mode" checked={!shared} onChange={() => setShared(false)} />{t("credentials.enter_here")}</label>
                    <label className="check"><input type="radio" name="cred-mode" checked={shared} onChange={() => { setShared(true); if (!credentialId && usable.length === 1) setCredentialId(usable[0]!.id); }} />{t("credentials.use_shared")}</label>
                  </div>
                  {shared && (usable.length === 0 && creds ? (
                    <span className="field__hint">{t("credentials.none_compatible", { kinds: kinds.map((k) => getCredentialKindDef(k)?.label ?? k).join(", ") })} <Link href="/credentials">{t("credentials.title")}</Link></span>
                  ) : (
                    <label className="field">{t("credentials.credential")}
                      <select value={credentialId} onChange={(e) => { setCredentialId(e.target.value); setFields(({ credentialId: _, ...rest }) => rest); }} aria-invalid={fields.credentialId ? true : undefined}>
                        <option value="">{t("credentials.choose")}</option>
                        {usable.map((c) => <option key={c.id} value={c.id}>{c.name}{c.account ? ` (${c.account})` : ""}</option>)}
                      </select>
                      {fields.credentialId ? <span className="field__error">{fields.credentialId}</span> : <span className="field__hint">{t("credentials.form_hint")}</span>}
                    </label>
                  ))}
                  {shared && fields.credentialId && usable.length === 0 && <span className="field__error">{fields.credentialId}</span>}
                </fieldset>
              )}
              {basic.map((f) => <DynamicField key={f.key} f={f} saved={saved(f.key)} value={config[f.key]} error={fields[`config.${f.key}`]} onChange={(v) => setConfig({ ...config, [f.key]: v })} />)}
              {type === "snmp-interface" && (
                <div className="field--span2 finder-row">
                  <button type="button" className="btn" onClick={() => setFinder(true)} disabled={!String(config.host ?? "").trim()}>{t("monitors.ifs.find")}</button>
                  <span className="muted small">{mode === "new" ? t("monitors.ifs.find_hint_new") : t("monitors.ifs.find_hint")}</span>
                </div>
              )}
            </div>
          </div>
          <div className="form-section">
            <h3>{t("monitors.schedule_and_sensitivity")}</h3>
            <div className="form-grid form-grid--4">
              <Input label={t("monitors.check_every_s")} type="number" value={common.intervalS} onChange={setC("intervalS")} error={fields.intervalS} />
              <Input label={t("monitors.timeout_s")} type="number" value={common.timeoutS} onChange={setC("timeoutS")} error={fields.timeoutS} />
              <Input label={t("monitors.down_after_fails")} type="number" value={common.failuresBeforeDown} onChange={setC("failuresBeforeDown")} error={fields.failuresBeforeDown} />
              <Input label={t("monitors.retry_every_s")} type="number" value={common.retryIntervalS} onChange={setC("retryIntervalS")} error={fields.retryIntervalS} hint={t("monitors.while_failing")} />
            </div>
          </div>
          <div className="form-section">
            <h3>{t("monitors.organize")}</h3>
            <div className="form-grid">
              <label className="field">{t("monitors.checks_asset")}
                <select value={common.assetId} onChange={(e) => setCommon({ ...common, assetId: e.target.value })} aria-invalid={fields.assetId ? true : undefined}>
                  <option value="">{t("monitors.none")}</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.name}{a.scope === "global" ? t("common.global_2") : ""}</option>)}
                </select>
                {fields.assetId ? <span className="field__error">{fields.assetId}</span> : <span className="field__hint">{t("monitors.its_result_counts_toward_this_asset_s")}</span>}
              </label>
              <Input label={t("common.tags")} value={common.tags} onChange={setC("tags")} error={fields.tags} placeholder={t("monitors.prod_erp_web")} hint={t("common.comma_separated")} />
              <Input label={t("monitors.up_after_successes")} type="number" value={common.successesBeforeUp} onChange={setC("successesBeforeUp")} error={fields.successesBeforeUp} hint={t("monitors.to_leave_down")} />
              <Input label={t("common.description")} value={common.description} onChange={setC("description")} error={fields.description} span={2} placeholder={t("monitors.optional_notes_for_operators")} />
            </div>
          </div>
          {advanced.length > 0 && (
            <details className="form-section advanced">
              <summary>{t("monitors.advanced")}</summary>
              <div className="form-grid">
                {advanced.map((f) => <DynamicField key={f.key} f={f} saved={saved(f.key)} value={config[f.key]} error={fields[`config.${f.key}`]} onChange={(v) => setConfig({ ...config, [f.key]: v })} />)}
              </div>
            </details>
          )}
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => history.back()}>{t("common.cancel")}</button>
            <button className="btn btn--primary" disabled={busy}>{busy ? t("common.saving") : mode === "edit" ? t("common.save_changes") : t("monitors.save_monitor")}</button>
          </div>
        </section>

        <aside className="card test-panel" aria-live="polite">
          <h2>{t("monitors.test")}</h2>
          {type === "push" ? (
            <p className="muted small">{t("monitors.push_monitors_are_tested_by_calling_their")}</p>
          ) : type === "snmp-trap" ? (
            <p className="muted small">{t("traps.test_hint")}</p>
          ) : (
            <>
              <p className="muted small">{t("monitors.runs_this_check_once_from_the_fudo_server")}</p>
              <button type="button" className="btn" onClick={runTest} disabled={test.busy}>{test.busy ? t("monitors.testing") : t("monitors.test_now")}</button>
              {test.result && (
                <div className="test-result">
                  <div className="test-result__head"><MonitorStatusPill status={test.result.status} /><span className="mono">{formatMs(test.result.latencyMs)}</span></div>
                  <p className="small">{test.result.message}</p>
                </div>
              )}
              {test.error && <p className="field__error">{test.error}</p>}
            </>
          )}
        </aside>
      </form>
      <Dialog wide title={t("monitors.ifs.title", { host: String(config.host ?? "") })} open={finder} onClose={() => setFinder(false)}>
        {finder && <InterfaceFinder multiple={mode === "new"} onPick={(l) => void pickInterfaces(l)}
          request={{ config: ownConfig(), timeoutS: Number(common.timeoutS) || 10, ...(shared && credentialId ? { credentialId } : {}), ...(mode === "edit" && source ? { monitorId: source.id } : {}) }} />}
      </Dialog>
    </>
  );
}

/** A host name without its domain (an IP address stays whole). */
const shortHost = (h: string) => (/^[\d.]+$|:/.test(h) ? h : h.split(".")[0]!);

/** Keep values for fields that exist in both types (e.g. host) when switching type. */
function pick(cfg: Record<string, unknown>, item: MonitorTypeDef) {
  const keep: Record<string, unknown> = {};
  for (const f of item.fields) if (cfg[f.key] !== undefined && cfg[f.key] !== "" && typeof cfg[f.key] === typeof item.defaults[f.key]) keep[f.key] = cfg[f.key];
  if (typeof cfg.host === "string" && cfg.host && item.fields.some((f) => f.key === "host")) keep.host = cfg.host;
  return keep;
}

function Input({ label, error, hint, span, ...rest }: { label: string; error?: string; hint?: string; span?: 1 | 2 } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={span === 2 ? "field field--span2" : "field"}>
      {label}
      <input aria-invalid={error ? true : undefined} {...rest} />
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function DynamicField({ f, value, error, onChange, saved }: { f: FieldDef; value: unknown; error?: string; onChange: (v: unknown) => void; saved: boolean }) {
  const cls = `field${f.span === 2 || f.kind === "textarea" || f.multiline ? " field--span2" : ""}${f.mono ? " field--mono" : ""}`;
  const note = error ? <span className="field__error">{error}</span> : f.hint ? <span className="field__hint">{f.hint}</span> : null;
  if (f.kind === "secret") {
    // saved secrets never reach the browser; empty means "keep the saved value"
    const shown = value === SECRET_PLACEHOLDER ? "" : String(value ?? "");
    const change = (v: string) => onChange(v || (saved ? SECRET_PLACEHOLDER : ""));
    const ph = saved ? t("common.saved_leave_empty_to_keep") : f.placeholder;
    return (
      <label className={cls}>{f.label}
        {f.multiline
          ? <textarea rows={5} className="mono" spellCheck={false} autoComplete="off" placeholder={saved ? t("common.saved_leave_empty_to_keep") : t("monitors.begin_openssh_private_key")} value={shown} aria-invalid={error ? true : undefined} onChange={(e) => change(e.target.value)} />
          : <input type="password" autoComplete="new-password" placeholder={ph} value={shown} aria-invalid={error ? true : undefined} onChange={(e) => change(e.target.value)} />}
        {note}
      </label>
    );
  }
  if (f.kind === "checkbox") {
    return <label className="check field--span2"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />{f.label}</label>;
  }
  if (f.kind === "select") {
    return (
      <label className={cls}>{f.label}
        <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        {note}
      </label>
    );
  }
  if (f.kind === "textarea") {
    return <label className={cls}>{f.label}<textarea rows={4} placeholder={f.placeholder} value={String(value ?? "")} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} />{note}</label>;
  }
  return (
    <label className={cls}>{f.label}
      <input
        type={f.kind === "number" ? "number" : "text"}
        placeholder={f.placeholder}
        value={value === undefined || value === null ? "" : String(value)}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(f.kind === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
      />
      {note}
    </label>
  );
}

/** Loads the source monitor for edit/clone. */
export function MonitorFormLoader({ id, mode }: { id: string; mode: "edit" | "clone" }) {
  const [source, setSource] = useState<MonitorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.get<MonitorDetail>(`/monitors/${id}`).then(setSource).catch((e) => setError(errorFields(e).message)); }, [id]);
  if (error) return <div className="content"><FormError message={error} /></div>;
  if (!source) return <div className="content"><p className="muted">{t("common.loading")}</p></div>;
  return <MonitorForm source={source} mode={mode} />;
}
