import { useCallback, useEffect, useState } from "react";
import type { EscalationTarget, OncallDto } from "@fudo/shared";
import { t, uiLocale } from "../../i18n";
import { api, errorFields } from "../../api";
import { Field, FormError } from "../../components/Field";
import { Pill } from "../../components/Status";

type Schedule = NonNullable<OncallDto["schedule"]>;
const TARGETS: EscalationTarget[] = ["oncall", "next", "leads", "team"];
const when = (iso: string) => new Date(iso).toLocaleString(uiLocale(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** A team's on-call: rotation, escalation steps, the coming shifts and overrides. */
export function OncallEditor({ teamId, canManage }: { teamId: string; canManage: boolean }) {
  const [data, setData] = useState<OncallDto | null>(null);
  const [s, setS] = useState<Schedule | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const load = useCallback(() => api.get<OncallDto>(`/teams/${teamId}/oncall`).then((d) => {
    setData(d);
    setS(d.schedule ?? { enabled: true, participants: d.members.map((m) => m.userId), shiftDays: 7, handoverTime: "09:00", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, startDate: new Date().toISOString().slice(0, 10), minSeverity: "minor", steps: [{ target: "oncall", afterMin: 0 }, { target: "leads", afterMin: 15 }] });
  }).catch((e) => setMessage(errorFields(e).message)), [teamId]);
  useEffect(() => { void load(); }, [load]);
  if (!data || !s) return <FormError message={message} />;

  const name = (id: string) => data.members.find((m) => m.userId === id)?.name ?? "?";
  const save = async () => {
    setMessage(null); setFields({}); setSaved(false);
    try { await api.put(`/teams/${teamId}/oncall`, s); setSaved(true); await load(); }
    catch (e) { const x = errorFields(e); setFields(x.fields); setMessage(x.fields.steps ?? x.message); }
  };
  const move = (n: number, d: -1 | 1) => { const p = [...s.participants]; const m = n + d; if (m < 0 || m >= p.length) return; [p[n], p[m]] = [p[m]!, p[n]!]; setS({ ...s, participants: p }); };
  const unreachable = data.members.filter((m) => !m.reachable && s.participants.includes(m.userId));
  const zones = [...new Set([s.timezone, "UTC", ...((Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [])])];
  const shiftOptions = [1, 7, 14];

  return (
    <div className="stack oncall">
      <FormError message={message} />
      <div className="oncall__now">
        {data.now ? <><span className="muted">{t("oncall.now")}:</span> <span className="strong">{data.now.name}</span> <span className="muted">{t("oncall.until", { time: when(data.now.until) })}</span>{data.now.source === "override" && <Pill tone="info">{t("oncall.override")}</Pill>}</>
          : <span className="muted">{t("oncall.nobody")}</span>}
      </div>

      <fieldset className="matrix" disabled={!canManage}><legend>{t("oncall.rotation")}</legend>
        <label className="check"><input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />{t("oncall.enabled")}</label>
        <ol className="oncall__people">
          {s.participants.map((p, n) => (
            <li key={p}><span>{name(p)}</span>
              {canManage && <span className="row-actions"><button type="button" className="btn btn--small" onClick={() => move(n, -1)} disabled={n === 0} aria-label={t("status_pages.move_up")}>↑</button>
                <button type="button" className="btn btn--small" onClick={() => move(n, 1)} disabled={n === s.participants.length - 1} aria-label={t("status_pages.move_down")}>↓</button>
                <button type="button" className="btn btn--small" onClick={() => setS({ ...s, participants: s.participants.filter((x) => x !== p) })}>{t("status_pages.remove")}</button></span>}
            </li>))}
        </ol>
        {canManage && data.members.some((m) => !s.participants.includes(m.userId)) && (
          <select className="input" value="" onChange={(e) => e.target.value && setS({ ...s, participants: [...s.participants, e.target.value] })} aria-label={t("oncall.add_person")}>
            <option value="">{t("oncall.add_person")}</option>
            {data.members.filter((m) => !s.participants.includes(m.userId)).map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
          </select>
        )}
        <div className="grid-2">
          <label className="field"><span>{t("oncall.shift")}</span>
            <select value={shiftOptions.includes(s.shiftDays) ? String(s.shiftDays) : "custom"} onChange={(e) => setS({ ...s, shiftDays: e.target.value === "custom" ? 3 : Number(e.target.value) })}>
              <option value="1">{t("oncall.daily")}</option><option value="7">{t("oncall.weekly")}</option><option value="14">{t("oncall.two_weeks")}</option><option value="custom">{t("oncall.custom")}</option>
            </select>
          </label>
          {!shiftOptions.includes(s.shiftDays)
            ? <Field label={t("oncall.days")} type="number" min={1} max={28} value={String(s.shiftDays)} onChange={(e) => setS({ ...s, shiftDays: Number(e.target.value) })} error={fields.shiftDays} />
            : <Field label={t("oncall.handover")} type="time" value={s.handoverTime} onChange={(e) => setS({ ...s, handoverTime: e.target.value })} error={fields.handoverTime} />}
          {!shiftOptions.includes(s.shiftDays) && <Field label={t("oncall.handover")} type="time" value={s.handoverTime} onChange={(e) => setS({ ...s, handoverTime: e.target.value })} error={fields.handoverTime} />}
          <Field label={t("oncall.first_shift")} type="date" value={s.startDate} onChange={(e) => setS({ ...s, startDate: e.target.value })} error={fields.startDate} hint={t("oncall.first_shift_hint")} />
          <label className="field"><span>{t("backups.timezone")}</span>
            <select value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</select>
          </label>
        </div>
      </fieldset>

      <fieldset className="matrix" disabled={!canManage}><legend>{t("oncall.escalation")}</legend>
        <label className="field"><span>{t("oncall.min_severity")}</span>
          <select value={s.minSeverity} onChange={(e) => setS({ ...s, minSeverity: e.target.value as Schedule["minSeverity"] })}>
            <option value="minor">{t("oncall.sev_all")}</option><option value="major">{t("oncall.sev_major")}</option><option value="critical">{t("oncall.sev_critical")}</option>
          </select>
        </label>
        {s.steps.map((st, n) => (
          <div key={n} className="step-row">
            <span className="small muted">{n + 1}.</span>
            <select value={st.target} onChange={(e) => setS({ ...s, steps: s.steps.map((x, j) => (j === n ? { ...x, target: e.target.value as EscalationTarget } : x)) })} aria-label={t("oncall.who")}>
              {TARGETS.map((x) => <option key={x} value={x}>{t(`oncall.target.${x}`)}</option>)}
            </select>
            <label className="small">{t("profile.after")}<input type="number" min={0} max={1440} className="input--narrow" value={st.afterMin} onChange={(e) => setS({ ...s, steps: s.steps.map((x, j) => (j === n ? { ...x, afterMin: Number(e.target.value) } : x)) })} />{t("profile.minutes")}</label>
            {canManage && s.steps.length > 1 && <button type="button" className="btn btn--small" onClick={() => setS({ ...s, steps: s.steps.filter((_, j) => j !== n) })}>{t("status_pages.remove")}</button>}
          </div>
        ))}
        {canManage && s.steps.length < 10 && <button type="button" className="btn btn--small" onClick={() => setS({ ...s, steps: [...s.steps, { target: "leads", afterMin: (s.steps.at(-1)?.afterMin ?? 0) + 15 }] })}>{t("profile.add_step")}</button>}
        <p className="field__hint">{t("oncall.escalation_hint")}</p>
        {unreachable.length > 0 && <p className="banner banner--warn" role="note">{t("oncall.unreachable", { names: unreachable.map((m) => m.name).join(", ") })}</p>}
      </fieldset>
      {canManage && <div className="form__actions"><button className="btn btn--primary" onClick={() => void save()}>{t("common.save")}</button>{saved && <span className="field__hint" role="status">{t("admin.changes_saved")}</span>}</div>}

      {data.upcoming.length > 0 && (
        <section><h3>{t("oncall.upcoming")}</h3>
          <table className="table"><tbody>{data.upcoming.map((u, n) => (
            <tr key={n}><td className="strong">{u.name}</td><td className="small nowrap">{when(u.start)} – {when(u.end)}</td></tr>))}</tbody></table>
        </section>
      )}
      <Overrides teamId={teamId} data={data} canManage={canManage} onChanged={load} />
    </div>
  );
}

function Overrides({ teamId, data, canManage, onChanged }: { teamId: string; data: OncallDto; canManage: boolean; onChanged: () => void }) {
  const now = new Date();
  const [f, setF] = useState({ userId: data.members[0]?.userId ?? "", startsAt: localInput(now), endsAt: localInput(new Date(now.getTime() + 24 * 3600_000)) });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const add = async () => {
    setFields({}); setMessage(null);
    try { await api.post(`/teams/${teamId}/oncall/overrides`, { userId: f.userId, startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString() }); onChanged(); }
    catch (e) { const x = errorFields(e); setFields(x.fields); if (!Object.keys(x.fields).length) setMessage(x.message); }
  };
  return (
    <section><h3>{t("oncall.overrides")}</h3>
      <p className="field__hint">{t("oncall.overrides_hint")}</p>
      <FormError message={message} />
      {data.overrides.length > 0 && <table className="table"><tbody>{data.overrides.map((o) => (
        <tr key={o.id}><td className="strong">{o.name}</td><td className="small nowrap">{when(o.startsAt)} – {when(o.endsAt)}</td>
          <td className="actions">{canManage && <button className="btn btn--small" onClick={async () => { await api.del(`/teams/${teamId}/oncall/overrides/${o.id}`); onChanged(); }}>{t("status_pages.remove")}</button>}</td></tr>))}</tbody></table>}
      {canManage && (
        <div className="grid-2 oncall__override">
          <label className="field"><span>{t("oncall.covered_by")}</span>
            <select value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>{data.members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select>
          </label>
          <span />
          <Field label={t("maintenance.starts")} type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} error={fields.startsAt} />
          <Field label={t("maintenance.ends")} type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} error={fields.endsAt} />
          <div><button type="button" className="btn" onClick={() => void add()}>{t("oncall.add_override")}</button></div>
        </div>
      )}
    </section>
  );
}
