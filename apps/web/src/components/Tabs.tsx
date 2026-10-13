import { useEffect, useState, type ReactNode } from "react";
import { onNavigate } from "../router";

export interface TabDef<T extends string> { id: T; label: string; /** a separator is drawn before the first tab of a new group */ group?: string }

/**
 * Page tabs kept in the address (#id), so reloads, links and bookmarks open the same tab. The first tab has no hash.
 * Keyboard: arrows (mirrored right-to-left), Home, End. With a single tab nothing but the panel is drawn.
 */
export function Tabs<T extends string>({ tabs, prefix, label, children }: { tabs: TabDef<T>[]; prefix: string; label: string; children: (tab: T) => ReactNode }) {
  const first = tabs[0]!.id;
  const fromHash = (): T => tabs.find((x) => x.id === location.hash.slice(1))?.id ?? first;
  const [tab, setTab] = useState<T>(fromHash);
  useEffect(() => onNavigate(() => setTab(fromHash())));
  const current = tabs.some((x) => x.id === tab) ? tab : first;
  const choose = (id: T, focus = false) => {
    setTab(id);
    history.replaceState(history.state, "", id === first ? location.pathname + location.search : `#${id}`);
    if (focus) document.getElementById(`${prefix}-tab-${id}`)?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((x) => x.id === current);
    const rtl = document.documentElement.dir === "rtl";
    const step = e.key === "ArrowRight" ? (rtl ? -1 : 1) : e.key === "ArrowLeft" ? (rtl ? 1 : -1) : 0;
    const n = step ? i + step : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (n === null) return;
    e.preventDefault();
    choose(tabs[(n + tabs.length) % tabs.length]!.id, true);
  };
  const many = tabs.length > 1;
  return (
    <>
      {many && (
        <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
          {tabs.map((x, i) => (
            <span key={x.id} className="tabs__item">
              {i > 0 && x.group !== tabs[i - 1]!.group && <span className="tabs__sep" aria-hidden="true" title={x.group} />}
              <button id={`${prefix}-tab-${x.id}`} role="tab" type="button" aria-selected={current === x.id} aria-controls={`${prefix}-panel`} tabIndex={current === x.id ? 0 : -1}
                className={current === x.id ? "tab tab--on" : "tab"} onClick={() => choose(x.id)}>{x.label}</button>
            </span>
          ))}
        </div>
      )}
      <div id={`${prefix}-panel`} role={many ? "tabpanel" : undefined} aria-labelledby={many ? `${prefix}-tab-${current}` : undefined} className="stack-lg">
        {children(current)}
      </div>
    </>
  );
}
