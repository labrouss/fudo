import { T } from "../components/T";
import { t, uiLocale } from "../i18n";
import type { EffectiveStatus, EntityRef, MonitorStatusValue } from "@fudo/shared";
import { Pill } from "./Status";
import { Link } from "../router";

type ResultStatus = "UP" | "DEGRADED" | "DOWN";
/** Theme tokens (see themes/README.md). */
const COLORS: Record<string, string> = { UP: "var(--st-up)", DEGRADED: "var(--st-degraded)", DOWN: "var(--st-down)", MAINTENANCE: "var(--st-maint)" };
import { STATUS_LABEL } from "../defs";
export { STATUS_LABEL };
const LABEL = STATUS_LABEL;
export const STATUS_TONE: Record<string, "up" | "down" | "warn" | "impact" | "info" | "neutral"> = { UP: "up", DOWN: "down", DEGRADED: "warn", IMPACTED: "impact", MAINTENANCE: "info", UNKNOWN: "neutral" };

/** Any status (monitor, asset, application) including Impacted and Maintenance. */
export function StatusPill({ status, paused }: { status: EffectiveStatus | string; paused?: boolean }) {
  if (paused) return <Pill tone="neutral">{t("common.paused")}</Pill>;
  return <Pill tone={STATUS_TONE[status] ?? "neutral"}>{LABEL[status] ?? status}</Pill>;
}

const refHref = (r: EntityRef) => (r.type === "asset" ? `/assets/${r.id}` : r.type === "monitor" ? `/monitors/${r.id}` : `/applications/${r.id}`);

/** "Impacted by Core-SW-01" / "Down: SQL port" / "At risk: depends on Core-SW-01". */
export function CauseNote({ status, cause, atRisk }: { status: string; cause: EntityRef | null; atRisk: EntityRef | null }) {
  if (cause && status === "IMPACTED") return <span className="cause cause--impact">{t("ui.impacted_by")}{" "}<Link href={refHref(cause)}>{cause.name}</Link>{cause.planned && t("ui.maintenance")}</span>;
  if (cause && status === "DOWN") return <span className="cause cause--down"><T k="ui.failing_cause" values={{ cause: <Link href={refHref(cause)}>{cause.name}</Link> }} /></span>;
  if (atRisk) return <span className="cause cause--risk">{t("ui.at_risk_depends_on")}{" "}<Link href={refHref(atRisk)}>{atRisk.name}</Link></span>;
  return null;
}

export function MonitorStatusPill({ status, paused, retrying }: { status: MonitorStatusValue; paused?: boolean; retrying?: boolean }) {
  if (paused) return <Pill tone="neutral">{t("common.paused")}</Pill>;
  const tone = status === "UP" ? "up" : status === "DOWN" ? "down" : status === "DEGRADED" ? "warn" : "neutral";
  return <Pill tone={tone}>{retrying && status !== "DOWN" ? `${LABEL[status]} · retrying` : LABEL[status]!}</Pill>;
}

/** Kuma-style strip: one bar per check result, newest on the right. Empty slots fill the left. */
export function Heartbeat({ items, slots, height = 22 }: { items: Array<{ s: ResultStatus | "MAINTENANCE"; t: string }>; slots: number; height?: number }) {
  const shown = items.slice(-slots);
  const empty = slots - shown.length;
  return (
    <div className="hb" role="img" aria-label={t("ui.last_length_checks_p1_failed", { length: shown.length, p1: shown.filter((i) => i.s === "DOWN").length })}>
      {Array.from({ length: empty }, (_, i) => <span key={`e${i}`} className="hb__bar hb__bar--empty" style={{ height }} />)}
      {shown.map((i, k) => (
        <span key={k} className="hb__bar" style={{ height, background: COLORS[i.s] }} title={`${new Date(i.t).toLocaleString(uiLocale())} · ${LABEL[i.s]}`} />
      ))}
    </div>
  );
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 10) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export const formatPct = (p: number | null | undefined) => (p === null || p === undefined ? "—" : `${p >= 99.995 ? "100" : p.toFixed(2)}%`);

export function timeAgo(iso: string | null): string {
  if (!iso) return t("common.never");
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return t("time.just_now");
  if (s < 60) return t("time.seconds_ago", { n: s });
  if (s < 3600) return t("time.minutes_ago", { n: Math.round(s / 60) });
  if (s < 86400) return t("time.hours_ago", { n: Math.round(s / 3600) });
  return t("time.days_ago", { n: Math.round(s / 86400) });
}

/** 24 h latency chart: average line, max as a faint line, red ticks where checks failed. */
export function LatencyChart({ series }: { series: Array<{ t: string; avg: number | null; max: number | null; down: number; total: number }> }) {
  const W = 800, H = 170, PAD = 48;
  const end = Date.now();
  const start = end - 24 * 3600_000;
  const x = (item: string) => PAD + ((new Date(item).getTime() - start) / (end - start)) * (W - PAD);
  const peak = Math.max(1, ...series.map((s) => s.max ?? s.avg ?? 0));
  const top = niceCeil(peak);
  const y = (v: number) => H - 20 - (v / top) * (H - 36);
  const line = (key: "avg" | "max") => series.filter((s) => s[key] !== null).map((s) => `${x(s.t).toFixed(1)},${y(s[key]!).toFixed(1)}`).join(" ");
  if (series.length === 0) return <p className="muted chart-empty">{t("ui.no_results_in_the_last_24_hours_yet")}</p>;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("ui.response_time_over_the_last_24_hours")}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PAD} x2={W} y1={y(top * f)} y2={y(top * f)} className="chart__grid" />
          <text x={PAD - 6} y={y(top * f) + 4} className="chart__label" textAnchor="end">{formatAxis(top * f)}</text>
        </g>
      ))}
      {series.filter((s) => s.down > 0).map((s) => (
        <rect key={s.t} x={x(s.t) - 2} y={8} width={4} height={H - 28} className="chart__down" />
      ))}
      <polyline points={line("max")} className="chart__max" />
      <polyline points={line("avg")} className="chart__avg" />
      {series.length < 60 && series.filter((s) => s.avg !== null).map((s) => <circle key={`d${s.t}`} cx={x(s.t)} cy={y(s.avg!)} r={3} className="chart__dot" />)}
      <text x={PAD} y={H - 4} className="chart__label">{t("ui.24_h_ago")}</text>
      <text x={(W + PAD) / 2} y={H - 4} className="chart__label" textAnchor="middle">{t("ui.12_h_ago")}</text>
      <text x={W} y={H - 4} className="chart__label" textAnchor="end">{t("ui.now")}</text>
    </svg>
  );
}

function niceCeil(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((c) => c >= v) ?? v;
}
const formatAxis = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`);
