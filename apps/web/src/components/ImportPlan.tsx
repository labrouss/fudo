import { t } from "../i18n";
import type { ImportResult } from "@fudo/shared";
import { Pill } from "./Status";

/** Dry-run / apply result: summary, errors (with line numbers) and the change list. */
export function ImportPlan({ r, onLine }: { r: ImportResult; onLine?: (line: number) => void }) {
  const changes = r.actions.filter((a) => a.action !== "unchanged");
  return (
    <div className="stack">
      <div className="chips">
        <Pill tone="up">{`${r.summary.create} to create`}</Pill>
        <Pill tone="info">{`${r.summary.update} to update`}</Pill>
        <Pill tone="neutral">{`${r.summary.unchanged} unchanged`}</Pill>
        {r.errors.length > 0 && <Pill tone="down">{t("ui.import.errors_n", { count: r.errors.length })}</Pill>}
        {r.applied && <Pill tone="up">{t("ui.applied")}</Pill>}
      </div>
      {r.errors.length > 0 && (
        <ul className="plan-errors">
          {r.errors.map((e, i) => (
            <li key={i}>
              {e.line !== null && onLine ? <button type="button" className="btn btn--link mono small" onClick={() => onLine(e.line!)}>{t("common.line")}{" "}{e.line}</button> : e.line !== null ? <span className="mono small">{t("common.line")}{" "}{e.line}</span> : null}
              <span><strong>{e.kind}{e.name ? ` "${e.name}"` : ""}</strong>{e.field ? <span className="muted"> ({e.field})</span> : null}: {e.message}</span>
            </li>
          ))}
        </ul>
      )}
      {changes.length > 0 && (
        <table className="table table--dense">
          <thead><tr><th>{t("ui.change")}</th><th>{t("common.type")}</th><th>{t("common.name")}</th><th>{t("ui.fields")}</th></tr></thead>
          <tbody>{changes.map((a, i) => (
            <tr key={i}><td><Pill tone={a.action === "create" ? "up" : "info"}>{a.action}</Pill></td><td className="small">{a.kind}</td><td>{a.name}</td><td className="small muted">{a.changes.join(", ")}</td></tr>
          ))}</tbody>
        </table>
      )}
      {changes.length === 0 && r.errors.length === 0 && <p className="muted small">{t("ui.nothing_to_change_everything_in_the_file")}</p>}
    </div>
  );
}
