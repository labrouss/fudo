import { useEffect, useRef, useState, type FormEvent } from "react";
import { NoMatch, SortTh, time, useTable } from "../../components/Table";
import { t } from "../../i18n";
import { api, ApiRequestError, apiTenant } from "../../api";
import { Dialog } from "../../components/Dialog";
import { Field, FormError } from "../../components/Field";
import { formatDateTime } from "../../components/Status";

interface BackupFile { name: string; size: number; kind: "manual" | "auto" | "prerestore" | "uploaded"; createdAt: string; fudoVersion: string | null; history: boolean | null; restorable: boolean }
interface Schedule { enabled: boolean; frequency: "daily" | "weekly"; weekday: number; time: string; timezone: string; history: boolean; keep: number; hasPassphrase: boolean }
interface Job { kind: "create" | "restore"; state: "running" | "done" | "failed"; errorCode?: string; file?: string }
interface Overview { dir: string; temporary: boolean; files: BackupFile[]; schedule: Schedule | null; nextRun: string | null; lastRun: { at: string; ok: boolean; file?: string; error?: string } | null; job: Job | null }
interface Inspected { header: { createdAt: string; fudoVersion: string; history: boolean }; manifest: { organization: string | null; counts: Record<string, number> }; restorable: boolean }

export const size = (n: number) => n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;
/** Backup errors are translated by their code (the API's own text is the fallback). */
function backupError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    const code = err.body.error;
    if (["wrong_passphrase", "damaged", "not_a_backup", "newer_version", "unsupported", "busy"].includes(code)) return t(`backups.error.${code}`);
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export function BackupsSection({ organization }: { organization: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<BackupFile | null>(null);
  const [upload, setUpload] = useState<{ pct: number; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => { try { setData(await api.get<Overview>("/backups")); } catch (e) { setError(backupError(e)); } };
  useEffect(() => { void load(); }, []);
  // while a backup is being written, refresh until it is done
  useEffect(() => {
    if (data?.job?.state !== "running" || data.job.kind !== "create") return;
    const id = setInterval(() => void load(), 1500);
    return () => clearInterval(id);
  }, [data?.job?.state, data?.job?.kind]);

  const remove = async (f: BackupFile) => {
    if (!confirm(t("backups.confirm_delete", { name: f.name }))) return;
    await api.del(`/backups/${f.name}`); await load();
  };
  // XMLHttpRequest for upload progress (fetch has none); raw bytes, see the API's upload route
  const sendFile = (file: File) => {
    setUpload({ pct: 0 });
    const x = new XMLHttpRequest();
    x.open("PUT", "/api/backups/upload");
    x.setRequestHeader("content-type", "application/octet-stream");
    x.setRequestHeader("x-fudo-upload", "1");
    x.setRequestHeader("x-fudo-lang", document.documentElement.lang);
    const tenant = apiTenant(); if (tenant) x.setRequestHeader("x-fudo-tenant", tenant);
    x.upload.onprogress = (e) => e.lengthComputable && setUpload({ pct: Math.round((e.loaded / e.total) * 100) });
    x.onload = () => {
      if (x.status < 300) { setUpload(null); void load(); return; }
      let msg = x.statusText;
      try { const b = JSON.parse(x.responseText); msg = backupError(new ApiRequestError(x.status, b)); } catch { /* keep status text */ }
      setUpload({ pct: 0, error: msg });
    };
    x.onerror = () => setUpload({ pct: 0, error: t("backups.upload_failed") });
    x.send(file);
  };

  // before the early return: hooks run on every render
  const table = useTable("backups", data?.files, {
    date: { value: (f) => time(f.createdAt), desc: true },
    type: { value: (f) => t(`backups.kind.${f.kind}`) },
    version: { value: (f) => f.fudoVersion },
    history: { value: (f) => (f.history == null ? null : f.history ? 0 : 1) },
    size: { value: (f) => f.size, desc: true },
  }, { text: (f) => f.name });
  if (!data) return error ? <FormError message={error} /> : null;
  const job = data.job;
  const kindLabel = (k: BackupFile["kind"]) => t(`backups.kind.${k}`);

  return (
    <>
      <section className="card backups">
        <h2>{t("backups.title")}</h2>
        <p className="lead">{t("backups.lead")}</p>
        <p className="small muted">{t("backups.stored_in")} <code>{data.dir}</code></p>
        {data.temporary && <p className="banner banner--warn" role="note">{t("backups.temporary_dir")}</p>}
        <div className="row-actions">
          <button className="btn btn--primary" onClick={() => setCreating(true)} disabled={job?.state === "running"}>{t("backups.create")}</button>
          <button className="btn" onClick={() => fileInput.current?.click()} disabled={!!upload && !upload.error}>{t("backups.upload")}</button>
          <input ref={fileInput} type="file" accept=".fudobackup" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) sendFile(f); }} />
        </div>
        {job?.kind === "create" && job.state === "running" && <p className="small" role="status">{t("backups.creating")}</p>}
        {job?.kind === "create" && job.state === "failed" && <FormError message={job.errorCode ? t(`backups.error.${job.errorCode}`, {}) : t("backups.failed")} />}
        {upload && !upload.error && <div className="progress" role="progressbar" aria-valuenow={upload.pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${upload.pct}%` }} /><em>{t("backups.uploading", { pct: upload.pct })}</em></div>}
        {upload?.error && <FormError message={upload.error} />}
        {data.files.length === 0 ? <p className="muted">{t("backups.none")}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><SortTh table={table} col="date">{t("backups.col.date")}</SortTh><SortTh table={table} col="type">{t("backups.col.type")}</SortTh><SortTh table={table} col="version">{t("backups.col.version")}</SortTh><SortTh table={table} col="history">{t("backups.col.history")}</SortTh><SortTh table={table} col="size" className="num">{t("backups.col.size")}</SortTh><th /></tr></thead>
              <tbody>
                {table.rows.map((f) => (
                  <tr key={f.name}>
                    <td title={f.name} className="nowrap">{formatDateTime(f.createdAt)}</td>
                    <td>{kindLabel(f.kind)}</td>
                    <td>{f.fudoVersion ?? "—"}</td>
                    <td>{f.history == null ? "—" : f.history ? t("backups.yes") : t("backups.no")}</td>
                    <td className="num">{size(f.size)}</td>
                    <td className="actions">
                      <a className="btn btn--small" href={`/api/backups/${f.name}/download`} download>{t("backups.download")}</a>
                      <button className="btn btn--small" disabled={!f.restorable || job?.state === "running"} title={f.restorable ? undefined : t("backups.not_restorable")} onClick={() => setRestoring(f)}>{t("backups.restore")}</button>
                      <button className="btn btn--small btn--danger" onClick={() => void remove(f)}>{t("common.delete")}</button>
                    </td>
                  </tr>
                ))}
                <NoMatch table={table} colSpan={6} />
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ScheduleCard data={data} onSaved={load} />
      <CreateDialog open={creating} onClose={() => setCreating(false)} onStarted={() => { setCreating(false); void load(); }} />
      {restoring && <RestoreDialog file={restoring} organization={organization} onClose={() => { setRestoring(null); void load(); }} />}
    </>
  );
}

function PassphraseFields({ value, onChange, errors }: { value: { p: string; c: string }; onChange: (v: { p: string; c: string }) => void; errors: Record<string, string> }) {
  return (
    <>
      <Field label={t("backups.passphrase")} type="password" autoComplete="new-password" value={value.p} onChange={(e) => onChange({ ...value, p: e.target.value })} error={errors.passphrase} hint={t("backups.passphrase_hint")} />
      <Field label={t("backups.passphrase_repeat")} type="password" autoComplete="new-password" value={value.c} onChange={(e) => onChange({ ...value, c: e.target.value })} error={errors.confirm} />
    </>
  );
}

function CreateDialog({ open, onClose, onStarted }: { open: boolean; onClose: () => void; onStarted: () => void }) {
  const [history, setHistory] = useState(false);
  const [pw, setPw] = useState({ p: "", c: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErrors({}); setMessage(null);
    if (pw.p !== pw.c) { setErrors({ confirm: t("backups.passphrase_mismatch") }); return; }
    try { await api.post("/backups", { history, passphrase: pw.p }); setPw({ p: "", c: "" }); onStarted(); }
    catch (err) { if (err instanceof ApiRequestError) setErrors(err.fields); setMessage(backupError(err)); }
  };
  return (
    <Dialog title={t("backups.create")} open={open} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <FormError message={message} />
        <label className="check"><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} />{t("backups.include_history")}</label>
        <p className="field__hint">{t("backups.include_history_hint")}</p>
        <PassphraseFields value={pw} onChange={setPw} errors={errors} />
        <p className="banner banner--warn" role="note">{t("backups.keep_passphrase")}</p>
        <div className="form__actions"><button className="btn btn--primary">{t("backups.create")}</button></div>
      </form>
    </Dialog>
  );
}

function RestoreDialog({ file, organization, onClose }: { file: BackupFile; organization: string; onClose: () => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [info, setInfo] = useState<Inspected | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [phase, setPhase] = useState<"check" | "confirm" | "running" | "done" | "failed">("check");
  const [safety, setSafety] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const inspect = async (e: FormEvent) => {
    e.preventDefault(); setMessage(null);
    try { const r = await api.post<Inspected>(`/backups/${file.name}/inspect`, { passphrase }); setInfo(r); setPhase("confirm"); }
    catch (err) { setMessage(backupError(err)); }
  };
  const restore = async (e: FormEvent) => {
    e.preventDefault(); setMessage(null); setErrors({});
    try {
      const r = await api.post<{ safetyFile: string }>(`/backups/${file.name}/restore`, { passphrase, confirm: confirmText });
      setSafety(r.safetyFile); setPhase("running");
    } catch (err) { if (err instanceof ApiRequestError) setErrors(err.fields); setMessage(backupError(err)); }
  };
  // the restore signs everyone out: follow it on the public health endpoint
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(async () => {
      try {
        const h = await (await fetch("/api/health")).json() as { restore?: { state: string; errorCode: string | null } };
        if (h.restore?.state === "done") setPhase("done");
        if (h.restore?.state === "failed") { setPhase("failed"); setMessage(h.restore.errorCode && ["wrong_passphrase", "damaged", "newer_version", "unsupported", "busy"].includes(h.restore.errorCode) ? t(`backups.error.${h.restore.errorCode}`) : t("backups.failed")); }
      } catch { /* the API may be busy: try again */ }
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const c = info?.manifest.counts ?? {};
  return (
    <Dialog title={t("backups.restore_title")} open onClose={phase === "running" ? () => {} : onClose} wide>
      <p className="small muted">{file.name}</p>
      <FormError message={message} />
      {phase === "check" && (
        <form onSubmit={inspect} className="form">
          <Field label={t("backups.passphrase")} type="password" autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoFocus />
          <div className="form__actions"><button className="btn btn--primary">{t("backups.check")}</button></div>
        </form>
      )}
      {phase === "confirm" && info && (
        <form onSubmit={restore} className="form">
          <dl className="facts">
            <dt>{t("backups.organization")}</dt><dd>{info.manifest.organization ?? "—"}</dd>
            <dt>{t("backups.col.date")}</dt><dd>{formatDateTime(info.header.createdAt)}</dd>
            <dt>{t("backups.col.version")}</dt><dd>{info.header.fudoVersion}</dd>
            <dt>{t("backups.contents")}</dt>
            <dd>{t("backups.counts", { tenants: c.tenants ?? 0, users: c.users ?? 0, monitors: c.monitors ?? 0, applications: c.applications ?? 0, incidents: c.incidents ?? 0 })}{info.header.history ? "" : ` · ${t("backups.no_history")}`}</dd>
          </dl>
          {!info.restorable ? <FormError message={t("backups.error.newer_version")} /> : (
            <>
              <p className="banner banner--warn" role="note">{t("backups.restore_warning")}</p>
              <Field label={t("backups.type_to_confirm", { org: organization })} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} error={errors.confirm} autoComplete="off" />
              <div className="form__actions"><button className="btn btn--danger" disabled={confirmText.trim() !== organization}>{t("backups.restore_now")}</button></div>
            </>
          )}
        </form>
      )}
      {phase === "running" && <p role="status">{t("backups.restoring")}</p>}
      {phase === "done" && (
        <>
          <p role="status">{t("backups.restored")}</p>
          {safety && <p className="small muted">{t("backups.safety_saved", { name: safety })}</p>}
          <div className="form__actions"><button className="btn btn--primary" onClick={() => { location.href = "/"; }}>{t("backups.sign_in_again")}</button></div>
        </>
      )}
      {phase === "failed" && <p className="small">{t("backups.nothing_changed")}</p>}
    </Dialog>
  );
}

function ScheduleCard({ data, onSaved }: { data: Overview; onSaved: () => void }) {
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const s = data.schedule;
  const [f, setF] = useState({ enabled: s?.enabled ?? false, frequency: s?.frequency ?? "daily", weekday: s?.weekday ?? 0, time: s?.time ?? "02:00", timezone: s?.timezone ?? browserTz, history: s?.history ?? false, keep: String(s?.keep ?? 7) });
  const [pw, setPw] = useState({ p: "", c: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const known = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  // browsers leave plain "UTC" (and sometimes the zone they report themselves) out of this list
  const zones = [...new Set([f.timezone, browserTz, "UTC", ...known])];
  const weekdays = [0, 1, 2, 3, 4, 5, 6].map((d) => new Intl.DateTimeFormat(document.documentElement.lang || "en", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + d))));

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErrors({}); setMessage(null); setSaved(false);
    if (pw.p && pw.p !== pw.c) { setErrors({ confirm: t("backups.passphrase_mismatch") }); return; }
    try {
      await api.put("/backups/schedule", { ...f, keep: Number(f.keep), ...(pw.p ? { passphrase: pw.p } : {}) });
      setPw({ p: "", c: "" }); setSaved(true); onSaved();
    } catch (err) { if (err instanceof ApiRequestError) setErrors(err.fields); setMessage(backupError(err)); }
  };
  const lr = data.lastRun;
  return (
    <section className="card card--form">
      <h2>{t("backups.schedule_title")}</h2>
      <p className="lead">{t("backups.schedule_lead")}</p>
      <form onSubmit={submit} className="form">
        <FormError message={message} />
        <label className="check"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />{t("backups.schedule_enabled")}</label>
        <div className="form__row">
          <label className="field"><span>{t("backups.frequency")}</span>
            <select value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as "daily" | "weekly" })}>
              <option value="daily">{t("backups.daily")}</option><option value="weekly">{t("backups.weekly")}</option>
            </select>
          </label>
          {f.frequency === "weekly" && (
            <label className="field"><span>{t("backups.weekday")}</span>
              <select value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>{weekdays.map((w, i) => <option key={i} value={i}>{w}</option>)}</select>
            </label>
          )}
          <Field label={t("backups.time")} type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} error={errors.time} />
          <label className="field"><span>{t("backups.timezone")}</span>
            <select value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</select>
          </label>
        </div>
        <label className="check"><input type="checkbox" checked={f.history} onChange={(e) => setF({ ...f, history: e.target.checked })} />{t("backups.include_history")}</label>
        <Field label={t("backups.keep")} type="number" min={1} max={365} value={f.keep} onChange={(e) => setF({ ...f, keep: e.target.value })} error={errors.keep} hint={t("backups.keep_hint")} />
        {s?.hasPassphrase && <p className="small muted">{t("backups.passphrase_stored")}</p>}
        <PassphraseFields value={pw} onChange={setPw} errors={errors} />
        <div className="form__actions">
          <button className="btn btn--primary">{t("common.save")}</button>
          {saved && <span className="field__hint" role="status">{t("admin.changes_saved")}</span>}
        </div>
      </form>
      <dl className="facts">
        <dt>{t("backups.next_run")}</dt><dd>{data.nextRun ? formatDateTime(data.nextRun) : "—"}</dd>
        <dt>{t("backups.last_run")}</dt>
        <dd>{!lr ? "—" : lr.ok ? t("backups.last_ok", { date: formatDateTime(lr.at) }) : <span className="text-down">{t("backups.last_failed", { date: formatDateTime(lr.at), error: lr.error ?? "" })}</span>}</dd>
      </dl>
    </section>
  );
}
