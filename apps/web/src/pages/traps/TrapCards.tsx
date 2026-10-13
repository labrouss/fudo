import { t, uiLocale } from "../../i18n";
import { useCallback, useState } from "react";
import { api, errorFields } from "../../api";
import { FormError } from "../../components/Field";
import { Pill } from "../../components/Status";
import { useLiveReload } from "../../live";
import { Link } from "../../router";
import { TrapFields, trapLabel, type TrapDto } from "./Traps";

interface ProblemDto { key: string; label: string; source: string; detail: string; firstAt: string; lastAt: string; count: number; clearsAt: string | null }
const when = (iso: string) => new Date(iso).toLocaleString(uiLocale());

/** A trap monitor's open problems (clear one or all) and the traps it received. */
export function TrapMonitorCards({ monitorId, canClear }: { monitorId: string; canClear: boolean }) {
  const [problems, setProblems] = useState<ProblemDto[] | null>(null);
  const [traps, setTraps] = useState<TrapDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => Promise.all([api.get<ProblemDto[]>(`/monitors/${monitorId}/trap-problems`), api.get<TrapDto[]>(`/traps?monitorId=${monitorId}&limit=30`)])
    .then(([p, l]) => { setProblems(p); setTraps(l); }).catch((e) => setError(errorFields(e).message)), [monitorId]);
  useLiveReload(load, ["monitor"], 15_000);
  async function clear(key?: string) {
    if (!key && !confirm(t("traps.clear_all_confirm"))) return;
    try { await api.post(`/monitors/${monitorId}/traps/clear`, key ? { key } : {}); await load(); } catch (e) { setError(errorFields(e).message); }
  }
  return (
    <>
      <section className="card card--flush">
        <div className="card-head card-head--pad">
          <h2>{t("traps.open_title")}{problems && problems.length > 0 && <span className="metric-now">{problems.length}</span>}</h2>
          {canClear && problems && problems.length > 1 && <button className="btn btn--small" onClick={() => void clear()}>{t("traps.clear_all")}</button>}
        </div>
        <FormError message={error} />
        {!problems ? <p className="muted pad">{t("common.loading")}</p> : problems.length === 0 ? <p className="muted pad">{t("traps.no_open")}</p> : (
          <table className="table">
            <thead><tr><th>{t("traps.trap")}</th><th>{t("traps.about")}</th><th>{t("traps.first")}</th><th>{t("traps.last")}</th><th>{t("traps.clears")}</th>{canClear && <th><span className="sr-only">{t("common.actions")}</span></th>}</tr></thead>
            <tbody>{problems.map((p) => (
              <tr key={p.key}>
                <td><span className="strong">{p.label}</span><div className="mono small muted">{p.source}</div></td>
                <td className="small">{p.detail || "—"}</td>
                <td className="small">{when(p.firstAt)}</td>
                <td className="small">{when(p.lastAt)}{p.count > 1 && <div className="muted">{t("traps.times", { n: p.count })}</div>}</td>
                <td className="small">{p.clearsAt ? when(p.clearsAt) : <Pill tone="neutral">{t("traps.by_hand")}</Pill>}</td>
                {canClear && <td className="actions"><button className="btn btn--small" onClick={() => void clear(p.key)}>{t("traps.clear")}</button></td>}
              </tr>
            ))}</tbody>
          </table>
        )}
        {canClear && problems && problems.length > 0 && <p className="muted small pad" style={{ marginTop: 0 }}>{t("traps.clear_hint")}</p>}
      </section>
      <section className="card card--flush">
        <div className="card-head card-head--pad"><h2>{t("traps.received_title")}</h2><Link href="/traps" className="small">{t("traps.all_traps")}</Link></div>
        {!traps ? <p className="muted pad">{t("common.loading")}</p> : traps.length === 0 ? <p className="muted pad">{t("traps.none_yet")}</p> : (
          <table className="table">
            <thead><tr><th>{t("traps.time")}</th><th>{t("traps.trap")}</th><th>{t("traps.fields")}</th><th>{t("traps.effect")}</th></tr></thead>
            <tbody>{traps.map((x) => (
              <tr key={x.id}>
                <td className="small nowrap">{when(x.ts)}<div className="mono muted">{x.source}</div></td>
                <td className={x.name ? "strong" : "mono small"}>{trapLabel(x)}</td>
                <td><TrapFields fields={x.fields} /></td>
                <td>{x.action && <Pill tone={x.action === "problem" ? "down" : x.action === "clear" ? "up" : "neutral"}>{t(`traps.action.${x.action}`)}</Pill>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  );
}
