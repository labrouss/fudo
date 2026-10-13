import { t, uiLocale, formatMinutes } from "../i18n";
import { useCallback, useState } from "react";
import type { AvailabilityDto, ChartRange, SeriesDto } from "@fudo/shared";
import { api } from "../api";
import { useLiveReload } from "../live";

const RANGES: ChartRange[] = ["1h", "6h", "24h", "7d", "30d", "90d"];
const fmtMs = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`);
const niceCeil = (v: number) => { const p = 10 ** Math.floor(Math.log10(Math.max(v, 1))); return [1, 2, 5, 10].map((m) => m * p).find((c) => c >= v) ?? v; };

function timeLabel(item: number, range: ChartRange) {
  const d = new Date(item);
  if (range === "1h" || range === "6h" || range === "24h") return d.toLocaleTimeString(uiLocale(), { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(uiLocale(), { day: "numeric", month: "short" });
}

/** Response time over a selectable range: average, p95 and max, failed checks as red bands (F-502/F-503). */
export function SeriesChart({ monitorId }: { monitorId: string }) {
  const [range, setRange] = useState<ChartRange>("24h");
  const [data, setData] = useState<SeriesDto | null>(null);
  const load = useCallback(() => api.get<SeriesDto>(`/monitors/${monitorId}/series?range=${range}`).then(setData).catch(() => {}), [monitorId, range]);
  useLiveReload(load, range === "1h" || range === "6h" || range === "24h" ? ["monitor"] : [], 300_000);

  const W = 820, H = 190, L = 52, B = 22;
  const from = data ? new Date(data.from).getTime() : 0, to = data ? new Date(data.to).getTime() : 1;
  const pts = data?.points ?? [];
  // scale to the 98th percentile so one slow check does not flatten the chart; outliers clip at the top
  const vals = pts.flatMap((p) => [p.p95 ?? p.avg ?? 0]).sort((a, b) => a - b);
  const q98 = vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.98))]! : 1;
  const maxAvg = Math.max(1, ...pts.map((p) => p.avg ?? 0));
  const top = niceCeil(Math.max(q98, maxAvg) * 1.15);
  const x = (item: string) => L + ((new Date(item).getTime() - from) / (to - from)) * (W - L);
  const y = (v: number) => H - B - (Math.min(v, top) / top) * (H - B - 10);
  const line = (k: "avg" | "p95") => pts.filter((p) => p[k] !== null).map((p) => `${x(p.t).toFixed(1)},${y(p[k]!).toFixed(1)}`).join(" ");
  const bw = Math.max(2, (W - L) / Math.max(pts.length, 1));

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t("ui.response_time")}</h2>
        <div className="seg" role="group" aria-label={t("ui.time_range")}>
          {RANGES.map((r) => <button key={r} className={r === range ? "seg__btn seg__btn--on" : "seg__btn"} aria-pressed={r === range} onClick={() => setRange(r)}>{r}</button>)}
        </div>
      </div>
      {!data ? <p className="muted small">{t("common.loading")}</p> : pts.length === 0 ? <p className="muted small">{t("ui.no_results_in_this_range_yet")}</p> : (
        <>
          <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("ui.response_time_last_range", { range })}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}><line x1={L} x2={W} y1={y(top * f)} y2={y(top * f)} className="chart__grid" /><text x={L - 6} y={y(top * f) + 4} className="chart__label" textAnchor="end">{fmtMs(top * f)}</text></g>
            ))}
            {pts.filter((p) => p.down > 0).map((p) => <rect key={`d${p.t}`} x={x(p.t)} y={8} width={bw} height={H - B - 8} className="chart__down" opacity={Math.min(1, 0.3 + p.down / Math.max(p.total, 1))}><title>{t("ui.chart.failed_of", { down: p.down, total: p.total })}</title></rect>)}
            {pts.filter((p) => p.maint > 0 && p.maint === p.total).map((p) => <rect key={`m${p.t}`} x={x(p.t)} y={8} width={bw} height={H - B - 8} className="chart__maint" />)}
            <polyline points={line("p95")} className="chart__p95" />
            <polyline points={line("avg")} className="chart__avg" />
            {pts.length < 40 && pts.filter((p) => p.avg !== null).map((p) => <circle key={p.t} cx={x(p.t)} cy={y(p.avg!)} r={2.5} className="chart__dot" />)}
            {[0, 0.5, 1].map((f) => { const item = from + (to - from) * f; return <text key={f} x={L + (W - L) * f} y={H - 4} className="chart__label" textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}>{f === 1 ? t("ui.now") : timeLabel(item, range)}</text>; })}
          </svg>
          <div className="chart-foot">
            <span className="legend"><span className="legend__avg" />{t("ui.average")}<span className="legend__p95" />p95<span className="legend__down" />{t("ui.failures")}</span>
            <span className="muted small">{t("ui.uptime")}{" "}{data.uptime === null ? "—" : `${data.uptime.toFixed(2)}%`} · {data.resolutionMin ? (data.resolutionMin >= 1440 ? t("unit.d", { n: data.resolutionMin / 1440 }) : formatMinutes(data.resolutionMin)) : data.resolution}{" "}{t("ui.resolution")}{data.source !== "raw" ? t("ui.source_rollup", { source: data.source }) : ""}</span>
          </div>
        </>
      )}
    </section>
  );
}

interface MetricDto { from: string; to: string; resolutionMin: number; points: Array<{ t: string; avg: number | null; max: number | null; min: number | null }> }

/** A value recorded with each check (e.g. inlet temperature): average and maximum, with threshold lines. */
export function MetricChart({ monitorId, metric, unit, title, thresholds }: { monitorId: string; metric: string; unit: string; title: string; thresholds: Array<{ value: number; tone: "warn" | "down"; label: string }> }) {
  const [range, setRange] = useState<ChartRange>("24h");
  const [data, setData] = useState<MetricDto | null>(null);
  const load = useCallback(() => api.get<MetricDto>(`/monitors/${monitorId}/metric?key=${metric}&range=${range}`).then(setData).catch(() => {}), [monitorId, metric, range]);
  useLiveReload(load, range === "1h" || range === "6h" || range === "24h" ? ["monitor"] : [], 300_000);
  const W = 820, H = 190, L = 52, B = 22;
  const pts = data?.points ?? [];
  const from = data ? new Date(data.from).getTime() : 0, to = data ? new Date(data.to).getTime() : 1;
  // the scale always shows the thresholds, so the distance to them is visible
  const values = [...pts.flatMap((p) => [p.max ?? p.avg, p.min ?? p.avg]).filter((v): v is number => v !== null), ...thresholds.map((th) => th.value)];
  const lo = values.length ? Math.floor(Math.min(...values) - 2) : 0, hi = values.length ? Math.ceil(Math.max(...values) + 2) : 1;
  const x = (item: string) => L + ((new Date(item).getTime() - from) / (to - from)) * (W - L);
  const y = (v: number) => H - B - ((v - lo) / Math.max(hi - lo, 1)) * (H - B - 10);
  const line = (k: "avg" | "max") => pts.filter((p) => p[k] !== null).map((p) => `${x(p.t).toFixed(1)},${y(p[k]!).toFixed(1)}`).join(" ");
  const last = [...pts].reverse().find((p) => p.avg !== null);
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}{last && <span className="metric-now">{last.avg!.toFixed(1)} {unit}</span>}</h2>
        <div className="seg" role="group" aria-label={t("ui.time_range")}>
          {RANGES.map((r) => <button key={r} className={r === range ? "seg__btn seg__btn--on" : "seg__btn"} aria-pressed={r === range} onClick={() => setRange(r)}>{r}</button>)}
        </div>
      </div>
      {!data ? <p className="muted small">{t("common.loading")}</p> : pts.length === 0 ? <p className="muted small">{t("ui.no_results_in_this_range_yet")}</p> : (
        <>
          <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, ${range}`}>
            {[0, 0.5, 1].map((f) => { const v = lo + (hi - lo) * f; return <g key={f}><line x1={L} x2={W} y1={y(v)} y2={y(v)} className="chart__grid" /><text x={L - 6} y={y(v) + 4} className="chart__label" textAnchor="end">{v.toFixed(0)} {unit}</text></g>; })}
            {thresholds.map((th) => <g key={th.tone}><line x1={L} x2={W} y1={y(th.value)} y2={y(th.value)} className={`chart__limit chart__limit--${th.tone}`} /><text x={W - 4} y={y(th.value) - 4} className="chart__label" textAnchor="end">{th.label}</text></g>)}
            <polyline points={line("max")} className="chart__p95" />
            <polyline points={line("avg")} className="chart__avg" />
            {[0, 0.5, 1].map((f) => { const item = from + (to - from) * f; return <text key={f} x={L + (W - L) * f} y={H - 4} className="chart__label" textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}>{f === 1 ? t("ui.now") : timeLabel(item, range)}</text>; })}
          </svg>
          <div className="chart-foot">
            <span className="legend"><span className="legend__avg" />{t("ui.average")}<span className="legend__p95" />{t("temp.chart_max")}</span>
            <span className="muted small">{data.resolutionMin >= 1440 ? t("unit.d", { n: data.resolutionMin / 1440 }) : formatMinutes(data.resolutionMin)} {t("ui.resolution")}</span>
          </div>
        </>
      )}
    </section>
  );
}

