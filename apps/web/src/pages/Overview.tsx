import { t, uiLocale, formatMinutes, tmsg } from "../i18n";
import { useCallback, useState } from "react";
import { GLOBAL_SCOPE, type DashboardDto, type HealthResponse, type IncidentDto, type MeResponse } from "@fudo/shared";
import { api } from "../api";
import { PageHeader } from "../components/AppShell";
import { Pill } from "../components/Status";
import { CauseNote, StatusPill } from "../components/Monitoring";
import { AvailabilityStrip, AvailabilitySummary } from "../components/Charts";
import { IncidentStatusPill, SeverityPill } from "./incidents/Incidents";
import { Link } from "../router";
import { useLiveReload } from "../live";

const ORDER: Record<string, number> = { DOWN: 0, IMPACTED: 1, DEGRADED: 2, MAINTENANCE: 3, UNKNOWN: 4, UP: 5 };

export function Overview({ me, tenant }: { me: MeResponse; tenant: string | null }) {
  const isGlobal = tenant === GLOBAL_SCOPE;
  const name = isGlobal ? t("common.global_infrastructure") : me.tenants.find((item) => item.id === tenant)?.name;
  return (
    <>
      <PageHeader help="getting-started" title={name ? t("overview.overview_name", { name }) : t("common.overview")} />
      <div className="content">
        {tenant ? <Dashboard isGlobal={isGlobal} /> : (
          <section className="card">
            <h2>{t("overview.no_tenant_selected")}</h2>
            <p className="lead">{me.isSuperadmin ? t("overview.create_a_tenant_for_each_business_unit") : t("overview.ask_an_administrator_for_access_to_a")}</p>
          </section>
        )}
        <SystemStatus />
      </div>
    </>
  );
}

