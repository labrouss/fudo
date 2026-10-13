import { t } from "../../i18n";
import { useEffect, useState } from "react";
import { api, errorFields } from "../../api";
import { FormError } from "../../components/Field";
import { NoMatch, SortTh, TableFilter, useTable } from "../../components/Table";
import { Pill } from "../../components/Status";

export interface FoundInterface { index: number; name: string; descr: string; alias: string; type: number; speedMbps: number | null; admin: string; oper: string }

export const speedText = (mbps: number | null) => (mbps === null ? "—" : mbps >= 1000 ? `${Math.round((mbps / 1000) * 100) / 100} Gbit/s` : `${mbps} Mbit/s`);
/** What a monitor should name the interface by: ifName, else ifDescr, else its index. */
export const ifLabel = (i: FoundInterface) => i.name || i.descr || String(i.index);

/**
 * Lists a device's interfaces (with the access settings of the form) to pick one, or several when
 * adding monitors. `request` is the body for /monitors/snmp-interfaces.
 */
export function InterfaceFinder({ request, multiple, onPick }: { request: Record<string, unknown>; multiple: boolean; onPick: (chosen: FoundInterface[]) => void }) {
  const [list, setList] = useState<FoundInterface[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [hideDown, setHideDown] = useState(false);
  useEffect(() => {
    api.post<{ interfaces: FoundInterface[] }>("/monitors/snmp-interfaces", request).then((r) => setList(r.interfaces)).catch((e) => {
      const f = errorFields(e);
      setError(Object.keys(f.fields).length ? t("monitors.ifs.fill_access") : f.message);
      setList([]);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = (list ?? []).filter((i) => !hideDown || (i.admin === "up" && i.oper === "up"));
  const table = useTable("snmp-interfaces", shown, {
    index: { value: (i) => i.index },
    name: { value: (i) => ifLabel(i) },
    alias: { value: (i) => i.alias },
    speed: { value: (i) => i.speedMbps, desc: true },
    status: { value: (i) => (i.admin === "down" ? 2 : i.oper === "up" ? 0 : 1) },
  }, { initial: { key: "index", dir: "asc" }, text: (i) => `${i.descr} ${i.name} ${i.alias}` });
  const toggle = (ix: number) => setChosen((s) => { const n = new Set(s); if (n.has(ix)) n.delete(ix); else n.add(ix); return n; });

  if (!list) return <p className="muted">{t("monitors.ifs.reading")}</p>;
  if (error) return <FormError message={error} />;
  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>{multiple ? t("monitors.ifs.lead_multi") : t("monitors.ifs.lead_single")}</p>
      <div className="list-tools" style={{ margin: 0 }}>
        <label className="check small" style={{ flex: 1 }}><input type="checkbox" checked={hideDown} onChange={(e) => setHideDown(e.target.checked)} />{t("monitors.ifs.only_up")}</label>
        <TableFilter table={table} />
      </div>
      <div style={{ maxHeight: 420, overflow: "auto" }}>
        <table className="table">
          <thead><tr>
            {multiple && <th><input type="checkbox" aria-label={t("credentials.select_all")} checked={table.rows.length > 0 && table.rows.every((i) => chosen.has(i.index))} onChange={(e) => setChosen(e.target.checked ? new Set([...chosen, ...table.rows.map((i) => i.index)]) : new Set([...chosen].filter((x) => !table.rows.some((i) => i.index === x))))} /></th>}
            <SortTh table={table} col="index">{t("monitors.ifs.index")}</SortTh>
            <SortTh table={table} col="name">{t("monitors.ifs.interface")}</SortTh>
            <SortTh table={table} col="alias">{t("monitors.ifs.alias")}</SortTh>
            <SortTh table={table} col="speed">{t("monitors.ifs.speed")}</SortTh>
            <SortTh table={table} col="status">{t("common.status")}</SortTh>
            {!multiple && <th><span className="sr-only">{t("common.actions")}</span></th>}
          </tr></thead>
          <tbody>{table.rows.map((i) => (
            <tr key={i.index} onClick={multiple ? () => toggle(i.index) : undefined} style={multiple ? { cursor: "pointer" } : undefined}>
              {multiple && <td><input type="checkbox" checked={chosen.has(i.index)} onChange={() => toggle(i.index)} onClick={(e) => e.stopPropagation()} aria-label={ifLabel(i)} /></td>}
              <td className="mono small">{i.index}</td>
              <td><span className="mono strong">{ifLabel(i)}</span>{i.name && i.descr && i.descr !== i.name && <div className="small muted">{i.descr}</div>}</td>
              <td className="small">{i.alias || <span className="muted">—</span>}</td>
              <td className="small">{speedText(i.speedMbps)}</td>
              <td>{i.admin === "down" ? <Pill tone="neutral">{t("monitors.ifs.disabled")}</Pill> : i.oper === "up" ? <Pill tone="up">{t("monitors.ifs.up")}</Pill> : <Pill tone="down">{i.oper}</Pill>}</td>
              {!multiple && <td className="actions"><button type="button" className="btn btn--small" onClick={() => onPick([i])}>{t("monitors.ifs.choose")}</button></td>}
            </tr>
          ))}<NoMatch table={table} colSpan={multiple ? 6 : 6} /></tbody>
        </table>
      </div>
      {multiple && (
        <div className="row-actions row-actions--end">
          <button type="button" className="btn btn--primary" disabled={chosen.size === 0} onClick={() => onPick((list ?? []).filter((i) => chosen.has(i.index)))}>{chosen.size === 0 ? t("monitors.ifs.pick") : chosen.size === 1 ? t("monitors.ifs.use_one") : t("monitors.ifs.add_n", { n: chosen.size })}</button>
        </div>
      )}
    </div>
  );
}
