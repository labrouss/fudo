import { severityLabel } from "../../defs";
import { SEVERITY_RANK, SortTh, time, useTable } from "../../components/Table";
import { T } from "../../components/T";
import { t, uiLocale, formatMinutes, tmsg } from "../../i18n";
import { useLiveReload } from "../../live";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { IncidentDetail, IncidentDto, TenantPermissions } from "@fudo/shared";
import { api, errorFields, apiTenant } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { FormError } from "../../components/Field";
import { Pill } from "../../components/Status";
import { StatusPill, timeAgo } from "../../components/Monitoring";
import { Link, navigate } from "../../router";

const SEV_TONE = { critical: "down", major: "impact", minor: "warn" } as const;
export const SeverityPill = ({ s }: { s: IncidentDto["severity"] }) => <Pill tone={SEV_TONE[s]}>{severityLabel(s)}</Pill>;
export function IncidentStatusPill({ i }: { i: Pick<IncidentDto, "status" | "snoozedUntil"> }) {
  if (i.status === "resolved") return <Pill tone="up">{t("incidents.resolved")}</Pill>;
  const snoozed = i.snoozedUntil && new Date(i.snoozedUntil) > new Date();
  return <Pill tone={i.status === "acknowledged" ? "info" : "down"}>{`${i.status === "acknowledged" ? t("overview.acknowledged") : t("incidents.open")}${snoozed ? ` · ${t("incidents.snoozed")}` : ""}`}</Pill>;
}
const entityHref = (item: string, id: string) => (item === "asset" ? `/assets/${id}` : item === "application" ? `/applications/${id}` : `/monitors/${id}`);