/** Bits per second, short: 950 bit/s, 12 kbit/s, 412 Mbit/s, 9.4 Gbit/s. */
export function bpsText(v: number): string {
  const f = (x: number, u: string) => `${x >= 100 ? Math.round(x) : x >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100} ${u}`;
  return v < 1e3 ? f(v, "bit/s") : v < 1e6 ? f(v / 1e3, "kbit/s") : v < 1e9 ? f(v / 1e6, "Mbit/s") : f(v / 1e9, "Gbit/s");
}

/** Traffic of an interface: in and out (average per time slot), with the link speed and the Degraded line. */
export function TrafficChart({ monitorId, warnPct, criticalPct, speedMbps }: { monitorId: string; warnPct: number; criticalPct: number; speedMbps: number | null }) {
  const [range, setRange] = useState<ChartRange>("24h");
  const [data, setData] = useState<{ inp: MetricDto; out: MetricDto; speed: MetricDto } | null>(null);
  const load = useCallback(() => Promise.all(["inBps", "outBps", "speedMbps"].map((k) => api.get<MetricDto>(`/monitors/${monitorId}/metric?key=${k}&range=${range}`)))
    .then(([inp, out, speed]) => setData({ inp: inp!, out: out!, speed: speed! })).catch(() => {}), [monitorId, range]);
  useLiveReload(load, range === "1h" || range === "6h" || range === "24h" ? ["monitor"] : [], 300_000);
  const W = 820, H = 190, L = 70, B = 22;
  const lastSpeed = speedMbps ?? [...(data?.speed.points ?? [])].reverse().find((p) => p.avg !== null)?.avg ?? null;
  const limits = lastSpeed ? [warnPct > 0 && { v: (lastSpeed * 1e6 * warnPct) / 100, tone: "warn" as const, label: `${warnPct} %` }, criticalPct > 0 && { v: (lastSpeed * 1e6 * criticalPct) / 100, tone: "down" as const, label: `${criticalPct} %` }].filter((x): x is { v: number; tone: "warn" | "down"; label: string } => !!x) : [];
  const pts = [...(data?.inp.points ?? []), ...(data?.out.points ?? [])];
  const from = data ? new Date(data.inp.from).getTime() : 0, to = data ? new Date(data.inp.to).getTime() : 1;
  const hi = Math.max(1, ...pts.map((p) => p.avg ?? 0), ...limits.map((l) => l.v)) * 1.08;
  const x = (item: string) => L + ((new Date(item).getTime() - from) / (to - from)) * (W - L);
  const y = (v: number) => H - B - (v / hi) * (H - B - 10);
  const line = (list: MetricDto["points"]) => list.filter((p) => p.avg !== null).map((p) => `${x(p.t).toFixed(1)},${y(p.avg!).toFixed(1)}`).join(" ");
  const now = (list: MetricDto["points"] | undefined) => [...(list ?? [])].reverse().find((p) => p.avg !== null)?.avg ?? null;
  const nIn = now(data?.inp.points), nOut = now(data?.out.points);
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t("snmpif.chart")}{nIn !== null && nOut !== null && <span className="metric-now">↓ {bpsText(nIn)} · ↑ {bpsText(nOut)}</span>}</h2>
        <div className="seg" role="group" aria-label={t("ui.time_range")}>
          {RANGES.map((r) => <button key={r} className={r === range ? "seg__btn seg__btn--on" : "seg__btn"} aria-pressed={r === range} onClick={() => setRange(r)}>{r}</button>)}
        </div>
      </div>
      {!data ? <p className="muted small">{t("common.loading")}</p> : pts.length === 0 ? <p className="muted small">{t("ui.no_results_in_this_range_yet")}</p> : (
        <>
          <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t("snmpif.chart")}, ${range}`}>
            {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W} y1={y(hi * f / 1.08)} y2={y(hi * f / 1.08)} className="chart__grid" /><text x={L - 6} y={y(hi * f / 1.08) + 4} className="chart__label" textAnchor="end">{bpsText(hi * f / 1.08)}</text></g>)}
            {limits.map((l) => <g key={l.tone}><line x1={L} x2={W} y1={y(l.v)} y2={y(l.v)} className={`chart__limit chart__limit--${l.tone}`} /><text x={W - 4} y={y(l.v) - 4} className="chart__label" textAnchor="end">{l.label}</text></g>)}
            <polyline points={line(data.out.points)} className="chart__out" />
            <polyline points={line(data.inp.points)} className="chart__avg" />
            {[0, 0.5, 1].map((f) => { const item = from + (to - from) * f; return <text key={f} x={L + (W - L) * f} y={H - 4} className="chart__label" textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}>{f === 1 ? t("ui.now") : timeLabel(item, range)}</text>; })}
          </svg>
          <div className="chart-foot">
            <span className="legend"><span className="legend__avg" />{t("snmpif.in")}<span className="legend__out" />{t("snmpif.out")}{lastSpeed ? <span className="muted"> · {t("snmpif.link_speed", { speed: lastSpeed >= 1000 ? `${lastSpeed / 1000} Gbit/s` : `${lastSpeed} Mbit/s` })}</span> : null}</span>
            <span className="muted small">{data.inp.resolutionMin >= 1440 ? t("unit.d", { n: data.inp.resolutionMin / 1440 }) : formatMinutes(data.inp.resolutionMin)} {t("ui.resolution")}</span>
          </div>
        </>
      )}
    </section>
  );
}

const tone = (p: number | null, target: number | null) =>
  p === null ? "none" : p >= Math.max(target ?? 99.9, 99.9) ? "good" : p >= (target ?? 99) ? "ok" : p >= 95 ? "warn" : "bad";

/** One bar per day, coloured by availability; planned maintenance does not count against it. */
export function AvailabilityStrip({ a, height = 26 }: { a: AvailabilityDto; height?: number }) {
  return (
    <div className="avail" role="img" aria-label={t("ui.availability_per_day_last_days_days", { days: a.days })}>
      {a.buckets.map((b) => (
        <span key={b.date} className={`avail__bar avail__bar--${tone(b.pct, a.target)}`} style={{ height }}
          title={`${b.date}: ${b.pct === null ? "no data" : `${b.pct.toFixed(2)}%`}${b.downMin ? ` · ${b.downMin} min down` : ""}${b.plannedMin ? ` · ${b.plannedMin} min maintenance` : ""}`} />
      ))}
    </div>
  );
}

export function AvailabilitySummary({ a }: { a: AvailabilityDto }) {
  const met = a.pct !== null && a.target !== null ? a.pct >= a.target : null;
  return (
    <span className="avail-sum">
      <strong className={met === false ? "avail-sum__miss" : undefined}>{a.pct === null ? "—" : `${a.pct.toFixed(2)}%`}</strong>
      {a.target !== null && <span className="muted"> / {t(met === null ? "ui.target_pct" : met ? "ui.target_met" : "ui.target_missed", { target: a.target })}</span>}
      {a.downMin > 0 && <span className="muted"> · {formatMinutes(a.downMin, { dayUnit: false })}{" "}{t("ui.down")}</span>}
    </span>
  );
}

/** Card with 30/90-day toggle, for application and asset pages. */
export function AvailabilityCard({ path }: { path: string }) {
  const [days, setDays] = useState(30);
  const [a, setA] = useState<AvailabilityDto | null>(null);
  const load = useCallback(() => api.get<AvailabilityDto>(`${path}/availability?days=${days}`).then(setA).catch(() => {}), [path, days]);
  useLiveReload(load, ["status"], 300_000);
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t("common.availability")}</h2>
        <div className="seg" role="group" aria-label={t("common.period")}>{[30, 90].map((d) => <button key={d} className={d === days ? "seg__btn seg__btn--on" : "seg__btn"} aria-pressed={d === days} onClick={() => setDays(d)}>{d}{" "}{t("ui.days")}</button>)}</div>
      </div>
      {a && <><AvailabilitySummary a={a} /><AvailabilityStrip a={a} height={30} /><p className="muted small" style={{ margin: "8px 0 0" }}>{t("ui.down_and_impacted_time_counts_against")}</p></>}
    </section>
  );
}
