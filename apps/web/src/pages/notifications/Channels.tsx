import { T } from "../../components/T";
import { NoMatch, SEVERITY_RANK, SortTh, TableFilter, time, useTable } from "../../components/Table";
import { t, uiLocale, formatMinutes, languageName } from "../../i18n";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LanguageSelect } from "../../components/LanguageSelect";
import type { ApplicationDto, ChannelDto, DeliveryDto, TenantPermissions } from "@fudo/shared";
import { KUMA_SOURCE, fieldVisible, type ChannelField } from "@fudo/notify/definitions";
import { CHANNEL_GROUPS, CHANNEL_TYPES, NOTIFY_EVENTS, getChannelType } from "../../defs";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { Dialog } from "../../components/Dialog";
import { Field, FormError } from "../../components/Field";
import { Pill } from "../../components/Status";

export function ChannelsPage({ perms, isGlobal }: { perms: TenantPermissions; isGlobal: boolean }) {
  const [list, setList] = useState<ChannelDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChannelDto | "new" | null>(null);
  const [log, setLog] = useState<{ ch: ChannelDto; rows: DeliveryDto[] } | null>(null);
  const load = useCallback(() => api.get<ChannelDto[]>("/notification-channels").then((l) => { setList(l); setError(null); }).catch((e) => setError(errorFields(e).message)), []);
  useEffect(() => { void load(); }, [load]);
  const test = async (c: ChannelDto) => {
    setNotice(null); setError(null);
    try { const r = await api.post<{ detail: string }>(`/notification-channels/${c.id}/test`); setNotice(t("notifications.test_sent_to_name_detail", { name: c.name, detail: r.detail })); } catch (e) { setError(errorFields(e).message); }
    void load();
  };
  const table = useTable("channels", list, {
    name: { value: (c) => c.name },
    sends: { value: (c) => SEVERITY_RANK[c.minSeverity] },
    last: { value: (c) => time(c.lastDelivery?.at), desc: true },
  }, { text: (c) => `${getChannelType(c.type)?.label ?? c.type} ${c.summary} ${c.events.join(" ")} ${c.applications.map((a) => a.name).join(" ")}` });
  if (!perms.manage) return <><PageHeader help="notifications" title={t("common.notifications")} /><div className="content"><p className="muted">{t("notifications.only_tenant_admins_or_infra_admins_in_the")}</p></div></>;
  return (
    <>
      <PageHeader help="notifications" title={t("common.notifications")}><TableFilter table={table} /><button className="btn btn--primary" onClick={() => setEditing("new")}>{t("notifications.add_channel")}</button></PageHeader>
      <div className="content">
        <FormError message={error} />
        {notice && <div className="form-ok" role="status">{notice}</div>}
        <p className="muted small">{isGlobal
          ? t("notifications.global_channels_receive_infrastructure")
          : t("notifications.channels_for_this_tenant_receive_its")}</p>
        <section className="card card--flush">
          {list && list.length === 0 ? <div className="empty"><p>{t("notifications.no_channels_yet_add_email_microsoft_teams")}</p><button className="btn btn--primary" onClick={() => setEditing("new")}>{t("notifications.add_the_first_channel")}</button></div> : (
            <table className="table">
              <thead><tr><SortTh table={table} col="name">{t("notifications.channel")}</SortTh><SortTh table={table} col="sends">{t("notifications.sends")}</SortTh><SortTh table={table} col="last">{t("notifications.last_delivery")}</SortTh><th><span className="sr-only">{t("common.actions")}</span></th></tr></thead>
              <tbody>
                {table.rows.map((c) => (
                  <tr key={c.id}>
                    <td><span className="strong">{c.name}</span>{!c.enabled && <> <Pill tone="neutral">{t("notifications.disabled")}</Pill></>}<div className="muted small">{getChannelType(c.type)?.label ?? c.type} · {c.summary}</div></td>
                    <td className="small">{c.escalateAfterMinutes > 0
                      ? <><Pill tone="impact">{t("notifications.escalation_escalateafterminutes_min", { escalateAfterMinutes: c.escalateAfterMinutes })}</Pill> <span className="muted">{t("notifications.if_not_acknowledged")}</span></>
                      : <>{c.events.join(", ")}{c.remindMinutes > 0 && t("notifications.remind_every_remindminutes_min", { remindMinutes: c.remindMinutes })}</>}
                      {` · ${c.minSeverity}+`}{c.allTenants && t("notifications.all_tenants")}{c.skipImpacted && t("notifications.skips_impacted")}
                      {c.routing === "selected" && <div className="muted">{t("notifications.routing.only", { apps: c.applications.map((a) => a.name).join(", ") })}</div>}</td>
                    <td className="small">{c.lastDelivery ? <><Pill tone={c.lastDelivery.status === "sent" ? "up" : c.lastDelivery.status === "failed" ? "down" : "info"}>{c.lastDelivery.status}</Pill> <span className="muted">{new Date(c.lastDelivery.at).toLocaleString(uiLocale())}</span></> : <span className="muted">{t("common.never")}</span>}</td>
                    <td className="actions">
                      <button className="btn btn--small" onClick={() => test(c)}>{t("notifications.send_test")}</button>{" "}
                      <button className="btn btn--small" onClick={async () => setLog({ ch: c, rows: await api.get<DeliveryDto[]>(`/notification-channels/${c.id}/deliveries`) })}>{t("notifications.log")}</button>{" "}
                      <button className="btn btn--small" onClick={() => setEditing(c)}>{t("common.edit")}</button>
                    </td>
                  </tr>
                ))}
                <NoMatch table={table} colSpan={4} />
              </tbody>
            </table>
          )}
        </section>
        <p className="muted small"><T k="notifications.kuma_note" values={{ kuma: <a href="https://github.com/louislam/uptime-kuma" target="_blank" rel="noreferrer">Uptime Kuma</a>, version: KUMA_SOURCE.version }} /></p>
      </div>
      <Dialog wide title={editing === "new" ? t("notifications.add_channel") : t("notifications.edit_channel")} open={editing !== null} onClose={() => setEditing(null)}>
        {editing && <ChannelForm channel={editing === "new" ? undefined : editing} isGlobal={isGlobal} onDone={() => { setEditing(null); void load(); }} />}
      </Dialog>
      <Dialog wide title={t("notifications.delivery_log_p0", { p0: log?.ch.name ?? "" })} open={log !== null} onClose={() => setLog(null)}>
        {log && (log.rows.length === 0 ? <p className="muted">{t("notifications.nothing_sent_yet")}</p> : (
          <table className="table table--dense"><tbody>{log.rows.map((d) => (
            <tr key={d.id}><td className="small nowrap">{new Date(d.createdAt).toLocaleString(uiLocale())}</td><td><Pill tone={d.status === "sent" ? "up" : d.status === "failed" ? "down" : "neutral"}>{d.status}</Pill></td><td className="small">{d.event}</td><td className="small muted">{d.detail}{d.attempts > 1 && t("notifications.attempts_attempts", { attempts: d.attempts })}</td></tr>
          ))}</tbody></table>
        ))}
      </Dialog>
    </>
  );
}