function duration(from: string, to: string | null) {
  const m = Math.round(((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 60000);
  return formatMinutes(m);
}

export function IncidentList() {
  const [tab, setTab] = useState<"active" | "resolved">("active");
  const [q, setQ] = useState("");
  const [list, setList] = useState<IncidentDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.get<IncidentDto[]>(`/incidents?status=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`).then((l) => { setList(l); setError(null); }).catch((e) => setError(errorFields(e).message)), [tab, q]);
  useLiveReload(load, ["incident"]);
  const STATE_RANK: Record<string, number> = { open: 0, acknowledged: 1, resolved: 2 };
  const table = useTable("incidents", list, {
    severity: { value: (i) => SEVERITY_RANK[i.severity] },
    title: { value: (i) => i.number },
    status: { value: (i) => STATE_RANK[i.status] },
    affected: { value: (i) => i.entityName },
    started: { value: (i) => time(i.openedAt), desc: true },
    duration: { value: (i) => (time(i.resolvedAt) ?? Date.now()) - time(i.openedAt)!, desc: true },
  });
  return (
    <>
      <PageHeader help="incidents" title={t("common.incidents")}>
        <input type="search" className="search" placeholder={t("incidents.search_title_inc_number_tag")} aria-label={t("incidents.search_incidents")} value={q} onChange={(e) => setQ(e.target.value)} />
      </PageHeader>
      <div className="content">
        <FormError message={error} />
        <div className="filters" role="tablist">
          {(["active", "resolved"] as const).map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "filter filter--on" : "filter"} onClick={() => setTab(item)}>{item === "active" ? t("incidents.open") : t("incidents.resolved")}</button>)}
        </div>
        <section className="card card--flush">
          {list && list.length === 0 ? <div className="empty"><p>{tab === "active" ? t("incidents.no_open_incidents_incidents_open") : t("incidents.no_resolved_incidents_match")}</p></div> : (
            <table className="table">
              <thead><tr><SortTh table={table} col="severity">{t("incidents.severity")}</SortTh><SortTh table={table} col="title">{t("incidents.incident")}</SortTh><SortTh table={table} col="status">{t("common.status")}</SortTh><SortTh table={table} col="affected">{t("incidents.affected")}</SortTh><SortTh table={table} col="started">{t("incidents.started")}</SortTh><SortTh table={table} col="duration" className="num">{t("incidents.duration")}</SortTh></tr></thead>
              <tbody>
                {table.rows.map((i) => (
                  <tr key={i.id} className="row-link" onClick={() => navigate(`/incidents/${i.id}`)}>
                    <td><SeverityPill s={i.severity} /></td>
                    <td>
                      <Link href={`/incidents/${i.id}`} className="strong row-link__a" onClick={(e) => e.stopPropagation()}><span className="mono">{i.key}</span> {tmsg(i.titleParts, i.title)}</Link>
                      {i.parent && <div className="small cause cause--impact">{t("incidents.caused_by")}{" "}{i.parent.key}</div>}
                      {i.childCount > 0 && <div className="small muted">{t("incidents.root_of_n", { count: i.childCount })}</div>}
                      {i.tags.length > 0 && <div className="chips chips--small">{i.tags.map((item) => <span key={item} className="chip">{item}</span>)}</div>}
                    </td>
                    <td><IncidentStatusPill i={i} />{i.acknowledgedBy && i.status !== "resolved" && <div className="muted small">{t("incidents.by")}{" "}{i.acknowledgedBy}</div>}</td>
                    <td className="small">{i.entityName}<div className="muted">{i.entityType}{i.tenantName ? ` · ${i.tenantName}` : ""}</div></td>
                    <td className="small nowrap">{timeAgo(i.openedAt)}</td>
                    <td className="num small">{duration(i.openedAt, i.resolvedAt)}</td>
                  </tr>
                ))}
                {list && list.length >= 200 && <tr><td colSpan={6} className="muted small">{t(tab === "active" ? "incidents.limit_note_open" : "incidents.limit_note_resolved", { n: list.length })}</td></tr>}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

const NOTE_LABEL = { comment: t("incidents.note.comment"), action: t("incidents.note.action"), resolution: t("incidents.note.resolution") } as const;
const KIND_LABEL: Record<string, string> = Object.fromEntries(["escalated", "opened", "reopened", "status", "linked", "acknowledged", "snoozed", "resolved"].map((k) => [k, t(`incidents.kind.${k}`)]));

export function IncidentDetailPage({ id, perms, scopeIsGlobal }: { id: string; perms: TenantPermissions; scopeIsGlobal: boolean }) {
  const [i, setI] = useState<IncidentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ type: "comment" | "action" | "resolution"; body: string; tags: string }>({ type: "comment", body: "", tags: "" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get<IncidentDetail>(`/incidents/${id}`).then((d) => { setI(d); setError(null); }).catch((e) => setError(errorFields(e).message)), [id]);
  useLiveReload(load, ["incident"]);
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); await load(); } catch (e) { setError(errorFields(e).message); } finally { setBusy(false); } };

  if (!i) return <><PageHeader title={t("incidents.incident")} /><div className="content">{error ? <FormError message={error} /> : <p className="muted">{t("common.loading")}</p>}</div></>;
  const owned = (i.scope === "global") === scopeIsGlobal;
  const canAct = perms.operate && owned;
  const stillFailing = i.entityNow === "DOWN" || i.entityNow === "IMPACTED";

  async function submitNote(e: FormEvent) {
    e.preventDefault();
    await act(async () => { await api.post(`/incidents/${i!.id}/notes`, { type: note.type, body: note.body, tags: note.tags.split(",").map((item) => item.trim()).filter(Boolean) }); setNote({ type: note.type, body: "", tags: "" }); });
  }

  return (
    <>
      <PageHeader help="incidents" title={`${i.key} · ${tmsg(i.titleParts, i.title)}`}>
        <select className="btn" aria-label={t("pm.download")} value="" onChange={(e) => { const f = e.target.value; if (f) void downloadReport(i.id, f, setError); }}>
          <option value="">{t("pm.download")}</option><option value="pdf">{t("pm.download_pdf")}</option><option value="md">{t("pm.download_md")}</option>
        </select>
        {canAct && i.status === "open" && <button className="btn" disabled={busy} onClick={() => act(() => api.post(`/incidents/${i.id}/ack`))}>{t("incidents.acknowledge")}</button>}
        {canAct && i.status !== "resolved" && (
          <select className="btn" aria-label={t("incidents.snooze_notifications")} value="" disabled={busy} onChange={(e) => e.target.value && act(() => api.post(`/incidents/${i.id}/snooze`, { minutes: Number(e.target.value) }))}>
            <option value="">{t("incidents.snooze")}</option><option value="30">{t("incidents.30_minutes")}</option><option value="60">{t("incidents.1_hour")}</option><option value="240">{t("incidents.4_hours")}</option><option value="1440">{t("incidents.1_day")}</option>
          </select>
        )}
        {canAct && i.status !== "resolved" && (
          <button className="btn btn--primary" disabled={busy || stillFailing} title={stillFailing ? t("incidents.resolves_automatically_when_it_recovers") : undefined}
            onClick={() => act(() => api.post(`/incidents/${i.id}/resolve`, { note: note.type === "resolution" ? note.body : "" }))}>{t("incidents.resolve")}</button>
        )}
      </PageHeader>
      <div className="content">
        <FormError message={error} />
        {i.parent && <div className="banner banner--impact"><strong>{t("incidents.caused_by")}{" "}<Link href={`/incidents/${i.parent.id}`}>{i.parent.key}</Link></strong><span>{t("incidents.parent_hint", { title: tmsg(i.parent.titleParts, i.parent.title), name: i.entityName })}</span></div>}
        {(i.children.length > 0 || i.hiddenChildren > 0) && (
          <div className={i.status === "resolved" ? "banner banner--maint" : "banner banner--down"} style={{ flexDirection: "column", alignItems: "stretch" }}>
            <strong>{t(i.status === "resolved" ? "incidents.was_root_cause_of_n" : "incidents.root_cause_of_n", { count: i.children.length + i.hiddenChildren })}</strong>
            <span className="chips">{i.children.map((c) => <Link key={c.id} href={`/incidents/${c.id}`} className="chip">{c.key} {tmsg(c.titleParts, c.title)}{c.tenantName ? ` · ${c.tenantName}` : ""}</Link>)}{i.hiddenChildren > 0 && <span className="chip">+{i.hiddenChildren}{" "}{t("incidents.in_other_tenants")}</span>}</span>
          </div>
        )}
        <section className="card detail-head">
          <div className="detail-head__main"><SeverityPill s={i.severity} /><IncidentStatusPill i={i} />{i.scope === "global" && <span className="scope-badge">{t("common.global")}</span>}
            <span className="small"><T k="incidents.affected_line" values={{ item: <Link href={entityHref(i.entityType, i.entityId)}>{i.entityName}</Link>, type: t(`incidents.entity.${i.entityType}`), status: <StatusPill status={i.entityNow ?? "UNKNOWN"} /> }} /></span></div>
          <p className="muted small">{t("incidents.opened_at", { when: new Date(i.openedAt).toLocaleString(uiLocale()) })} · {i.status === "resolved" ? (i.resolvedBy ? t("incidents.resolved_after_by", { duration: duration(i.openedAt, i.resolvedAt), who: i.resolvedBy }) : t("incidents.resolved_after_auto", { duration: duration(i.openedAt, i.resolvedAt) })) : t("incidents.open_for_duration", { duration: duration(i.openedAt, null) })}
            {i.acknowledgedBy && t("incidents.acknowledged_by_acknowledgedby", { acknowledgedBy: i.acknowledgedBy })}{i.snoozedUntil && new Date(i.snoozedUntil) > new Date() && t("incidents.notifications_snoozed_until_p0", { p0: new Date(i.snoozedUntil).toLocaleTimeString(uiLocale()) })}</p>
          {i.owner && <p className="small owner-line"><span className="muted">{t("teams.owner")}:</span> <span className="strong">{i.owner.team}</span>
            {i.owner.leads.length > 0 && <> · {t("teams.lead_names", { names: i.owner.leads.join(", ") })}</>}
            {i.owner.via && <span className="muted"> ({t("teams.via", { name: i.owner.via.name })})</span>}</p>}
          {i.tags.length > 0 && <div className="chips">{i.tags.map((item) => <span key={item} className="chip">{item}</span>)}</div>}
          {i.pages.length > 0 && (
            <div className="paged small"><span className="muted">{t("oncall.paged")}:</span>
              {i.pages.map((p, n) => <span key={n} className="paged__who"><span className="strong">{p.name}</span> <span className="muted">({t(`oncall.target.${p.reason}`)})</span>
                {p.sent.map((s, j) => <span key={j} className={s.ok ? "paged__ok" : "paged__fail"} title={new Date(s.at).toLocaleString(uiLocale())}>{t(`profile.type.${s.channel}`)} {s.ok ? "✓" : "✗"}</span>)}</span>)}
            </div>
          )}
        </section>

        <div className="incident-grid">
          <section className="card">
            <h2>{t("incidents.timeline")}</h2>
            <ol className="timeline">
              {i.events.map((e) => (
                <li key={e.id} className={`tl tl--${e.kind === "note" ? e.noteType : e.kind}`}>
                  <span className="tl__time">{new Date(e.ts).toLocaleString(uiLocale())}</span>
                  <div className="tl__body">
                    <span className="tl__kind">{e.kind === "note" ? NOTE_LABEL[e.noteType ?? "comment"] : KIND_LABEL[e.kind] ?? e.kind}{e.userName && <span className="muted"> · {e.userName}</span>}</span>
                    <p>{tmsg(e.bodyParts, e.body)}</p>
                  </div>
                </li>
              ))}
            </ol>
            {canAct && (
              <form className="composer" onSubmit={submitNote}>
                <div role="radiogroup" aria-label={t("incidents.note_type")} className="composer__types">
                  {(Object.keys(NOTE_LABEL) as Array<keyof typeof NOTE_LABEL>).map((item) => (
                    <button type="button" key={item} role="radio" aria-checked={note.type === item} className={note.type === item ? "filter filter--on" : "filter"} onClick={() => setNote({ ...note, type: item })}>{NOTE_LABEL[item]}</button>
                  ))}
                </div>
                <textarea aria-label={t("incidents.note")} rows={3} placeholder={note.type === "resolution" ? t("incidents.what_fixed_it_this_is_shown_on_future") : note.type === "action" ? t("incidents.what_did_you_do_or_check") : t("incidents.add_a_comment")} value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} />
                <div className="composer__foot">
                  <input aria-label={t("common.tags")} placeholder={t("incidents.tags_e_g_supervisor_firmware")} value={note.tags} onChange={(e) => setNote({ ...note, tags: e.target.value })} />
                  <button className="btn btn--primary" disabled={busy || !note.body.trim()}>{t("incidents.post")}{" "}{NOTE_LABEL[note.type].toLowerCase()}</button>
                </div>
              </form>
            )}
          </section>

          <div className="stack">
            <section className="card">
              <h2>{t("incidents.similar_past_incidents")}</h2>
              {i.similar.length === 0 ? <p className="muted small">{t("incidents.none_yet_resolution_notes_you_write_now")}</p> : i.similar.map((s) => (
                <div key={s.id} className="similar">
                  <div className="similar__head"><Link href={`/incidents/${s.id}`} className="mono small">{s.key}</Link><span className="chips">{(s.reasonParts?.length ? s.reasonParts.map((p) => tmsg([p])) : s.reasons).map((r) => <span key={r} className="chip chip--strong">{r}</span>)}</span></div>
                  <span className="small strong">{tmsg(s.titleParts, s.title)}</span>
                  <span className="muted small">{new Date(s.resolvedAt).toLocaleDateString(uiLocale())} · {formatMinutes(s.durationMin)}</span>
                  {s.actions.length > 0 && <ol className="small similar__actions">{s.actions.map((a, k) => <li key={k}>{a}</li>)}</ol>}
                  {s.resolution && <p className="small similar__res"><strong>{t("incidents.resolution")}</strong> {s.resolution}</p>}
                  {canAct && (s.resolution || s.actions.length > 0) && <button className="btn btn--link small" onClick={() => setNote({ type: "action", body: [...s.actions, s.resolution].filter(Boolean).map((x) => `- ${x}`).join("\n"), tags: "" })}>{t("incidents.copy_to_a_note")}</button>}
                </div>
              ))}
            </section>
            <section className="card">
              <h2>{t("common.notifications")}</h2>
              {i.deliveries.length === 0 ? <p className="muted small">{t(scopeIsGlobal ? "incidents.no_notifications" : "incidents.no_notifications_tenant")}</p> : (
                <ul className="deliveries">
                  {i.deliveries.map((d) => (
                    <li key={d.id}><Pill tone={d.status === "sent" ? "up" : d.status === "failed" ? "down" : d.status === "suppressed" ? "neutral" : "info"}>{d.status}</Pill>
                      <span className="small"><strong>{d.channelName}</strong> · {d.event}<br /><span className="muted">{new Date(d.createdAt).toLocaleTimeString(uiLocale())}{d.detail && ` · ${d.detail}`}</span></span></li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

/** Post-incident report (PDF or Markdown) through fetch, so the tenant header is sent. */
async function downloadReport(id: string, format: string, setError: (m: string | null) => void) {
  setError(null);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await fetch(`/api/incidents/${id}/report?format=${format}&tz=${encodeURIComponent(tz)}`, { headers: { "x-fudo-lang": document.documentElement.lang, "x-fudo-tenant": apiTenant() ?? "" } });
  if (!res.ok) { setError((await res.json().catch(() => ({ message: t("reports.download_failed") }))).message); return; }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `incident.${format}`;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
