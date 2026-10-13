import { t } from "../../i18n";
import { useEffect, useMemo, useState } from "react";
import { type ApplicationDetail, type ApplicationDto, type AssetDto, type CredentialDto, type ImportResult } from "@fudo/shared";
import { credentialHiddenKeys, credentialKindsFor } from "@fudo/monitors/credentials";
import { SINGLE_TYPES, parseBulk } from "@fudo/monitors/templates";
import { ASSET_KIND_LABELS, MONITOR_TEMPLATES, getMonitorType } from "../../defs";
import { api, errorFields } from "../../api";
import { FormError } from "../../components/Field";
import { ImportPlan } from "../../components/ImportPlan";

const singleLabel = (k: string) => getMonitorType(k)?.label ?? k;

/** Bulk add (F-206): one line per host or URL, a template or a single check type, previewed through the import engine. */
export function BulkAdd({ isGlobal, onDone, initial }: { isGlobal: boolean; onDone: () => void; initial?: string }) {
  const [what, setWhat] = useState(initial ?? "t:windows-server");
  const [text, setText] = useState("");
  const [asset, setAsset] = useState({ create: !initial, kind: "server" });
  const [tags, setTags] = useState("");
  const [shared, setShared] = useState<Record<string, string>>({});
  const [creds, setCreds] = useState<CredentialDto[]>([]);
  const [credName, setCredName] = useState("");
  const [appId, setAppId] = useState("");
  const [dependsOn, setDependsOn] = useState("");
  const [apps, setApps] = useState<ApplicationDto[]>([]);
  const [assets, setAssets] = useState<AssetDto[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<AssetDto[]>("/assets").then(setAssets).catch(() => {});
    api.get<CredentialDto[]>("/credentials").then(setCreds).catch(() => {});
    if (!isGlobal) api.get<ApplicationDto[]>("/applications").then(setApps).catch(() => {});
  }, [isGlobal]);
  const template = what.startsWith("t:") ? MONITOR_TEMPLATES.find((item) => item.id === what.slice(2))! : null;
  const single = what.startsWith("s:") ? what.slice(2) : null;
  const input = template?.input ?? SINGLE_TYPES[single!]!.input;
  useEffect(() => { if (template) setAsset((a) => ({ ...a, kind: template.assetKind })); setResult(null); }, [what]); // eslint-disable-line react-hooks/exhaustive-deps
  // a single check type that can use a shared credential: the account comes from it instead of the fields below
  const usable = single ? creds.filter((c) => credentialKindsFor(single).includes(c.kind as never)) : [];
  const cred = usable.find((c) => c.name === credName);
  const credKeys = new Set(cred && single ? credentialHiddenKeys(single, cred.kind) : []);
  const parsed = useMemo(() => parseBulk(text, input), [text, input]);

  async function buildDoc() {
    const tagList = tags.split(",").map((item) => item.trim()).filter(Boolean);
    const monitors: Array<Record<string, unknown>> = [];
    const assetsOut: Array<Record<string, unknown>> = [];
    for (const l of parsed.lines) {
      const built = template ? template.build(l) : [SINGLE_TYPES[single!]!.build(l, shared)];
      if (cred) for (const m of built) { m.config = Object.fromEntries(Object.entries(m.config).filter(([k]) => !credKeys.has(k))); m.credential = cred.name; }
      if (asset.create) assetsOut.push({ name: l.name, kind: asset.kind, address: l.host, tags: tagList, ...(dependsOn ? { dependsOn: [dependsOn] } : {}) });
      for (const m of built) monitors.push({ ...m, tags: tagList, ...(asset.create ? { asset: l.name } : {}), ...(!asset.create && dependsOn ? { dependsOn: [dependsOn] } : {}) });
    }
    const doc: Record<string, unknown> = { assets: assetsOut, monitors };
    if (appId) {
      // the application entry is authoritative for its members: keep the current ones and add the new checks
      const a = await api.get<ApplicationDetail>(`/applications/${appId}`);
      doc.applications = [{
        name: a.name, description: a.description, owner: a.owner, criticality: a.criticality, aggregation: a.aggregation, minUp: a.minUp, slaTarget: a.slaTarget,
        dependsOn: a.dependsOn.map((d) => d.name),
        members: [...a.members.map((m) => ({ monitor: m.name, required: m.required })), ...monitors.map((m) => ({ monitor: m.name as string, required: true }))],
      }];
    }
    return doc;
  }
  async function run(dryRun: boolean) {
    setBusy(true); setError(null);
    try {
      const r = await api.post<ImportResult>("/config/import", { doc: await buildDoc(), dryRun });
      setResult(r);
      if (r.applied) setTimeout(onDone, 1200);
    } catch (e) { setError(errorFields(e).message); } finally { setBusy(false); }
  }
  const perLine = template ? template.build({ name: "x", host: "x.local", url: "https://x.local/" }).length : 1;

  return (
    <div className="stack">
      <FormError message={error} />
      <div className="grid-2">
        <label className="field">{t("monitors.create_for_each_line")}
          <select value={what} onChange={(e) => setWhat(e.target.value)}>
            <optgroup label={t("monitors.templates")}>{MONITOR_TEMPLATES.map((item) => <option key={item.id} value={`t:${item.id}`}>{item.label}</option>)}</optgroup>
            <optgroup label={t("monitors.single_check")}>{Object.keys(SINGLE_TYPES).map((k) => <option key={k} value={`s:${k}`}>{singleLabel(k)}</option>)}</optgroup>
          </select>
          <span className="field__hint">{template ? template.description : t("monitors.one_p0_check_per_line", { p0: singleLabel(single!) })}</span>
        </label>
        <label className="field">{t("common.tags")}<input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("monitors.prod_dc1")} /><span className="field__hint">{t("monitors.comma_separated_added_to_every_check")}</span></label>
      </div>
      {single && SINGLE_TYPES[single]!.shared && (
        <fieldset className="matrix"><legend>{t("monitors.bulk.shared")}</legend>
          <div className="grid-2">
            {usable.length > 0 && (
              <label className="field">{t("credentials.account_for_check")}
                <select value={credName} onChange={(e) => setCredName(e.target.value)}>
                  <option value="">{t("credentials.enter_here")}</option>
                  {usable.map((c) => <option key={c.id} value={c.name}>{t("credentials.shared_option", { name: c.name })}</option>)}
                </select>
              </label>
            )}
            {SINGLE_TYPES[single]!.shared!.filter((f) => !credKeys.has(f.key)).map((f) => (
              <label key={f.key} className="field">{t(`def.monitor.${single}.field.${f.key}.label`)}
                <input type={f.kind === "secret" ? "password" : f.kind === "number" ? "number" : "text"} autoComplete="off" value={shared[f.key] ?? f.default ?? ""}
                  onChange={(e) => setShared({ ...shared, [f.key]: e.target.value })} />
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="field">{t(input === "url" ? "monitors.bulk.urls_per_line" : "monitors.bulk.hosts_per_line")}
        <textarea className="yaml yaml--short" spellCheck={false} value={text} onChange={(e) => { setText(e.target.value); setResult(null); }}
          placeholder={input === "url" ? "https://erp.corp.local/health\nPayroll, https://payroll.corp.local/" : t("monitors.srv_app_01_corp_local_sql_prod_02_10_20_4")} />
        <span className="field__hint">{t(input === "url" ? "monitors.bulk.format_url" : "monitors.bulk.format_host")}{" "}<label className="btn btn--link small">{t("monitors.load_csv")}<input type="file" accept=".csv,.txt" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ""; }} /></label></span>
      </label>
      <div className="grid-2">
        <div className="field">
          <label className="check"><input type="checkbox" checked={asset.create} onChange={(e) => setAsset({ ...asset, create: e.target.checked })} />{t("monitors.create_an_asset_for_each_line")}</label>
          {asset.create && <select value={asset.kind} aria-label={t("monitors.asset_kind")} onChange={(e) => setAsset({ ...asset, kind: e.target.value })}>{Object.entries(ASSET_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
        </div>
        <label className="field">{t("monitors.depends_on_optional")}
          <select value={dependsOn} onChange={(e) => setDependsOn(e.target.value)}><option value="">{t("monitors.nothing")}</option>{assets.map((a) => <option key={a.id} value={a.name}>{a.name}{a.scope === "global" && !isGlobal ? t("common.global_2") : ""}</option>)}</select>
          <span className="field__hint">{t("monitors.e_g_the_switch_or_cluster_these_hosts_rely")}</span>
        </label>
        {!isGlobal && (
          <label className="field">{t("monitors.add_to_application_optional")}
            <select value={appId} onChange={(e) => setAppId(e.target.value)}><option value="">{t("monitors.none")}</option>{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </label>
        )}
      </div>
      <p className="small">
        <strong>{t("monitors.bulk.counts", { lines: parsed.lines.length, checks: parsed.lines.length * perLine })}</strong>{asset.create && ` ${t("monitors.bulk.assets", { count: parsed.lines.length })}`}
        {parsed.errors.length > 0 && <span className="field__error"> · {parsed.errors.map((e) => `line ${e.line}: ${e.message}`).join("; ")}</span>}
      </p>
      {result && <ImportPlan r={result} />}
      <div className="row-actions row-actions--end">
        <button className="btn" disabled={busy || !parsed.lines.length || parsed.errors.length > 0} onClick={() => void run(true)}>{t("monitors.preview")}</button>
        <button className="btn btn--primary" disabled={busy || !result || result.dryRun === false || result.errors.length > 0} onClick={() => void run(false)}>{busy ? t("monitors.working") : result && !result.errors.length ? t(result.summary.update ? "monitors.bulk.create_update" : "monitors.bulk.create", { create: result.summary.create, update: result.summary.update }) : t("monitors.create")}</button>
      </div>
    </div>
  );
}
