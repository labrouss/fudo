import { t, uiLocale } from "../../i18n";
import { useCallback, useState } from "react";
import type { TenantPermissions } from "@fudo/shared";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { FormError } from "../../components/Field";
import { NoMatch, SortTh, TableFilter, time, useTable } from "../../components/Table";
import { Pill } from "../../components/Status";
import { useLiveReload } from "../../live";
import { Link } from "../../router";

export interface TrapDto { id: string; ts: string; source: string; version: string; oid: string; name: string | null; fields: Array<{ oid: string; name: string | null; value: string }>; action: string | null; monitorId: string | null; monitorName: string | null; assetId: string | null; assetName: string | null }
interface StatusDto { running: boolean; listening: boolean; error: string | null; port: number; received?: number; dropped?: number; droppedBySource?: Record<string, number>; since?: string | null; lastHour: number; lastDay: number; unclaimedDay: number }

export const trapLabel = (x: Pick<TrapDto, "name" | "oid">) => x.name ?? x.oid;
const ACTION_TONE: Record<string, "down" | "up" | "neutral"> = { problem: "down", clear: "up", ignored: "neutral" };

/** The fields of a trap: the first few inline, all of them on demand. */
export function TrapFields({ fields }: { fields: TrapDto["fields"] }) {
  if (!fields.length) return <span className="muted small">—</span>;
  const line = (f: TrapDto["fields"][number]) => <><span className="muted">{f.name ?? f.oid}</span> = {f.value}</>;
  if (fields.length <= 2) return <div className="mono small trap-fields">{fields.map((f, i) => <div key={i}>{line(f)}</div>)}</div>;
  return (
    <details className="mono small trap-fields">
      <summary>{line(fields[0]!)} <span className="muted">{t("traps.n_more_fields", { n: fields.length - 1 })}</span></summary>
      {fields.slice(1).map((f, i) => <div key={i}>{line(f)}</div>)}
    </details>
  );
}

/** "Create monitor" for a trap no monitor took: the form, filled in for its sender (and its trap if not standard). */
export function newTrapMonitorHref(x: Pick<TrapDto, "source" | "oid" | "name" | "assetName">) {
  const p = new URLSearchParams({ type: "snmp-trap", "config.source": x.source, name: t("traps.default_name", { name: x.assetName ?? x.source }) });
  if (!x.name) { p.set("config.match", "oids"); p.set("config.oids", x.oid); }
  return `/monitors/new?${p.toString()}`;
}

export function TrapsPage({ perms, isGlobal }: { perms: TenantPermissions; isGlobal: boolean }) {
  const [list, setList] = useState<TrapDto[] | null>(null);
  const [status, setStatus] = useState<StatusDto | null>(null);
  const [unclaimed, setUnclaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => Promise.all([api.get<TrapDto[]>(`/traps?limit=500${unclaimed ? "&unclaimed=1" : ""}`), api.get<StatusDto>("/traps/status")])
    .then(([l, s]) => { setList(l); setStatus(s); setError(null); }).catch((e) => setError(errorFields(e).message)), [unclaimed]);
  useLiveReload(load, ["monitor"], 15_000);
  const table = useTable("traps", list, {
    ts: { value: (x) => time(x.ts), desc: true },
    source: { value: (x) => x.assetName ?? x.source },
    trap: { value: (x) => trapLabel(x) },
    monitor: { value: (x) => x.monitorName ?? "" },
  }, { initial: { key: "ts", dir: "desc" }, text: (x) => `${x.source} ${x.oid} ${x.fields.map((f) => `${f.name ?? f.oid} ${f.value}`).join(" ")} ${x.action ?? ""}` });

  return (
    <>
      <PageHeader help="monitors" title={t("traps.title")}>
        {perms.manage && <Link className="btn btn--primary" href="/monitors/new?type=snmp-trap">{t("traps.new_monitor")}</Link>}
      </PageHeader>
      <div className="content">
        <FormError message={error} />
        {status && (
          <section className="card trap-status" aria-label={t("traps.receiver")}>
            <div>
              {!status.running ? <Pill tone="down">{t("traps.worker_down")}</Pill>
                : status.listening ? <Pill tone="up">{t("traps.listening", { port: status.port })}</Pill>
                : <Pill tone="down">{t("traps.not_listening")}</Pill>}
              {status.running && !status.listening && status.error && <span className="small muted"> {status.error}</span>}
            </div>
            <div className="trap-status__nums small">
              <span>{t("traps.last_hour", { n: status.lastHour })}</span>
              <span>{t("traps.last_day", { n: status.lastDay })}</span>
              {status.unclaimedDay > 0 && <span className="strong">{t("traps.unclaimed_day", { n: status.unclaimedDay })}</span>}
              {isGlobal && status.dropped !== undefined && status.dropped > 0 && <span className="text-warn" title={Object.entries(status.droppedBySource ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n")}>{t("traps.dropped", { n: status.dropped })}</span>}
            </div>
          </section>
        )}
        <div className="list-tools">
          <p className="muted small" style={{ margin: 0, flex: 1 }}>{t("traps.lead", { port: status?.port ?? 162 })}</p>
          <label className="check small"><input type="checkbox" checked={unclaimed} onChange={(e) => setUnclaimed(e.target.checked)} />{t("traps.only_unclaimed")}</label>
          <TableFilter table={table} />
        </div>
        <section className="card card--flush">
          {list && list.length === 0 ? <div className="empty"><p>{unclaimed ? t("traps.none_unclaimed") : t("traps.none")}</p></div> : (
            <table className="table">
              <thead><tr>
                <SortTh table={table} col="ts">{t("traps.time")}</SortTh>
                <SortTh table={table} col="source">{t("traps.from")}</SortTh>
                <SortTh table={table} col="trap">{t("traps.trap")}</SortTh>
                <th>{t("traps.fields")}</th>
                <SortTh table={table} col="monitor">{t("traps.monitor")}</SortTh>
              </tr></thead>
              <tbody>{table.rows.map((x) => (
                <tr key={x.id}>
                  <td className="small nowrap">{new Date(x.ts).toLocaleString(uiLocale())}</td>
                  <td><span className="mono small">{x.source}</span>{x.assetName && <div className="small">{x.assetId ? <Link href={`/assets/${x.assetId}`}>{x.assetName}</Link> : x.assetName}</div>}</td>
                  <td><span className={x.name ? "strong" : "mono small"}>{trapLabel(x)}</span>{x.name && <div className="mono small muted">{x.oid}</div>}<div className="small muted">SNMP{x.version}</div></td>
                  <td><TrapFields fields={x.fields} /></td>
                  <td>
                    {x.monitorId ? <><Link href={`/monitors/${x.monitorId}`}>{x.monitorName}</Link>{x.action && <div><Pill tone={ACTION_TONE[x.action] ?? "neutral"}>{t(`traps.action.${x.action}`)}</Pill></div>}</>
                      : <><span className="muted small">{t("traps.no_monitor")}</span>{perms.manage && <div><Link className="btn btn--small" href={newTrapMonitorHref(x)}>{t("traps.create_monitor")}</Link></div>}</>}
                  </td>
                </tr>
              ))}<NoMatch table={table} colSpan={5} /></tbody>
            </table>
          )}
        </section>
        {list && list.length >= 500 && <p className="muted small">{t("traps.limit_note")}</p>}
      </div>
    </>
  );
}
