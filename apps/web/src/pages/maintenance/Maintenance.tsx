import { t, uiLocale } from "../../i18n";
import { NoMatch, SortTh, TableFilter, time, useTable } from "../../components/Table";
import { useLiveReload } from "../../live";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ApplicationDto, AssetDto, MaintenanceDto, MaintenanceSeriesDto, MonitorDto, RecurrenceRule, TenantPermissions } from "@fudo/shared";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { Dialog } from "../../components/Dialog";
import { Field, FormError } from "../../components/Field";
import { Pill } from "../../components/Status";

const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const STATE = { active: { tone: "info", label: t("maintenance.in_progress") }, upcoming: { tone: "neutral", label: t("maintenance.scheduled") }, past: { tone: "neutral", label: t("maintenance.finished") } } as const;
const NTH = [1, 2, 3, 4, -1] as const;
type Repeat = "none" | "daily" | "weekly" | "monthly";

/** Weekday names in the interface language (0 = Sunday). */
const weekday = (d: number, style: "long" | "short" = "long") => new Intl.DateTimeFormat(uiLocale(), { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + d)));
const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const addMin = (time: string, min: number) => hhmm(Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + min);

/** "Every week: Sunday · 02:00–04:00 (Europe/Athens) · until 31 Dec 2026" */
export function describeRule(r: RecurrenceRule): string {
  let what: string;
  if (r.freq === "daily") what = t("maintenance.rule.daily");
  else if (r.freq === "weekly") what = t("maintenance.rule.weekly", { days: new Intl.ListFormat(uiLocale(), { type: "conjunction" }).format((r.weekdays ?? []).map((d) => weekday(d))) });
  else if (r.monthly?.mode === "nth") what = t(`maintenance.rule.monthly_week.${r.monthly.nth}`, { weekday: weekday(r.monthly.weekday) });
  else what = t("maintenance.rule.monthly_day", { day: r.monthly?.mode === "day" ? r.monthly.day : 1 });
  const time = `${r.time}–${addMin(r.time, r.durationMin)} (${r.timezone})`;
  const until = r.until ? ` · ${t("maintenance.rule.until", { date: new Date(`${r.until}T12:00:00Z`).toLocaleDateString(uiLocale(), { dateStyle: "medium", timeZone: "UTC" }) })}` : "";
  return `${what} · ${time}${until}`;
}