function ChannelForm({ channel, isGlobal, onDone }: { channel?: ChannelDto; isGlobal: boolean; onDone: () => void }) {
  const [type, setType] = useState(channel?.type ?? "email");
  const [config, setConfig] = useState<Record<string, unknown>>(channel?.config ?? {});
  const [form, setForm] = useState({ name: channel?.name ?? "", enabled: channel?.enabled ?? true, minSeverity: channel?.minSeverity ?? "minor", events: channel?.events ?? ["opened", "resolved"], skipImpacted: channel?.skipImpacted ?? false, allTenants: channel?.allTenants ?? false, remindMinutes: String(channel?.remindMinutes ?? 0), escalateAfterMinutes: String(channel?.escalateAfterMinutes ?? 0), routing: channel?.routing ?? "all", locale: channel?.locale ?? "", applicationIds: channel?.applications.map((a) => a.id) ?? [] });
  const [typeFilter, setTypeFilter] = useState("");
  const [apps, setApps] = useState<ApplicationDto[] | null>(null);
  const [defaultLang, setDefaultLang] = useState("en");
  useEffect(() => { api.get<{ locale: string }>("/notify-locale").then((r) => setDefaultLang(r.locale)).catch(() => {}); }, []);
  useEffect(() => { if (!isGlobal) api.get<ApplicationDto[]>("/applications").then(setApps).catch(() => setApps([])); }, [isGlobal]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const def = getChannelType(type)!;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setFields({}); setMessage(null);
    const body = { ...form, type, config, locale: form.locale || null, remindMinutes: Number(form.remindMinutes), escalateAfterMinutes: Number(form.escalateAfterMinutes) };
    try { if (channel) await api.put(`/notification-channels/${channel.id}`, body); else await api.post("/notification-channels", body); onDone(); }
    catch (err) { const r = errorFields(err); setFields(r.fields); setMessage(Object.keys(r.fields).length ? (r.fields.events ?? r.fields.applicationIds ?? t("common.check_the_highlighted_fields")) : r.message); } finally { setBusy(false); }
  }
  const del = async () => { if (channel && confirm(t("notifications.delete_channel_name", { name: channel.name }))) { await api.del(`/notification-channels/${channel.id}`); onDone(); } };
  const toggleEvent = (id: string) => setForm((f) => ({ ...f, events: f.events.includes(id) ? f.events.filter((x) => x !== id) : [...f.events, id] }));

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <div className="grid-2">
        <Field label={t("common.name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={fields.name} placeholder={t("notifications.noc_teams_channel")} />
        <div className="field">
          <label htmlFor="channel-type">{t("common.type")}</label>
          <input type="search" aria-label={t("notifications.filter_channel_types")} placeholder={t("notifications.filter_length_types_telegram_pagerduty_sms", { length: CHANNEL_TYPES.length })} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} />
          <select id="channel-type" value={type} onChange={(e) => { const item = getChannelType(e.target.value)!; setType(item.id); setConfig(Object.fromEntries(item.fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default]))); }}>
            {CHANNEL_GROUPS.map((g) => {
              const items = CHANNEL_TYPES.filter((item) => item.group === g && (item.id === type || !typeFilter || `${item.label} ${item.group}`.toLowerCase().includes(typeFilter.toLowerCase())));
              return items.length ? <optgroup key={g} label={g}>{items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup> : null;
            })}
          </select>
          <span className="field__hint">{def.description}</span>
        </div>
      </div>
      <div className="grid-2">
        {def.fields.filter((f) => fieldVisible(f, config)).map((f) => <ConfigField key={f.key} f={f} saved={channel?.type === type && channel.config[f.key] === "__unchanged__"} value={config[f.key]} error={fields[`config.${f.key}`]} onChange={(v) => setConfig({ ...config, [f.key]: v })} />)}
      </div>
      {!isGlobal && (
        <fieldset className="matrix"><legend>{t("notifications.routing.label")}</legend>
          <div className="stack stack--tight" style={{ padding: "8px 0" }}>
            <label className="check small"><input type="radio" name="routing" checked={form.routing === "all"} onChange={() => setForm({ ...form, routing: "all" })} />{t("notifications.routing.all")}</label>
            <label className="check small"><input type="radio" name="routing" checked={form.routing === "selected"} onChange={() => setForm({ ...form, routing: "selected" })} />{t("notifications.routing.selected")}</label>
            {form.routing === "selected" && (
              <div className="app-pick">
                {apps === null ? <span className="muted small">{t("common.loading")}</span> : apps.length === 0 ? <span className="muted small">{t("notifications.routing.no_apps")}</span> : apps.map((a) => (
                  <label key={a.id} className="check small"><input type="checkbox" checked={form.applicationIds.includes(a.id)}
                    onChange={(e) => setForm({ ...form, applicationIds: e.target.checked ? [...form.applicationIds, a.id] : form.applicationIds.filter((x) => x !== a.id) })} />{a.name}</label>
                ))}
                {fields.applicationIds && <span className="field__error">{fields.applicationIds}</span>}
              </div>
            )}
          </div>
        </fieldset>
      )}
      <label className="field">
        <span>{t("notifications.language")}</span>
        <LanguageSelect value={form.locale} onChange={(v) => setForm({ ...form, locale: v })} allowDefault defaultName={languageName(defaultLang)} />
        <span className="field__hint">{t("notifications.language_hint")}</span>
      </label>
      <fieldset className="matrix"><legend>{t("notifications.what_to_send")}</legend>
        <div className="grid-2" style={{ paddingTop: 8 }}>
          <label className="field">{t("notifications.minimum_severity")}<select value={form.minSeverity} onChange={(e) => setForm({ ...form, minSeverity: e.target.value as "minor" })}><option value="minor">{t("notifications.minor_and_above_everything")}</option><option value="major">{t("notifications.major_and_critical")}</option><option value="critical">{t("notifications.critical_only")}</option></select></label>
          <label className="field">{t("common.when")}
            <select value={form.escalateAfterMinutes} onChange={(e) => setForm({ ...form, escalateAfterMinutes: e.target.value })}>
              <option value="0">{t("notifications.immediately")}</option>
              {[5, 15, 30, 60, 120, 240].map((m) => <option key={m} value={m}>{t("notifications.escalate_not_acknowledged_after_p0", { p0: formatMinutes(m) })}</option>)}
            </select>
            <span className="field__hint">{Number(form.escalateAfterMinutes) > 0 ? t("notifications.escalation_step_gets_the_incident_only_if") : t("notifications.build_an_escalation_chain_with_more")}</span>
          </label>
          {Number(form.escalateAfterMinutes) === 0 && <label className="field">{t("notifications.remind_while_unacknowledged")}<select value={form.remindMinutes} onChange={(e) => setForm({ ...form, remindMinutes: e.target.value })}><option value="0">{t("common.never_2")}</option><option value="15">{t("notifications.every_15_min")}</option><option value="30">{t("notifications.every_30_min")}</option><option value="60">{t("notifications.every_hour")}</option><option value="240">{t("notifications.every_4_hours")}</option></select></label>}
        </div>
        <div className="stack stack--tight" style={{ padding: "10px 0" }}>
          {Number(form.escalateAfterMinutes) === 0 && NOTIFY_EVENTS.map((ev) => <label key={ev.id} className="check small"><input type="checkbox" checked={form.events.includes(ev.id)} onChange={() => toggleEvent(ev.id)} />{ev.label}</label>)}
          <label className="check small"><input type="checkbox" checked={form.skipImpacted} onChange={(e) => setForm({ ...form, skipImpacted: e.target.checked })} />{t("notifications.skip_incidents_caused_by_another_incident")}</label>
          {isGlobal && <label className="check small"><input type="checkbox" checked={form.allTenants} onChange={(e) => setForm({ ...form, allTenants: e.target.checked })} />{t("notifications.also_every_tenant_s_incidents_noc_channel")}</label>}
          <label className="check small"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />{t("common.enabled")}</label>
        </div>
      </fieldset>
      <div className="row-actions" style={{ justifyContent: "space-between" }}>
        {channel ? <button type="button" className="btn btn--danger" onClick={del}>{t("common.delete")}</button> : <span />}
        <button className="btn btn--primary" disabled={busy}>{busy ? t("common.saving") : channel ? t("common.save_changes") : t("notifications.add_channel")}</button>
      </div>
    </form>
  );
}

