import { t } from "../../i18n";
import { useRef, useState } from "react";
import type { ImportResult, TenantPermissions } from "@fudo/shared";
import { api, errorFields, apiTenant } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { FormError } from "../../components/Field";
import { ImportPlan } from "../../components/ImportPlan";
import { KumaImport } from "./KumaImport";

const EXAMPLE = `# Example: items in the file are created or updated; everything else is left alone.
assets:
  - name: FIN-APPLIANCE-01
    kind: other
    location: DC1 rack 7
    dependsOn: [Core-SW-01]        # shared assets can be referenced by name
monitors:
  - name: ERP web
    type: http
    config: { url: https://erp.corp.local/health, acceptedStatus: 200-299 }
    tags: [prod, erp]
applications:
  - name: ERP Production
    criticality: high
    slaTarget: 99.9
    members: [ERP web]
`;

export function ConfigurationPage({ perms, isGlobal }: { perms: TenantPermissions; isGlobal: boolean }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  if (!perms.manage) return <><PageHeader help="configuration-as-code" title={t("common.configuration")} /><div className="content"><p className="muted">{t("config.tenant_admins_or_infra_admins_in_the")}</p></div></>;

  async function exportYaml() {
    setError(null);
    const res = await fetch("/api/config/export", { headers: { "x-fudo-lang": document.documentElement.lang, "x-fudo-tenant": apiTenant() ?? "" } });
    if (!res.ok) return setError((await res.json().catch(() => ({ message: t("config.export_failed") }))).message);
    const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "fudo.yaml";
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }
  async function run(dryRun: boolean) {
    setBusy(true); setError(null);
    try {
      const r = await api.post<ImportResult>("/config/import", { yaml: text, dryRun });
      setResult(r); setChecked(r.errors.length ? null : text);
    } catch (e) { setError(errorFields(e).message); } finally { setBusy(false); }
  }
  function goToLine(line: number) {
    const el = area.current; if (!el) return;
    const lines = el.value.split("\n");
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    el.focus(); el.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
    el.scrollTop = Math.max(0, (line - 5) * 19);
  }

  return (
    <>
      <PageHeader help="configuration-as-code" title={t("common.configuration")}>
        <button className="btn" onClick={() => void exportYaml()}>{t("config.export_yaml")}</button>
      </PageHeader>
      <div className="content">
        <FormError message={error} />
        <p className="muted small">{t(isGlobal ? "config.intro.global" : "config.intro.tenant")}</p>
        <section className="card">
          <div className="card-head">
            <h2>{t("config.import")}</h2>
            <div className="row-actions">
              <label className="btn">{t("config.open_file")}<input type="file" accept=".yaml,.yml,text/yaml" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); setResult(null); } e.target.value = ""; }} /></label>
              {!text && <button className="btn btn--ghost" onClick={() => setText(EXAMPLE)}>{t("config.insert_example")}</button>}
            </div>
          </div>
          <textarea ref={area} className="yaml" spellCheck={false} aria-label="YAML" value={text} onChange={(e) => { setText(e.target.value); setChecked(null); }} placeholder={t("config.paste_yaml_here_or_open_a_file_exported")} />
          <div className="row-actions" style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy || !text.trim()} onClick={() => void run(true)}>{busy ? t("common.checking") : t("config.preview_changes")}</button>
            <button className="btn btn--primary" disabled={busy || checked !== text || !result || result.errors.length > 0 || result.applied || (result.summary.create + result.summary.update === 0)} onClick={() => void run(false)} title={t("config.preview_first")}>{t("config.apply")}</button>
          </div>
          {result && <div style={{ marginTop: 16 }}><ImportPlan r={result} onLine={goToLine} /></div>}
        </section>
        {perms.manage && <KumaImport />}
      </div>
    </>
  );
}