export function MaintenancePage({ perms, isGlobal }: { perms: TenantPermissions; isGlobal: boolean }) {
  const [list, setList] = useState<MaintenanceDto[] | null>(null);
  const [series, setSeries] = useState<MaintenanceSeriesDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ window?: MaintenanceDto; series?: MaintenanceSeriesDto } | null>(null);
  const load = useCallback(() => Promise.all([api.get<MaintenanceDto[]>("/maintenance"), api.get<MaintenanceSeriesDto[]>("/maintenance/series")])
    .then(([l, s]) => { setList(l); setSeries(s); setError(null); }).catch((e) => setError(errorFields(e).message)), []);
  useLiveReload(load, ["status"]);
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); } catch (e) { setError(errorFields(e).message); } };
  const own = (x: { scope: string }) => (x.scope === "global") === isGlobal;

  const STATE_RANK: Record<string, number> = { active: 0, upcoming: 1, past: 2 };
  const windows = useTable("maintenance", list, {
    state: { value: (w) => STATE_RANK[w.state] },
    name: { value: (w) => w.name },
    when: { value: (w) => time(w.startsAt), desc: true },
    covers: { value: (w) => w.targets.map((x) => x.name).join(", ") },
  }, { text: (w) => w.description });
  // the filter typed above applies to both lists
  const recurring = useTable("maintenance-series", series, {
    name: { value: (s) => s.name },
    rule: { value: (s) => describeRule(s.rule) },
    next: { value: (s) => time(s.nextStart) },
    covers: { value: (s) => s.targets.map((x) => x.name).join(", ") },
  }, { text: (s) => s.description, q: windows.q });
  return (
    <>
      <PageHeader help="maintenance" title={t("common.maintenance")}><TableFilter table={windows} />{perms.manage && <button className="btn btn--primary" onClick={() => setEditing({})}>{t("maintenance.schedule_maintenance")}</button>}</PageHeader>
      <div className="content">
        <FormError message={error} />
        <p className="muted small">{t("maintenance.during_a_window_checks_keep_running_but")}</p>
        {series.length > 0 && (
          <section className="card card--flush">
            <h2 className="card__title">{t("maintenance.recurring")}</h2>
            <table className="table">
              <thead><tr><SortTh table={recurring} col="name">{t("maintenance.window")}</SortTh><SortTh table={recurring} col="rule">{t("maintenance.repeats")}</SortTh><SortTh table={recurring} col="next">{t("maintenance.next")}</SortTh><SortTh table={recurring} col="covers">{t("maintenance.covers")}</SortTh><th><span className="sr-only">{t("common.actions")}</span></th></tr></thead>
              <tbody>
                {recurring.rows.map((s) => (
                  <tr key={s.id}>
                    <td><span className="strong">{s.name}</span>{s.scope === "global" && <span className="scope-badge">{t("common.global")}</span>}{s.description && <div className="muted small">{s.description}</div>}</td>
                    <td className="small">{describeRule(s.rule)}</td>
                    <td className="small nowrap">{s.nextStart ? new Date(s.nextStart).toLocaleString(uiLocale()) : "—"}</td>
                    <td><div className="chips">{s.targets.map((item) => <span key={item.type + item.id} className="chip">{item.name}</span>)}</div></td>
                    <td className="actions">
                      {own(s) && perms.manage && <><button className="btn btn--small" onClick={() => setEditing({ series: s })}>{t("common.edit")}</button>{" "}
                        <button className="btn btn--small btn--danger" onClick={() => { if (confirm(t("maintenance.confirm_stop_series", { name: s.name }))) void act(() => api.del(`/maintenance/series/${s.id}`)); }}>{t("common.delete")}</button></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <section className="card card--flush">
          {list && list.length === 0 ? <div className="empty"><p>{t("maintenance.no_maintenance_windows")}</p></div> : (
            <table className="table">
              <thead><tr><SortTh table={windows} col="state">{t("maintenance.state")}</SortTh><SortTh table={windows} col="name">{t("maintenance.window")}</SortTh><SortTh table={windows} col="when">{t("common.when")}</SortTh><SortTh table={windows} col="covers">{t("maintenance.covers")}</SortTh><th><span className="sr-only">{t("common.actions")}</span></th></tr></thead>
              <tbody>
                {windows.rows.map((w) => (
                  <tr key={w.id}>
                    <td><Pill tone={STATE[w.state].tone}>{STATE[w.state].label}</Pill></td>
                    <td><span className="strong">{w.name}</span>{w.scope === "global" && <span className="scope-badge">{t("common.global")}</span>}{w.seriesId && <span className="scope-badge" title={t("maintenance.from_series")}>{t("maintenance.repeats")}</span>}{w.description && <div className="muted small">{w.description}</div>}</td>
                    <td className="small nowrap">{new Date(w.startsAt).toLocaleString(uiLocale())}<br /><span className="muted">{t("maintenance.until_when", { when: new Date(w.endsAt).toLocaleString(uiLocale()) })}</span></td>
                    <td><div className="chips">{w.targets.map((item) => <span key={item.type + item.id} className="chip">{item.name}</span>)}</div></td>
                    <td className="actions">
                      {own(w) && perms.operate && w.state !== "past" && <button className="btn btn--small" onClick={() => act(() => api.post(`/maintenance/${w.id}/end`))}>{w.state === "active" ? t("maintenance.end_now") : w.seriesId ? t("maintenance.skip") : t("common.cancel")}</button>}{" "}
                      {own(w) && perms.manage && w.state === "upcoming" && <button className="btn btn--small" onClick={() => setEditing({ window: w })}>{t("common.edit")}</button>}
                    </td>
                  </tr>
                ))}
                <NoMatch table={windows} colSpan={5} />
              </tbody>
            </table>
          )}
        </section>
      </div>
      <Dialog wide title={editing?.window || editing?.series ? t("maintenance.edit_maintenance") : t("maintenance.schedule_maintenance")} open={editing !== null} onClose={() => setEditing(null)}>
        {editing && <WindowForm window={editing.window} series={editing.series} isGlobal={isGlobal} onSaved={() => { setEditing(null); void load(); }} />}
      </Dialog>
    </>
  );
}

function WindowForm({ window: w, series: s, isGlobal, onSaved }: { window?: MaintenanceDto; series?: MaintenanceSeriesDto; isGlobal: boolean; onSaved: () => void }) {
  const now = new Date();
  const today = local(now).slice(0, 10);
  const r = s?.rule;
  const [form, setForm] = useState({ name: w?.name ?? s?.name ?? "", description: w?.description ?? s?.description ?? "", startsAt: local(w ? new Date(w.startsAt) : now), endsAt: local(w ? new Date(w.endsAt) : new Date(now.getTime() + 2 * 3600_000)) });
  // a single window that belongs to a series is edited on its own (it leaves the series)
  const [repeat, setRepeat] = useState<Repeat>(r?.freq ?? "none");
  const [rec, setRec] = useState({
    startDate: r?.startDate ?? today, until: r?.until ?? "", startTime: r?.time ?? "02:00", endTime: r ? addMin(r.time, r.durationMin) : "04:00",
    timezone: r?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    weekdays: r?.weekdays ?? [now.getDay()],
    monthlyMode: (r?.monthly?.mode ?? "day") as "day" | "nth",
    monthDay: r?.monthly?.mode === "day" ? r.monthly.day : now.getDate(),
    nth: (r?.monthly?.mode === "nth" ? r.monthly.nth : 2) as (typeof NTH)[number],
    nthWeekday: r?.monthly?.mode === "nth" ? r.monthly.weekday : 2,
  });
  const [targets, setTargets] = useState<Set<string>>(new Set((w?.targets ?? s?.targets ?? []).map((item) => `${item.type}:${item.id}`)));
  const [options, setOptions] = useState<Array<{ group: string; type: string; id: string; name: string }>>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const zones = [...new Set([rec.timezone, "UTC", ...((Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [])])];

  useEffect(() => {
    void (async () => {
      const [assets, monitors, apps] = await Promise.all([
        api.get<AssetDto[]>("/assets"), api.get<MonitorDto[]>("/monitors"), isGlobal ? Promise.resolve([] as ApplicationDto[]) : api.get<ApplicationDto[]>("/applications"),
      ]);
      const mine = (scope: string) => (scope === "global") === isGlobal;
      setOptions([
        ...apps.map((a) => ({ group: t("common.applications"), type: "application", id: a.id, name: a.name })),
        ...assets.filter((a) => mine(a.scope)).map((a) => ({ group: t("maintenance.group_assets"), type: "asset", id: a.id, name: a.name })),
        ...monitors.filter((m) => mine(m.scope)).map((m) => ({ group: t("common.monitors"), type: "monitor", id: m.id, name: m.name })),
      ]);
    })().catch(() => {});
  }, [isGlobal]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setFields({}); setMessage(null);
    const chosen = [...targets].map((k) => { const [type, id] = k.split(":"); return { type, id }; });
    try {
      if (repeat === "none") {
        const body = { ...form, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString(), targets: chosen };
        if (w) await api.put(`/maintenance/${w.id}`, body); else await api.post("/maintenance", body);
      } else {
        const body = { name: form.name, description: form.description, targets: chosen, freq: repeat, ...rec, until: rec.until || null };
        if (s) await api.put(`/maintenance/series/${s.id}`, body); else await api.post("/maintenance/series", body);
      }
      onSaved();
    } catch (err) { const x = errorFields(err); setFields(x.fields); setMessage(Object.keys(x.fields).length ? (x.fields.targets ?? x.fields.weekdays ?? null) : x.message); }
    finally { setBusy(false); }
  }
  const toggle = (k: string) => setTargets((x) => { const n = new Set(x); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleDay = (d: number) => setRec((x) => ({ ...x, weekdays: x.weekdays.includes(d) ? x.weekdays.filter((y) => y !== d) : [...x.weekdays, d] }));
  const groups = [...new Set(options.map((o) => o.group))];

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <Field label={t("common.name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={fields.name} placeholder={t("maintenance.core_switch_firmware_upgrade")} />
      {!w && (
        <label className="field"><span>{t("maintenance.repeat")}</span>
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)} disabled={!!s}>
            {!s && <option value="none">{t("maintenance.repeat_none")}</option>}
            <option value="daily">{t("maintenance.repeat_daily")}</option>
            <option value="weekly">{t("maintenance.repeat_weekly")}</option>
            <option value="monthly">{t("maintenance.repeat_monthly")}</option>
          </select>
        </label>
      )}
      {repeat === "none" ? (
        <div className="grid-2">
          <Field label={t("maintenance.starts")} type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} error={fields.startsAt} />
          <Field label={t("maintenance.ends")} type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} error={fields.endsAt} />
        </div>
      ) : (
        <>
          {repeat === "weekly" && (
            <fieldset className="matrix"><legend>{t("maintenance.on_days")}</legend>
              <div className="day-picks">{[1, 2, 3, 4, 5, 6, 0].map((d) => <label key={d} className="check small"><input type="checkbox" checked={rec.weekdays.includes(d)} onChange={() => toggleDay(d)} />{weekday(d, "short")}</label>)}</div>
              {fields.weekdays && <span className="field__error">{fields.weekdays}</span>}
            </fieldset>
          )}
          {repeat === "monthly" && (
            <fieldset className="matrix"><legend>{t("maintenance.on")}</legend>
              <label className="check small"><input type="radio" checked={rec.monthlyMode === "day"} onChange={() => setRec({ ...rec, monthlyMode: "day" })} />{t("maintenance.on_day_of_month")}
                <input type="number" min={1} max={31} value={rec.monthDay} onChange={(e) => setRec({ ...rec, monthlyMode: "day", monthDay: Number(e.target.value) })} className="input--narrow" aria-label={t("maintenance.on_day_of_month")} /></label>
              <label className="check small"><input type="radio" checked={rec.monthlyMode === "nth"} onChange={() => setRec({ ...rec, monthlyMode: "nth" })} />{t("maintenance.on_weekday_of_week")}
                <select value={rec.nthWeekday} onChange={(e) => setRec({ ...rec, monthlyMode: "nth", nthWeekday: Number(e.target.value) })} aria-label={t("maintenance.on_weekday_of_week")}>{[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{weekday(d)}</option>)}</select>
                <select value={rec.nth} onChange={(e) => setRec({ ...rec, monthlyMode: "nth", nth: Number(e.target.value) as (typeof NTH)[number] })} aria-label={t("maintenance.on_weekday_of_week")}>{NTH.map((n) => <option key={n} value={n}>{t(`maintenance.week_opt.${n}`)}</option>)}</select></label>
              <p className="field__hint">{t("maintenance.patch_tuesday_hint")}</p>
            </fieldset>
          )}
          <div className="grid-2">
            <Field label={t("maintenance.from_time")} type="time" value={rec.startTime} onChange={(e) => setRec({ ...rec, startTime: e.target.value })} error={fields.startTime} />
            <Field label={t("maintenance.to_time")} type="time" value={rec.endTime} onChange={(e) => setRec({ ...rec, endTime: e.target.value })} error={fields.endTime} hint={t("maintenance.next_day_hint")} />
            <Field label={t("maintenance.first_day")} type="date" value={rec.startDate} onChange={(e) => setRec({ ...rec, startDate: e.target.value })} error={fields.startDate} />
            <Field label={t("maintenance.last_day")} type="date" value={rec.until} onChange={(e) => setRec({ ...rec, until: e.target.value })} error={fields.until} hint={t("maintenance.last_day_hint")} />
          </div>
          <label className="field"><span>{t("backups.timezone")}</span>
            <select value={rec.timezone} onChange={(e) => setRec({ ...rec, timezone: e.target.value })}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</select>
          </label>
        </>
      )}
      <Field label={t("maintenance.notes")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("maintenance.change_ticket_contact_rollback_plan")} />
      <fieldset className="matrix"><legend>{t("maintenance.covers_n", { count: targets.size })}</legend>
        <div className="pick-list" style={{ border: "none", padding: 0 }}>
          {groups.map((g) => <div key={g}><h4>{g}</h4>{options.filter((o) => o.group === g).map((o) => <label key={o.id} className="check small" style={{ padding: "3px 0" }}><input type="checkbox" checked={targets.has(`${o.type}:${o.id}`)} onChange={() => toggle(`${o.type}:${o.id}`)} />{o.name}</label>)}</div>)}
          {options.length === 0 && <p className="muted small">{t("maintenance.nothing_to_put_into_maintenance_in_this")}</p>}
        </div>
      </fieldset>
      {w?.seriesId && <p className="field__hint">{t("maintenance.edit_occurrence_hint")}</p>}
      <div className="row-actions row-actions--end"><button className="btn btn--primary" disabled={busy}>{busy ? t("common.saving") : w || s ? t("common.save_changes") : t("common.schedule")}</button></div>
    </form>
  );
}
