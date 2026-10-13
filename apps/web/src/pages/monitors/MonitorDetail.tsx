import { T } from "../../components/T";
import { t, uiLocale, tmsg } from "../../i18n";
import { useLiveReload } from "../../live";
import { useCallback, useEffect, useState } from "react";
import type { MonitorDetail as Detail, TenantPermissions } from "@fudo/shared";
import { getMonitorType } from "../../defs";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { FormError } from "../../components/Field";
import { SeriesChart, MetricChart, TrafficChart } from "../../components/Charts";
import { TrapMonitorCards } from "../traps/TrapCards";
import { Heartbeat, MonitorStatusPill, StatusPill, formatMs, formatPct, timeAgo } from "../../components/Monitoring";
import { StatusBanner } from "../assets/Assets";
import { Pill } from "../../components/Status";
import { Link, navigate } from "../../router";

const TONE: Record<string, "up" | "down" | "warn" | "neutral"> = { UP: "up", DOWN: "down", DEGRADED: "warn", UNKNOWN: "neutral" };
import { STATUS_LABEL as LABEL } from "../../defs";

export function MonitorDetailPage({ id, perms, scopeIsGlobal }: { id: string; perms: TenantPermissions; scopeIsGlobal: boolean }) {
  const [m, setM] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get<Detail>(`/monitors/${id}`).then((d) => { setM(d); setError(null); }).catch((e) => setError(errorFields(e).message)), [id]);
  useLiveReload(load, ["monitor", "status"]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { setError(errorFields(e).message); } finally { setBusy(false); }
  }

  if (!m) return <><PageHeader title={t("monitors.monitor")} /><div className="content">{error ? <FormError message={error} /> : <p className="muted">{t("common.loading")}</p>}</div></>;
  const def = getMonitorType(m.type);

  return (
    <>
      <PageHeader help="monitors" title={m.name}>
        {(m.scope === "global") !== scopeIsGlobal ? <span className="muted small">{t("monitors.shared_monitor_managed_in_the_global_scope")}</span> : <>
        {perms.operate && <button className="btn" disabled={busy} onClick={() => act(() => api.post(`/monitors/${m.id}/${m.paused ? "resume" : "pause"}`))}>{m.paused ? t("monitors.resume") : t("monitors.pause")}</button>}
        {perms.manage && <button className="btn" onClick={() => navigate(`/monitors/${m.id}/clone`)}>{t("monitors.clone")}</button>}
        {perms.manage && <button className="btn" onClick={() => navigate(`/monitors/${m.id}/edit`)}>{t("common.edit")}</button>}
        {perms.manage && (
          <button className="btn btn--danger" disabled={busy} onClick={() => { if (confirm(t("monitors.delete_name_and_its_history", { name: m.name }))) void act(async () => { await api.del(`/monitors/${m.id}`); navigate("/monitors"); }); }}>{t("common.delete")}</button>
        )}</>}
      </PageHeader>
      <div className="content">
        <FormError message={error} />
        {!m.paused && <StatusBanner status={m.effectiveStatus} cause={m.cause} atRisk={m.atRisk} what={t("monitors.this_check")} />}
        <section className="card detail-head">
          <div className="detail-head__main">
            {m.effectiveStatus === "IMPACTED" || m.effectiveStatus === "MAINTENANCE" ? <StatusPill status={m.effectiveStatus} paused={m.paused} /> : <MonitorStatusPill status={m.status} paused={m.paused} retrying={m.failStreak > 0} />}
            {m.scope === "global" && <span className="scope-badge">{t("common.global")}</span>}
            {m.assetId && <Link href={`/assets/${m.assetId}`} className="small">{t("common.checks")}{" "}{m.assetName}</Link>}
            <span className="type-tag">{def?.label ?? m.type}</span>
            <span className="mono">{def?.summary(m.config)}</span>
            {m.credentialName && <Link href="/credentials" className="small" title={t("credentials.title")}>{t("credentials.uses_name", { name: m.credentialName })}</Link>}
          </div>
          <p className="detail-head__msg">{m.lastMessage ? tmsg(m.lastMessageParts, m.lastMessage) : t("monitors.waiting_for_the_first_check")}</p>
          <p className="muted small">
            {t("monitors.detail.schedule", { ago: timeAgo(m.lastCheckAt), interval: m.intervalS, fails: m.failuresBeforeDown })}
            {m.statusChangedAt && <> · {LABEL[m.status]}{" "}{t("monitors.since")}{" "}{new Date(m.statusChangedAt).toLocaleString(uiLocale())}</>}
            {m.failStreak > 0 && m.status !== "DOWN" && <> · <strong>{t("monitors.detail.failing", { streak: m.failStreak, limit: m.failuresBeforeDown, retry: m.retryIntervalS })}</strong></>}
          </p>
          {m.tags.length > 0 && <div className="chips">{m.tags.map((item) => <span key={item} className="chip">{item}</span>)}</div>}
          {m.description && <p className="small">{m.description}</p>}
        </section>

        <div className="stats">
          <Stat label={t("monitors.uptime_24_h")} value={formatPct(m.uptime.h24)} />
          <Stat label={t("monitors.uptime_7_days")} value={formatPct(m.uptime.d7)} />
          <Stat label={t("monitors.uptime_30_days")} value={formatPct(m.uptime.d30)} />
          <Stat label={t("monitors.avg_response_24_h")} value={formatMs(m.avgLatency24h)} />
          <Stat label={t("monitors.last_response")} value={formatMs(m.lastLatencyMs)} />
        </div>

        {m.type === "push" && m.pushUrl && <PushCard url={m.pushUrl} canRotate={perms.manage} onRotate={() => act(() => api.post(`/monitors/${m.id}/push-token`))} />}

        <section className="card">
          <div className="card-head"><h2>{t("monitors.recent_checks")}</h2><span className="muted small">{t("monitors.detail.last_n", { count: m.results.length })}</span></div>
          <Heartbeat items={[...m.results].reverse().map((r) => ({ s: r.status, t: r.ts }))} slots={100} height={28} />
        </section>

        {m.type === "redfish-temperature"
          ? <MetricChart monitorId={m.id} metric="temperatureC" unit="°C" title={t("temp.chart")} thresholds={[
              { value: Number(m.config.warnC ?? 27), tone: "warn", label: t("temp.limit_warn", { value: Number(m.config.warnC ?? 27) }) },
              { value: Number(m.config.criticalC ?? 32), tone: "down", label: t("temp.limit_down", { value: Number(m.config.criticalC ?? 32) }) }]} />
          : m.type === "snmp-interface"
          ? <TrafficChart monitorId={m.id} warnPct={Number(m.config.warnPct ?? 80)} criticalPct={Number(m.config.criticalPct ?? 0)} speedMbps={Number(m.config.speedMbps) > 0 ? Number(m.config.speedMbps) : null} />
          : m.type === "snmp-trap" ? <TrapMonitorCards monitorId={m.id} canClear={perms.operate} />
          : m.type !== "push" && <SeriesChart monitorId={m.id} />}

        <div className="two-col">
          <section className="card card--flush">
            <div className="card-head card-head--pad"><h2>{t("monitors.status_changes")}</h2></div>
            {m.events.length === 0 ? <p className="muted pad">{t("common.no_changes_yet")}</p> : (
              <table className="table table--dense">
                <tbody>
                  {m.events.map((e, i) => (
                    <tr key={i}>
                      <td className="nowrap muted small">{new Date(e.ts).toLocaleString(uiLocale())}</td>
                      <td className="nowrap"><Pill tone={TONE[e.from] ?? "neutral"}>{LABEL[e.from] ?? e.from}</Pill> <span className="flip-rtl">→</span> <Pill tone={TONE[e.to] ?? "neutral"}>{LABEL[e.to] ?? e.to}</Pill></td>
                      <td className="small">{tmsg(e.messageParts, e.message)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="card card--flush">
            <div className="card-head card-head--pad"><h2>{t("monitors.latest_results")}</h2></div>
            <table className="table table--dense">
              <tbody>
                {m.results.slice(0, 12).map((r, i) => (
                  <tr key={i}>
                    <td className="nowrap muted small">{new Date(r.ts).toLocaleTimeString(uiLocale())}</td>
                    <td><Pill tone={TONE[r.status] ?? "neutral"}>{LABEL[r.status] ?? r.status}</Pill></td>
                    <td className="num mono small">{formatMs(r.latencyMs)}</td>
                    <td className="small">{tmsg(r.messageParts, r.message)}</td>
                  </tr>
                ))}
                {m.results.length === 0 && <tr><td className="muted">{t("monitors.no_results_yet")}</td></tr>}
              </tbody>
            </table>
          </section>
        </div>
        <p className="muted small"><Link href="/monitors">{t("monitors.all_monitors")}</Link></p>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="card stat"><span className="stat__label">{label}</span><span className="stat__value">{value}</span></div>;
}

function PushCard({ url, canRotate, onRotate }: { url: string; canRotate: boolean; onRotate: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="card">
      <div className="card-head"><h2>{t("monitors.push_url")}</h2>{canRotate && <button className="btn btn--small" onClick={() => { if (confirm(t("monitors.create_a_new_url_the_current_one_stops"))) onRotate(); }}>{t("monitors.new_url")}</button>}</div>
      <p className="muted small"><T k="monitors.push.help" values={{ down: <code>?status=down&amp;msg=…</code>, ping: <code>&amp;ping=</code> }} /></p>
      <div className="copy-row"><input readOnly value={url} aria-label={t("monitors.push_url")} onFocus={(e) => e.target.select()} /><button className="btn" onClick={() => { void navigator.clipboard?.writeText(url); setCopied(true); }}>{copied ? t("common.copied") : t("common.copy")}</button></div>
      <pre className="snippet">{`# Linux / cron\ncurl -fsS -m 10 "${url}?msg=backup%20ok"\n\n# PowerShell / Task Scheduler\nInvoke-RestMethod -Uri "${url}?msg=backup ok" -TimeoutSec 10`}</pre>
    </section>
  );
}