function Dashboard({ isGlobal }: { isGlobal: boolean }) {
  const [d, setD] = useState<DashboardDto | null>(null);
  const [open, setOpen] = useState<IncidentDto[]>([]);
  const load = useCallback(async () => {
    const [dash, inc] = await Promise.all([api.get<DashboardDto>("/dashboard"), api.get<IncidentDto[]>("/incidents?status=active")]);
    setD(dash); setOpen(inc);
  }, []);
  useLiveReload(() => load().catch(() => {}), ["status", "incident", "monitor"]);
  if (!d) return <p className="muted">{t("common.loading")}</p>;
  const m = d.monitors;
  const items = [...d.items].sort((a, b) => (ORDER[a.status]! - ORDER[b.status]!) || a.name.localeCompare(b.name));
  const withSla = d.items.filter((i) => i.availability.pct !== null && i.slaTarget !== null);
  const missed = withSla.filter((i) => i.availability.pct! < i.slaTarget!).length;

  return (
    <>
      <div className="stats">
        <Kpi label={t("overview.open_incidents")} value={d.incidents.open} tone={d.incidents.open ? "down" : undefined} href="/incidents" />
        <Kpi label={t("overview.acknowledged")} value={d.incidents.acknowledged} />
        <Kpi label={t("overview.mttr_30_days")} value={d.incidents.mttrMin === null ? "—" : formatMinutes(d.incidents.mttrMin)} sub={t("overview.resolved_n", { count: d.incidents.resolved30 })} />
        <Kpi label={t("overview.monitors_up")} value={m.UP ?? 0} tone="up" sub={t("overview.failing_degraded", { failing: (m.DOWN ?? 0) + (m.IMPACTED ?? 0), degraded: m.DEGRADED ?? 0 })} href="/monitors" />
        {!isGlobal && <Kpi label={t("overview.sla_30_days")} value={withSla.length ? `${withSla.length - missed}/${withSla.length}` : "—"} tone={missed ? "down" : withSla.length ? "up" : undefined} sub={missed ? t("overview.below_target", { count: missed }) : t("overview.all_on_target")} />}
      </div>

      {open.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>{t("overview.open_incidents")}</h2><Link href="/incidents">{t("overview.all_incidents")}</Link></div>
          <ul className="attention">
            {open.slice(0, 6).map((i) => (
              <li key={i.id} style={{ gridTemplateColumns: "auto auto 1fr auto" }}>
                <SeverityPill s={i.severity} /><IncidentStatusPill i={i} />
                <Link href={`/incidents/${i.id}`} className="strong"><span className="mono">{i.key}</span> {tmsg(i.titleParts, i.title)}</Link>
                <span className="muted small">{i.parent ? t("overview.caused_by_key", { key: i.parent.key }) : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>{isGlobal ? t("overview.shared_infrastructure") : t("common.applications")}{" "}{t("overview.last_30_days")}</h2><Link href={isGlobal ? "/assets" : "/applications"}>{isGlobal ? t("overview.all_assets") : t("overview.all_applications")}</Link></div>
        {items.length === 0 ? <p className="muted">{isGlobal ? t("overview.no_shared_assets_yet") : t("overview.no_applications_yet_group_your_monitors")}</p> : (
          <div className="svc-grid">
            {items.map((i) => (
              <Link key={i.id} href={`/${i.type === "asset" ? "assets" : "applications"}/${i.id}`} className={`svc svc--${i.status}`}>
                <div className="svc__head"><span className="svc__name">{i.name}</span><StatusPill status={i.status} /></div>
                <CauseNote status={i.status} cause={i.cause} atRisk={i.atRisk} />
                <AvailabilitySummary a={i.availability} />
                <AvailabilityStrip a={i.availability} height={20} />
                {i.criticality && <span className={`crit crit--${i.criticality}`}>{t(`criticality.${i.criticality}`)}</span>}
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Kpi({ label, value, sub, tone, href }: { label: string; value: string | number; sub?: string; tone?: "up" | "down"; href?: string }) {
  const body = <><span className="stat__label">{label}</span><span className={`stat__value${tone ? ` stat__value--${tone}` : ""}`}>{value}</span>{sub && <span className="muted small">{sub}</span>}</>;
  return href ? <Link href={href} className="card stat stat--link">{body}</Link> : <div className="card stat">{body}</div>;
}

function SystemStatus() {
  const [h, setH] = useState<HealthResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => api.get<HealthResponse>("/health").then((x) => { setH(x); setFailed(false); }).catch(() => setFailed(true)), []);
  useLiveReload(load, [], 30_000);
  const known = h !== null || failed;
  const Row = ({ label, ok, detail }: { label: string; ok: boolean | null; detail: string }) => (
    <div className="status-row"><span className="status-row__label">{label}</span><span className="status-row__detail">{detail}</span>{ok === null ? <Pill tone="neutral">{t("overview.checking")}</Pill> : ok ? <Pill tone="up">{t("overview.ok")}</Pill> : <Pill tone="down">{t("overview.problem")}</Pill>}</div>
  );
  return (
    <details className="card system">
      <summary><h2>{t("overview.system_status")}</h2>{h && <Pill tone={h.status === "ok" ? "up" : "warn"}>{h.status === "ok" ? t("overview.all_ok") : t("overview.needs_attention")}</Pill>}</summary>
      <Row label="API" ok={known ? !failed : null} detail={h ? `v${h.version}` : ""} />
      <Row label={t("overview.database")} ok={h ? h.db.ok : known ? false : null} detail="PostgreSQL" />
      <Row label={t("overview.timescaledb")} ok={h ? h.db.timescale !== null : known ? false : null} detail={h?.db.timescale ? t("overview.ext_version", { version: h.db.timescale }) : t("overview.ext_missing")} />
      <Row label={t("overview.tenant_isolation")} ok={h ? h.db.rls === true : known ? false : null} detail={h ? (h.db.rls ? t("overview.rls_on") : t("overview.rls_off")) : ""} />
      <Row label={t("overview.worker")} ok={h ? h.worker.ok : known ? false : null} detail={h?.worker.lastHeartbeat ? t("overview.heartbeat", { time: new Date(h.worker.lastHeartbeat).toLocaleTimeString(uiLocale()) }) : t("overview.no_heartbeat")} />
    </details>
  );
}
