import { useCallback, useEffect, useState } from "react";
import { SortTh, STATUS_RANK, TableFilter, useTable } from "../../components/Table";
import type { MsgPart, TenantPermissions } from "@fudo/shared";
import { t, tmsg, uiLocale } from "../../i18n";
import { api, errorFields } from "../../api";
import { useLiveReload } from "../../live";
import { PageHeader } from "../../components/AppShell";
import { Dialog } from "../../components/Dialog";
import { FormError } from "../../components/Field";
import { StatusPill } from "../../components/Monitoring";
import { Link } from "../../router";
import { BulkAdd } from "../monitors/BulkAdd";

interface Sensor { id: string; name: string; scope: string; room: string | null; rack: string | null; status: string; celsius: number | null; at: string | null; riseC: number | null; warnC: number; criticalC: number; min24: number | null; max24: number | null; spark: Array<number | null> }
interface Room { id: string; name: string; room: string | null; status: string; message: string | null; parts: MsgPart[] | null; scope: string }
interface Data { sensors: Sensor[]; rooms: Room[]; summary: { sensors: number; fresh: number; avg: number | null; hottest: { id: string; name: string; celsius: number } | null; hot: number; rising: number } }

const fmt = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)} °C`);
const tone = (s: Sensor) => (s.celsius === null ? "none" : s.celsius >= s.criticalC ? "down" : s.celsius >= s.warnC ? "warn" : "ok");
const RANK: Record<string, number> = { DOWN: 4, IMPACTED: 3, DEGRADED: 2, AT_RISK: 1 };

/** 6 hours of 5-minute averages, with the sensor's Degraded line. */
function Spark({ s }: { s: Sensor }) {
  const W = 150, H = 30, vals = s.spark.filter((v): v is number => v !== null);
  if (vals.length < 2) return <span className="muted small">—</span>;
  const lo = Math.min(...vals, s.warnC) - 1, hi = Math.max(...vals, s.warnC) + 1;
  const y = (v: number) => H - 2 - ((v - lo) / (hi - lo)) * (H - 4);
  const x = (i: number) => (i / (s.spark.length - 1)) * W;
  const path = s.spark.map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t("temperature.spark_label", { min: Math.min(...vals).toFixed(1), max: Math.max(...vals).toFixed(1) })}>
      <line x1={0} x2={W} y1={y(s.warnC)} y2={y(s.warnC)} className="spark__limit" />
      <polyline points={path} className={`spark__line spark__line--${tone(s)}`} />
    </svg>
  );
}

export function TemperaturePage({ perms, isGlobal }: { perms: TenantPermissions; isGlobal: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => api.get<Data>("/temperature").then((d) => { setData(d); setError(null); }).catch((e) => setError(errorFields(e).message)), []);
  useLiveReload(load, ["monitor", "status"], 120_000);
  useEffect(() => { void load(); }, [load]);

  const createRoomAlert = async (room: string) => {
    try {
      await api.post("/monitors", { name: t("temperature.room_monitor_name", { room }), type: "temperature-room", config: { room, hotCount: 3, risingCount: 2, riseC: 3, staleMin: 10 },
        intervalS: 60, retryIntervalS: 60, timeoutS: 10, failuresBeforeDown: 1, successesBeforeUp: 1, tags: [`room:${room}`] });
      await load();
    } catch (e) { setError(errorFields(e).message); }
  };

  const table = useTable("temperature", data?.sensors, {
    rack: { value: (s) => s.rack },
    sensor: { value: (s) => s.name },
    now: { value: (s) => s.celsius, desc: true },
    change: { value: (s) => s.riseC, desc: true },
    range: { value: (s) => s.max24, desc: true },
    status: { value: (s) => STATUS_RANK[s.status] },
  }, { initial: { key: "now", dir: "desc" }, text: (s) => s.room ?? "" });
  const groups = new Map<string, Sensor[]>();
  for (const s of table.rows) { const k = s.room ?? ""; groups.set(k, [...(groups.get(k) ?? []), s]); }
  const roomOf = (room: string) => data?.rooms.find((r) => (r.room ?? "").toLowerCase() === room.toLowerCase());
  const worst = (room: string) => Math.max(RANK[roomOf(room)?.status ?? ""] ?? 0, ...(groups.get(room) ?? []).map((s) => RANK[s.status] ?? 0));
  const order = [...groups.keys()].sort((a, b) => (a === "") !== (b === "") ? (a === "" ? 1 : -1) : worst(b) - worst(a) || a.localeCompare(b));
  const sm = data?.summary;

  return (
    <>
      <PageHeader help="monitors" title={t("temperature.title")}>{data && data.sensors.length > 0 && <TableFilter table={table} />}{perms.manage && <button className="btn btn--primary" onClick={() => setAdding(true)}>{t("temperature.add_sensors")}</button>}</PageHeader>
      <div className="content">
        <FormError message={error} />
        <p className="muted small">{t("temperature.lead")}</p>
        {data && data.sensors.length === 0 && <section className="card empty"><p>{t("temperature.none")}</p></section>}
        {table.filtering && table.rows.length === 0 && data && data.sensors.length > 0 && <section className="card empty"><p>{t("table.no_match", { q: table.q.trim() })}{" "}<button type="button" className="btn btn--link small" onClick={() => table.setQ("")}>{t("table.clear")}</button></p></section>}
        {sm && sm.sensors > 0 && (
          <div className="stats">
            <div className="card stat"><span className="stat__label">{t("temperature.sensors")}</span><span className="stat__value">{sm.fresh}</span><span className="muted small">{t("temperature.of_total", { total: sm.sensors })}</span></div>
            <div className="card stat"><span className="stat__label">{t("temperature.average")}</span><span className="stat__value">{fmt(sm.avg)}</span></div>
            <div className="card stat"><span className="stat__label">{t("temperature.warmest")}</span><span className="stat__value">{sm.hottest ? fmt(sm.hottest.celsius) : "—"}</span>{sm.hottest && <Link className="small" href={`/monitors/${sm.hottest.id}`}>{sm.hottest.name}</Link>}</div>
            <div className="card stat"><span className="stat__label">{t("temperature.hot")}</span><span className={`stat__value${sm.hot ? " stat__value--down" : " stat__value--up"}`}>{sm.hot}</span></div>
            <div className="card stat"><span className="stat__label">{t("temperature.rising")}</span><span className={`stat__value${sm.rising ? " stat__value--warn" : ""}`}>{sm.rising}</span></div>
          </div>
        )}
        {order.map((room) => {
          const list = groups.get(room)!;
          const alert = room ? roomOf(room) : undefined;
          return (
            <section key={room || "-"} className="card card--flush temp-room">
              <div className="card-head card-head--pad">
                <h2>{room ? t("temperature.room", { room }) : t("temperature.no_room")}</h2>
                {alert ? <span className="temp-room__alert"><StatusPill status={alert.status as never} /> <Link href={`/monitors/${alert.id}`} className="small">{alert.parts ? tmsg(alert.parts, alert.message) : alert.message}</Link></span>
                  : room && perms.manage ? <button className="btn btn--small" onClick={() => void createRoomAlert(room)}>{t("temperature.create_room_alert")}</button> : null}
              </div>
              {!room && <p className="small muted" style={{ padding: "0 16px" }}>{t("temperature.no_room_hint")}</p>}
              <table className="table temp-table">
                <colgroup><col style={{ width: "9%" }} /><col style={{ width: "24%" }} /><col style={{ width: "11%" }} /><col style={{ width: "20%" }} /><col style={{ width: "11%" }} /><col style={{ width: "14%" }} /><col style={{ width: "11%" }} /></colgroup>
                <thead><tr><SortTh table={table} col="rack">{t("temperature.rack")}</SortTh><SortTh table={table} col="sensor">{t("temperature.sensor")}</SortTh><SortTh table={table} col="now" className="num">{t("temperature.now")}</SortTh><th>{t("temperature.last_6h")}</th><SortTh table={table} col="change" className="num">{t("temperature.change")}</SortTh><SortTh table={table} col="range" className="num">{t("temperature.range_24h")}</SortTh><SortTh table={table} col="status">{t("maintenance.state")}</SortTh></tr></thead>
                <tbody>{list.map((s) => (
                  <tr key={s.id}>
                    <td className="small">{s.rack ?? "—"}</td>
                    <td><Link href={`/monitors/${s.id}`}>{s.name}</Link>{s.scope === "global" && !isGlobal && <span className="scope-badge">{t("common.global")}</span>}
                      {s.at && <div className="small muted">{new Date(s.at).toLocaleTimeString(uiLocale(), { hour: "2-digit", minute: "2-digit" })}</div>}</td>
                    <td className={`num temp-now temp-now--${tone(s)}`}>{fmt(s.celsius)}</td>
                    <td><Spark s={s} /></td>
                    <td className={`num small${s.riseC !== null && s.riseC >= 3 ? " text-down strong" : s.riseC !== null && s.riseC < 0.1 ? " muted" : ""}`}>{s.riseC === null ? "—" : s.riseC < 0.1 ? "0.0 °C" : `↑ +${s.riseC.toFixed(1)} °C`}</td>
                    <td className="num small">{s.min24 === null ? "—" : `${s.min24.toFixed(1)}–${s.max24!.toFixed(1)} °C`}</td>
                    <td><StatusPill status={s.status as never} /></td>
                  </tr>))}</tbody>
              </table>
            </section>
          );
        })}
      </div>
      <Dialog wide title={t("temperature.add_sensors")} open={adding} onClose={() => setAdding(false)}>
        {adding && <BulkAdd isGlobal={isGlobal} initial="s:redfish-temperature" onDone={() => { setAdding(false); void load(); }} />}
      </Dialog>
    </>
  );
}
