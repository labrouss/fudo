import { t, tmsg } from "../../i18n";
import { useCallback, useMemo, useState } from "react";
import { useLiveReload } from "../../live";
import type { MonitorDto, TenantPermissions } from "@fudo/shared";
import { getMonitorType } from "../../defs";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { FormError } from "../../components/Field";
import { CauseNote, Heartbeat, MonitorStatusPill, StatusPill, formatMs, formatPct, timeAgo } from "../../components/Monitoring";
import { Link, navigate } from "../../router";
import { Dialog } from "../../components/Dialog";
import { BulkAdd } from "./BulkAdd";
import { NoMatch, SortTh, STATUS_RANK, TableFilter, time, useTable } from "../../components/Table";

type Filter = "all" | "UP" | "DEGRADED" | "DOWN" | "paused";

export function useMonitors(_legacyRefreshMs?: number) {
  const [monitors, setMonitors] = useState<MonitorDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.get<MonitorDto[]>("/monitors").then((m) => { setMonitors(m); setError(null); }).catch((e) => setError(errorFields(e).message)), []);
  useLiveReload(load, ["monitor", "status"]);
  return { monitors, error, reload: load };
}

export function MonitorList({ perms, isGlobal = false }: { perms: TenantPermissions; isGlobal?: boolean }) {
  const { monitors, error, reload } = useMonitors();
  const [bulk, setBulk] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c = { all: 0, UP: 0, DEGRADED: 0, DOWN: 0, paused: 0 };
    for (const m of monitors ?? []) {
      c.all++;
      if (m.paused) c.paused++;
      else if (m.status in c) c[m.status as "UP"]++;
    }
    return c;
  }, [monitors]);

  const byStatus = useMemo(() => (monitors ?? []).filter((m) => (filter === "paused" ? m.paused : filter === "all" || (!m.paused && m.status === filter))), [monitors, filter]);
  const table = useTable("monitors", byStatus, {
    status: { value: (m) => (m.paused ? STATUS_RANK.PAUSED : STATUS_RANK[m.effectiveStatus === "IMPACTED" || m.effectiveStatus === "MAINTENANCE" ? m.effectiveStatus : m.status]) },
    name: { value: (m) => m.name },
    asset: { value: (m) => m.assetName },
    apps: { value: (m) => m.applications.map((a) => a.name).join(", ") },
    uptime: { value: (m) => m.uptime24h },
    response: { value: (m) => m.lastLatencyMs, desc: true },
    last: { value: (m) => time(m.lastCheckAt), desc: true },
  }, { text: (m) => `${getMonitorType(m.type)?.label ?? ""} ${getMonitorType(m.type)?.summary(m.config) ?? ""} ${m.tags.join(" ")}` });
  const shown = table.rows;

  const FILTERS: Array<[Filter, string]> = [["all", t("common.all")], ["DOWN", t("status.DOWN")], ["DEGRADED", t("status.DEGRADED")], ["UP", t("status.UP")], ["paused", t("status.PAUSED")]];

  return (
    <>
      <PageHeader help="monitors" title={t("common.monitors")}>
        <TableFilter table={table} placeholder={t("monitors.filter_placeholder")} label={t("monitors.search_monitors")} />
        {perms.manage && <button className="btn" onClick={() => setBulk(true)}>{t("monitors.bulk_add_templates")}</button>}
        {perms.manage && <button className="btn btn--primary" onClick={() => navigate("/monitors/new")}>{t("common.add_monitor")}</button>}
      </PageHeader>
      <div className="content">
        <FormError message={error} />
        <div className="filters" role="group" aria-label={t("monitors.filter_by_status")}>
          {FILTERS.map(([f, label]) => (
            <button key={f} className={filter === f ? "filter filter--on" : "filter"} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {label} <span className="filter__n">{counts[f]}</span>
            </button>
          ))}
        </div>
        <section className="card card--flush">
          {monitors && monitors.length === 0 ? (
            <div className="empty">
              <p>{t("monitors.no_monitors_in_this_tenant_yet_add_one_to")}</p>
              {perms.manage && <button className="btn btn--primary" onClick={() => navigate("/monitors/new")}>{t("monitors.add_the_first_monitor")}</button>}
            </div>
          ) : (
            <table className="table">
              <thead><tr>
                <SortTh table={table} col="status">{t("common.status")}</SortTh><SortTh table={table} col="name">{t("monitors.monitor")}</SortTh>
                <SortTh table={table} col="asset">{t("common.asset")}</SortTh><SortTh table={table} col="apps">{t("common.applications")}</SortTh>
                <th>{t("monitors.recent_checks")}</th><SortTh table={table} col="uptime" className="num">{t("monitors.uptime_24_h")}</SortTh>
                <SortTh table={table} col="response" className="num">{t("monitors.response")}</SortTh><SortTh table={table} col="last">{t("monitors.last_check")}</SortTh>
              </tr></thead>
              <tbody>
                {shown.map((m) => {
                  const def = getMonitorType(m.type);
                  return (
                    <tr key={m.id} className="row-link" onClick={() => navigate(`/monitors/${m.id}`)}>
                      <td>{m.effectiveStatus === "IMPACTED" || m.effectiveStatus === "MAINTENANCE" ? <StatusPill status={m.effectiveStatus} paused={m.paused} /> : <MonitorStatusPill status={m.status} paused={m.paused} retrying={m.failStreak > 0} />}</td>
                      <td>
                        <Link href={`/monitors/${m.id}`} className="strong row-link__a" onClick={(e) => e.stopPropagation()}>{m.name}</Link>
                        <div className="muted small"><span className="type-tag">{def?.label ?? m.type}</span> <span className="mono">{def?.summary(m.config)}</span></div>
                        <CauseNote status={m.effectiveStatus} cause={m.cause} atRisk={m.atRisk} />
                        {m.tags.length > 0 && <div className="chips chips--small">{m.tags.map((item) => <span key={item} className="chip">{item}</span>)}</div>}
                      </td>
                      <td className="small">{m.assetId ? <Link href={`/assets/${m.assetId}`} onClick={(e) => e.stopPropagation()}>{m.assetName}</Link> : <span className="muted">—</span>}</td>
                      <td>{m.applications.length ? <div className="chips chips--small">{m.applications.map((a) => (
                        <Link key={a.id} href={`/applications/${a.id}`} className={`chip chip--link${a.required ? "" : " chip--optional"}`} title={a.required ? undefined : t("apps.optional")} onClick={(e) => e.stopPropagation()}>{a.name}{!a.required && <span className="sr-only"> ({t("apps.optional")})</span>}</Link>))}</div>
                        : <span className="muted small">—</span>}</td>
                      <td><Heartbeat items={m.recent} slots={24} /></td>
                      <td className="num mono">{formatPct(m.uptime24h)}</td>
                      <td className="num mono">{formatMs(m.lastLatencyMs)}</td>
                      <td className="muted small" title={tmsg(m.lastMessageParts, m.lastMessage)}>{timeAgo(m.lastCheckAt)}</td>
                    </tr>
                  );
                })}
                <NoMatch table={table} colSpan={8} />
                {monitors && monitors.length > 0 && byStatus.length === 0 && <tr><td colSpan={8} className="muted">{t("monitors.no_monitors_match")}</td></tr>}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <Dialog wide title={t("monitors.bulk_add_monitors")} open={bulk} onClose={() => setBulk(false)}>{bulk && <BulkAdd isGlobal={isGlobal} onDone={() => { setBulk(false); void reload(); }} />}</Dialog>
    </>
  );
}