function ConfigField({ f, value, error, onChange, saved }: { f: ChannelField; value: unknown; error?: string; onChange: (v: unknown) => void; saved: boolean }) {
  const note = error ? <span className="field__error">{error}</span> : f.hint ? <span className="field__hint">{f.hint}</span> : null;
  const wide = f.kind === "textarea" || f.kind === "checkbox" || /template|message|url|webhook/i.test(f.key);
  const cls = `field${f.mono ? " field--mono" : ""}${wide ? " field--span2" : ""}`;
  const label = <span>{f.label}{f.required && <span className="req" aria-hidden="true"> *</span>}</span>;
  if (f.kind === "checkbox") return <label className="check small field--span2"><input type="checkbox" checked={value === true || value === "true"} onChange={(e) => onChange(e.target.checked)} />{f.label}</label>;
  if (f.kind === "select") return <label className={cls}>{label}<select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>{note}</label>;
  if (f.kind === "number") return <label className={cls}>{label}<input type="number" value={value === undefined || value === null ? "" : String(value)} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />{note}</label>;
  if (f.kind === "textarea" || /template/i.test(f.key)) return <label className={cls}>{label}<textarea rows={3} placeholder={f.placeholder} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />{note}</label>;
  if (f.kind === "secret") {
    // a saved secret is never sent to the browser; leaving the field empty keeps it
    return <label className={cls}>{label}<input type="password" autoComplete="off" placeholder={saved ? t("common.saved_leave_empty_to_keep") : f.placeholder} value={value === "__unchanged__" ? "" : String(value ?? "")} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value || (saved ? "__unchanged__" : ""))} />{note}</label>;
  }
  return <label className={cls}>{label}<input type="text" placeholder={f.placeholder} value={String(value ?? "")} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} />{note}</label>;
}
