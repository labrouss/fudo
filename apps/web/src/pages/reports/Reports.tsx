import { t, uiLocale, formatMinutes, languageName } from "../../i18n";
import { NoMatch, SortTh, TableFilter, time, useTable } from "../../components/Table";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ReportScheduleDto, TenantPermissions } from "@fudo/shared";
import { api, errorFields, apiTenant } from "../../api";
import { LanguageSelect } from "../../components/LanguageSelect";
import { PageHeader } from "../../components/AppShell";
import { Dialog } from "../../components/Dialog";
import { Field, FormError } from "../../components/Field";
import { Pill } from "../../components/Status";

interface ReportJson {
  label: string; scopeName: string;
  summary: { items: number; onTarget: number; missed: number; availability: number | null; opened: number; resolved: number; mttaMin: number | null; mttrMin: number | null };
  items: Array<{ name: string; target: number | null; availability: number | null; businessHours: number | null; downMin: number; incidents: number; met: boolean | null }>;
}
// weekday names in the interface language (Mon…Sun); 2026-01-05 was a Monday
const DAYS = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(uiLocale(), { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 5 + i))));
const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(2)}%`);
const mins = (m: number | null) => (m === null ? "—" : formatMinutes(m, { dayUnit: false }));

export function ReportsPage({ perms, isGlobal }: { perms: TenantPermissions; isGlobal: boolean }) {
  const [q, setQ] = useState({ preset: "last-month", from: "", to: "", tz: browserTz, bh: true, bhStart: "08:00", bhEnd: "18:00", bhDays: [1, 2, 3, 4, 5] });
  const [preview, setPreview] = useState<ReportJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = useTable("report-items", preview?.items, {
    name: { value: (i) => i.name },
    target: { value: (i) => i.target },
    availability: { value: (i) => i.availability },
    business: { value: (i) => i.businessHours },
    down: { value: (i) => i.downMin, desc: true },
    incidents: { value: (i) => i.incidents, desc: true },
    sla: { value: (i) => (i.met === null ? null : i.met ? 1 : 0) },
  });
  const qs = (format: string) => new URLSearchParams({ preset: q.preset, ...(q.preset === "custom" ? { from: q.from, to: q.to } : {}), tz: q.tz, bh: q.bh ? "1" : "0", bhStart: q.bhStart, bhEnd: q.bhEnd, bhDays: q.bhDays.join(","), format }).toString();
  const load = useCallback(() => {
    if (q.preset === "custom" && (!q.from || !q.to)) return;
    api.get<ReportJson>(`/reports/download?${qs("json")}`).then((r) => { setPreview(r); setError(null); }).catch((e) => setError(errorFields(e).message));
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  // downloads go through fetch so the tenant header is sent
  async function download(format: string) {
    setError(null);
    const res = await fetch(`/api/reports/download?${qs(format)}`, { headers: { "x-fudo-lang": document.documentElement.lang, "x-fudo-tenant": apiTenant() ?? "" } });
    if (!res.ok) { setError((await res.json().catch(() => ({ message: t("reports.download_failed") }))).message); return; }
    const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "fudo-report";
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader help="dashboards-and-reports" title={t("common.reports")} />
      <div className="content">
        <FormError message={error} />
        <section className="card">
          <h2>{t("reports.availability_report")}</h2>
          <div className="report-form">
            <label className="field">{t("common.period")}
              <select value={q.preset} onChange={(e) => setQ({ ...q, preset: e.target.value })}>
                <option value="last-week">{t("reports.last_week")}</option><option value="last-month">{t("reports.last_month")}</option><option value="last-30-days">{t("reports.last_30_days")}</option><option value="custom">{t("reports.custom_dates")}</option>
              </select>
            </label>
            {q.preset === "custom" && <><Field label={t("reports.from")} type="date" value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} /><Field label={t("reports.to")} type="date" value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} /></>}
            <Field label={t("reports.time_zone")} value={q.tz} onChange={(e) => setQ({ ...q, tz: e.target.value })} hint={t("reports.e_g_europe_athens")} />
            <div className="field"><label className="check"><input type="checkbox" checked={q.bh} onChange={(e) => setQ({ ...q, bh: e.target.checked })} />{t("reports.business_hours")}</label>
              {q.bh && <span className="bh-row"><input type="time" aria-label={t("reports.start")} value={q.bhStart} onChange={(e) => setQ({ ...q, bhStart: e.target.value })} />–<input type="time" aria-label={t("reports.end")} value={q.bhEnd} onChange={(e) => setQ({ ...q, bhEnd: e.target.value })} />
                {DAYS.map((d, i) => <label key={d} className="day"><input type="checkbox" checked={q.bhDays.includes(i + 1)} onChange={(e) => setQ({ ...q, bhDays: e.target.checked ? [...q.bhDays, i + 1].sort() : q.bhDays.filter((x) => x !== i + 1) })} />{d}</label>)}</span>}
            </div>
          </div>
          {preview && (
            <>
              <p className="lead" style={{ margin: "12px 0" }}><strong>{preview.scopeName}</strong> · {preview.label}</p>
              <div className="stats">
                <div className="card stat"><span className="stat__label">{t("common.availability")}</span><span className="stat__value">{pct(preview.summary.availability)}</span></div>
                {!isGlobal && <div className="card stat"><span className="stat__label">{t("reports.sla_on_target")}</span><span className={`stat__value${preview.summary.missed ? " stat__value--down" : ""}`}>{preview.summary.onTarget}/{preview.summary.onTarget + preview.summary.missed}</span></div>}
                <div className="card stat"><span className="stat__label">{t("common.incidents")}</span><span className="stat__value">{preview.summary.opened}</span></div>
                <div className="card stat"><span className="stat__label">{t("reports.mtta")}</span><span className="stat__value">{mins(preview.summary.mttaMin)}</span></div>
                <div className="card stat"><span className="stat__label">{t("reports.mttr")}</span><span className="stat__value">{mins(preview.summary.mttrMin)}</span></div>
              </div>
              {preview.items.length > 8 && <div className="list-tools" style={{ marginTop: 12 }}><TableFilter table={items} /></div>}
              <table className="table table--dense" style={{ marginTop: 12 }}>
                <thead><tr><SortTh table={items} col="name">{isGlobal ? t("common.asset") : t("common.application")}</SortTh><SortTh table={items} col="target" className="num">{t("reports.target")}</SortTh><SortTh table={items} col="availability" className="num">24/7</SortTh>{q.bh && <SortTh table={items} col="business" className="num">{t("reports.business_hours")}</SortTh>}<SortTh table={items} col="down" className="num">{t("common.down")}</SortTh><SortTh table={items} col="incidents" className="num">{t("common.incidents")}</SortTh>{!isGlobal && <SortTh table={items} col="sla">{t("reports.sla")}</SortTh>}</tr></thead>
                <tbody>{items.rows.map((i) => (
                  <tr key={i.name}><td>{i.name}</td><td className="num">{i.target === null ? "—" : `${i.target}%`}</td><td className="num mono">{pct(i.availability)}</td>{q.bh && <td className="num mono">{pct(i.businessHours)}</td>}<td className="num">{mins(i.downMin)}</td><td className="num">{i.incidents}</td>
                    {!isGlobal && <td>{i.met === null ? <span className="muted">—</span> : i.met ? <Pill tone="up">{t("reports.met")}</Pill> : <Pill tone="down">{t("reports.missed")}</Pill>}</td>}</tr>
                ))}<NoMatch table={items} colSpan={7} /></tbody>
              </table>
              <div className="row-actions" style={{ marginTop: 12 }}>
                <button className="btn btn--primary" onClick={() => void download("pdf")}>{t("reports.download_pdf")}</button>
                <button className="btn" onClick={() => void download("csv-availability")}>{t("reports.csv_availability")}</button>
                <button className="btn" onClick={() => void download("csv-incidents")}>{t("reports.csv_incidents")}</button>
              </div>
            </>
          )}
        </section>
        {perms.manage && <Schedules />}
      </div>
    </>
  );
}

function Schedules() {
  const [list, setList] = useState<ReportScheduleDto[] | null>(null);
  const [editing, setEditing] = useState<ReportScheduleDto | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const table = useTable("report-schedules", list, {
    name: { value: (s) => s.name },
    recipients: { value: (s) => s.recipients.join(", ") },
    next: { value: (s) => time(s.nextRunAt) },
    last: { value: (s) => time(s.lastRun?.at), desc: true },
  });
  const load = useCallback(() => api.get<ReportScheduleDto[]>("/report-schedules").then(setList).catch((e) => setError(errorFields(e).message)), []);
  useEffect(() => { void load(); }, [load]);
  const send = async (s: ReportScheduleDto) => {
    setNotice(null); setError(null);
    try { const r = await api.post<{ detail: string; label: string }>(`/report-schedules/${s.id}/send`); setNotice(t("reports.name_for_label_detail", { name: s.name, label: r.label, detail: r.detail })); } catch (e) { setError(errorFields(e).message); }
    void load();
  };
  return (
    <section className="card card--flush">
      <div className="card-head card-head--pad"><h2>{t("reports.scheduled_reports")}</h2><button className="btn btn--small" onClick={() => setEditing("new")}>{t("reports.new_schedule")}</button></div>
      <div style={{ padding: "0 16px" }}><FormError message={error} />{notice && <div className="form-ok" role="status">{notice}</div>}</div>
      {list && list.length === 0 ? <p className="muted pad">{t("reports.no_schedules_reports_are_emailed_as_pdf")}</p> : (
        <table className="table">
          <thead><tr><SortTh table={table} col="name">{t("common.schedule")}</SortTh><SortTh table={table} col="recipients">{t("reports.recipients")}</SortTh><SortTh table={table} col="next">{t("reports.next")}</SortTh><SortTh table={table} col="last">{t("reports.last")}</SortTh><th><span className="sr-only">{t("common.actions")}</span></th></tr></thead>
          <tbody>{table.rows.map((s) => (
            <tr key={s.id}>
              <td><span className="strong">{s.name}</span>{!s.enabled && <> <Pill tone="neutral">{t("common.paused")}</Pill></>}<div className="muted small">{t(s.period === "weekly" ? "reports.schedule_weekly" : "reports.schedule_monthly", { time: `${String(s.sendHour).padStart(2, "0")}:00`, tz: s.timezone })} · {s.formats.join(" + ").toUpperCase()}{s.businessHours && t("reports.business_hours_2")}</div></td>
              <td className="small">{s.recipients.join(", ")}</td>
              <td className="small nowrap">{new Date(s.nextRunAt).toLocaleString(uiLocale())}</td>
              <td className="small">{s.lastRun ? <><Pill tone={s.lastRun.status === "sent" ? "up" : "down"}>{s.lastRun.status}</Pill> <span className="muted">{new Date(s.lastRun.at).toLocaleString(uiLocale())}{s.lastRun.status === "failed" && ` · ${s.lastRun.detail}`}</span></> : <span className="muted">{t("common.never")}</span>}</td>
              <td className="actions"><button className="btn btn--small" onClick={() => void send(s)}>{t("reports.send_now")}</button> <button className="btn btn--small" onClick={() => setEditing(s)}>{t("common.edit")}</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Dialog wide title={editing === "new" ? t("reports.new_scheduled_report") : t("reports.edit_scheduled_report")} open={editing !== null} onClose={() => setEditing(null)}>
        {editing && <ScheduleForm s={editing === "new" ? undefined : editing} onDone={() => { setEditing(null); void load(); }} />}
      </Dialog>
    </section>
  );
}

function ScheduleForm({ s, onDone }: { s?: ReportScheduleDto; onDone: () => void }) {
  const [defaultLang, setDefaultLang] = useState("en");
  useEffect(() => { api.get<{ locale: string }>("/notify-locale").then((r) => setDefaultLang(r.locale)).catch(() => {}); }, []);
  const [f, setF] = useState({ name: s?.name ?? t("reports.default_name"), period: s?.period ?? "weekly", sendHour: String(s?.sendHour ?? 7), timezone: s?.timezone ?? browserTz, recipients: s?.recipients.join(", ") ?? "", formats: s?.formats ?? ["pdf", "csv"], bh: Boolean(s?.businessHours ?? true), bhStart: s?.businessHours?.start ?? "08:00", bhEnd: s?.businessHours?.end ?? "18:00", bhDays: s?.businessHours?.days ?? [1, 2, 3, 4, 5], enabled: s?.enabled ?? true, locale: s?.locale ?? "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setFields({}); setMessage(null);
    const body = { name: f.name, locale: f.locale || null, period: f.period, sendHour: Number(f.sendHour), timezone: f.timezone, recipients: f.recipients.split(/[,;\s]+/).filter(Boolean), formats: f.formats, businessHours: f.bh ? { days: f.bhDays, start: f.bhStart, end: f.bhEnd } : null, enabled: f.enabled };
    try { if (s) await api.put(`/report-schedules/${s.id}`, body); else await api.post("/report-schedules", body); onDone(); }
    catch (err) { const r = errorFields(err); setFields(Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [k.split(".")[0]!, v]))); setMessage(Object.keys(r.fields).length ? null : r.message); }
  }
  const del = async () => { if (s && confirm(t("reports.delete_name", { name: s.name }))) { await api.del(`/report-schedules/${s.id}`); onDone(); } };
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <div className="grid-2">
        <Field label={t("common.name")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={fields.name} />
        <label className="field">{t("reports.send")}<select value={f.period} onChange={(e) => setF({ ...f, period: e.target.value as "weekly" })}><option value="weekly">{t("reports.weekly_mondays_previous_week")}</option><option value="monthly">{t("reports.monthly_1st_previous_month")}</option></select></label>
        <label className="field">{t("reports.at_2")}<select value={f.sendHour} onChange={(e) => setF({ ...f, sendHour: e.target.value })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></label>
        <Field label={t("reports.time_zone")} value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} error={fields.timezone} />
      </div>
      <label className="field">
        <span>{t("ui.language")}</span>
        <LanguageSelect value={f.locale} onChange={(v) => setF({ ...f, locale: v })} allowDefault defaultName={languageName(defaultLang)} />
        <span className="field__hint">{t("reports.language_hint")}</span>
      </label>
      <Field label={t("reports.recipients")} value={f.recipients} onChange={(e) => setF({ ...f, recipients: e.target.value })} error={fields.recipients} hint={t("reports.comma_separated_email_addresses")} placeholder={t("reports.cio_example_com_ops_example_com")} />
      <div className="row-actions">{(["pdf", "csv"] as const).map((x) => <label key={x} className="check small"><input type="checkbox" checked={f.formats.includes(x)} onChange={(e) => setF({ ...f, formats: e.target.checked ? [...f.formats, x] : f.formats.filter((y) => y !== x) })} />{x.toUpperCase()}</label>)}{fields.formats && <span className="field__error">{fields.formats}</span>}</div>
      <label className="check small"><input type="checkbox" checked={f.bh} onChange={(e) => setF({ ...f, bh: e.target.checked })} />{t("reports.also_report_availability_during_business")}</label>
      {f.bh && <span className="bh-row"><input type="time" aria-label={t("reports.start")} value={f.bhStart} onChange={(e) => setF({ ...f, bhStart: e.target.value })} />–<input type="time" aria-label={t("reports.end")} value={f.bhEnd} onChange={(e) => setF({ ...f, bhEnd: e.target.value })} />
        {DAYS.map((d, i) => <label key={d} className="day"><input type="checkbox" checked={f.bhDays.includes(i + 1)} onChange={(e) => setF({ ...f, bhDays: e.target.checked ? [...f.bhDays, i + 1].sort() : f.bhDays.filter((x) => x !== i + 1) })} />{d}</label>)}</span>}
      {fields.businessHours && <span className="field__error">{fields.businessHours}</span>}
      <label className="check small"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />{t("common.enabled")}</label>
      <div className="row-actions" style={{ justifyContent: "space-between" }}>{s ? <button type="button" className="btn btn--danger" onClick={() => void del()}>{t("common.delete")}</button> : <span />}<button className="btn btn--primary">{s ? t("common.save_changes") : t("reports.create_schedule")}</button></div>
    </form>
  );
}
