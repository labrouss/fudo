import { useRef, useState } from "react";
import type { ImportResult } from "@fudo/shared";
import { t } from "../../i18n";
import { ApiRequestError, apiTenant } from "../../api";
import { FormError } from "../../components/Field";
import { ImportPlan } from "../../components/ImportPlan";

interface Note { name: string; code: string; params?: Record<string, string | number> }
interface KumaResult {
  dryRun: boolean; applied: boolean; plan: Omit<ImportResult, "dryRun" | "applied">;
  channels: Array<{ name: string; type: string; routing: "all" | "applications"; applications: string[]; usedBy: number; isDefault: boolean }>;
  skipped: Note[]; warnings: Note[]; channelErrors: Array<{ name: string; message: string }>;
}
const headers = () => ({ "x-fudo-lang": document.documentElement.lang, "x-fudo-tenant": apiTenant() ?? "" });

/** Configuration › Import from Uptime Kuma: upload, preview, import. */
export function KumaImport() {
  const input = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<{ pct: number } | null>(null);
  const [found, setFound] = useState<{ uploadId: string; source: string; monitors: number; groups: number; notifications: number } | null>(null);
  const [result, setResult] = useState<KumaResult | null>(null);
  const [enable, setEnable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (uploadId: string, dryRun: boolean) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/config/import/kuma/${uploadId}`, { method: "POST", headers: { ...headers(), "content-type": "application/json" }, body: JSON.stringify({ dryRun, channelsEnabled: enable }) });
      const b = await r.json();
      if (!r.ok) throw new ApiRequestError(r.status, b);
      setResult(b);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const send = (file: File) => {
    setFound(null); setResult(null); setError(null); setUpload({ pct: 0 });
    const x = new XMLHttpRequest();
    x.open("PUT", "/api/config/import/kuma/upload");
    x.setRequestHeader("content-type", "application/octet-stream");
    x.setRequestHeader("x-fudo-upload", "1");
    for (const [k, v] of Object.entries(headers())) if (v) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => e.lengthComputable && setUpload({ pct: Math.round((e.loaded / e.total) * 100) });
    x.onload = () => {
      setUpload(null);
      let b: Record<string, unknown> = {};
      try { b = JSON.parse(x.responseText); } catch { /* keep empty */ }
      if (x.status >= 300) { setError(String(b.message ?? x.statusText)); return; }
      setFound(b as typeof found);
      void run(String(b.uploadId), true);
    };
    x.onerror = () => { setUpload(null); setError(t("backups.upload_failed")); };
    x.send(file);
  };
  const note = (kind: "skip" | "warn", n: Note) => t(`kuma.${kind}.${n.code}`, n.params ?? {});

  return (
    <section className="card kuma">
      <h2>{t("kuma.title")}</h2>
      <p className="lead">{t("kuma.lead")}</p>
      <ul className="small muted kuma__how"><li>{t("kuma.how_v1")}</li><li>{t("kuma.how_v2")}</li></ul>
      <div className="row-actions">
        <button className="btn" onClick={() => input.current?.click()} disabled={!!upload || busy}>{t("kuma.choose")}</button>
        <input ref={input} type="file" accept=".json,.db,.sqlite,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) send(f); }} />
      </div>
      {upload && <div className="progress" role="progressbar" aria-valuenow={upload.pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${upload.pct}%` }} /><em>{t("backups.uploading", { pct: upload.pct })}</em></div>}
      <FormError message={error} />
      {found && <p className="small" role="status">{t("kuma.found", { monitors: found.monitors, groups: found.groups, notifications: found.notifications })}</p>}

      {result && !result.applied && (
        <div className="stack">
          <ImportPlan r={{ ...result.plan, dryRun: true, applied: false }} />
          {result.channels.length > 0 && (
            <div><h3>{t("kuma.channels")}</h3>
              <table className="table"><tbody>{result.channels.map((c) => (
                <tr key={c.name}><td className="strong">{c.name}</td><td className="small">{c.type.replace(/^kuma:/, "")}</td>
                  <td className="small">{c.routing === "all" ? t("kuma.route_all") : t("kuma.route_apps", { names: c.applications.join(", ") })}</td>
                  <td className="small muted">{t("kuma.used_by", { n: c.usedBy })}</td></tr>))}</tbody></table>
              <label className="check"><input type="checkbox" checked={enable} onChange={(e) => setEnable(e.target.checked)} />{t("kuma.enable_channels")}</label>
              <p className="field__hint">{t("kuma.enable_hint")}</p>
            </div>
          )}
          {result.skipped.length > 0 && <div><h3>{t("kuma.skipped", { n: result.skipped.length })}</h3><ul className="kuma__notes">{result.skipped.map((n, i) => <li key={i}><span className="strong">{n.name}</span>: {note("skip", n)}</li>)}</ul></div>}
          {result.warnings.length > 0 && <div><h3>{t("kuma.warnings", { n: result.warnings.length })}</h3><ul className="kuma__notes">{result.warnings.map((n, i) => <li key={i}><span className="strong">{n.name}</span>: {note("warn", n)}</li>)}</ul></div>}
          <div className="form__actions">
            <button className="btn btn--primary" disabled={busy || result.plan.errors.length > 0 || (result.plan.summary.create + result.channels.length === 0)} onClick={() => found && void run(found.uploadId, false)}>{t("kuma.import")}</button>
          </div>
        </div>
      )}
      {result?.applied && (
        <div className="stack">
          <p className="ack__done" role="status">{t("kuma.done", { monitors: result.plan.summary.create, channels: result.channels.length - result.channelErrors.length })}</p>
          {result.channelErrors.map((e) => <p key={e.name} className="small text-down">{e.name}: {e.message}</p>)}
          {!enable && result.channels.length > 0 && <p className="small">{t("kuma.review_channels")}</p>}
        </div>
      )}
    </section>
  );
}
