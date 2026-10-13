/**
 * Sorting and filtering for long lists. A page keeps its own rows and cells; this adds:
 *  - useTable: the sorted, filtered rows, the sort (remembered per list in this browser) and the
 *    filter text;
 *  - SortTh: a column header that sorts (ascending, descending, back to the default order);
 *  - TableFilter: the filter box, with "12 of 87" while filtering;
 *  - NoMatch: the row shown when the filter matches nothing.
 * Empty values always sort last. Text sorts naturally (srv-2 before srv-10) in the interface
 * language; the filter ignores case and accents and needs every word to match.
 */
import { useMemo, useState, type ReactNode } from "react";
import { t, uiLocale } from "../i18n";

export type SortValue = string | number | boolean | null | undefined;
export interface SortColumn<T> {
  value: (row: T) => SortValue;
  /** first click sorts descending (dates: newest first; numbers: largest first) */
  desc?: boolean;
}
export type Sort = { key: string; dir: "asc" | "desc" } | null;

/** Statuses, worst first: sorting by status ascending puts problems on top. */
export const STATUS_RANK: Record<string, number> = { DOWN: 0, IMPACTED: 1, DEGRADED: 2, AT_RISK: 3, PENDING: 4, MAINTENANCE: 5, UNKNOWN: 6, PAUSED: 7, UP: 8 };
export const SEVERITY_RANK: Record<string, number> = { critical: 0, major: 1, minor: 2 };
export const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : null);

/** Lower case, without accents, for the filter (Συμβάν → συμβαν). */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const storageKey = (id: string) => `fudo.sort.${id}`;
function readSort(id: string): Sort | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey(id)) ?? "null");
    if (v === null || (typeof v?.key === "string" && (v.dir === "asc" || v.dir === "desc"))) return v;
  } catch { /* no storage: the default order */ }
  return undefined;
}
function writeSort(id: string, s: Sort) {
  try { localStorage.setItem(storageKey(id), JSON.stringify(s)); } catch { /* not remembered */ }
}

export interface Table<T> {
  rows: T[];
  total: number;
  sort: Sort;
  toggle: (key: string) => void;
  setSort: (s: Sort) => void;
  q: string;
  setQ: (q: string) => void;
  filtering: boolean;
}

/**
 * @param id      names the list, to remember its sort ("monitors", "users", …)
 * @param rows    the rows in their default order (null while loading)
 * @param columns how to sort each sortable column
 * @param text    extra text the filter searches besides the column values (tags, descriptions…)
 */
export function useTable<T>(id: string, rows: readonly T[] | null | undefined, columns: Record<string, SortColumn<T>>, opts: { initial?: Sort; text?: (row: T) => string; /** another list's filter text (one filter box for two lists) */ q?: string } = {}): Table<T> {
  const [sort, setSortState] = useState<Sort>(() => {
    const saved = readSort(id);
    return saved !== undefined && (saved === null || saved.key in columns) ? saved : opts.initial ?? null;
  });
  const [ownQ, setQ] = useState("");
  const q = opts.q ?? ownQ;
  const setSort = (s: Sort) => { setSortState(s); writeSort(id, s); };
  const toggle = (key: string) => {
    const first = columns[key]?.desc ? "desc" : "asc";
    const second = first === "asc" ? "desc" : "asc";
    if (sort?.key !== key) setSort({ key, dir: first });
    else if (sort.dir === first) setSort({ key, dir: second });
    else setSort(opts.initial && opts.initial.key !== key ? opts.initial : null); // third click: the default order
  };

  const shown = useMemo(() => {
    const list = [...(rows ?? [])];
    const terms = fold(q.trim()).split(/\s+/).filter(Boolean);
    const filtered = terms.length === 0 ? list : list.filter((r) => {
      const hay = fold([...Object.values(columns).map((c) => { const v = c.value(r); return v === null || v === undefined ? "" : String(v); }), opts.text?.(r) ?? ""].join(" "));
      return terms.every((term) => hay.includes(term));
    });
    const col = sort ? columns[sort.key] : undefined;
    if (!sort || !col) return filtered;
    const collator = new Intl.Collator(uiLocale(), { numeric: true, sensitivity: "base" });
    const sign = sort.dir === "asc" ? 1 : -1;
    const empty = (v: SortValue) => v === null || v === undefined || v === "";
    return filtered
      .map((r, i) => ({ r, i, v: col.value(r) }))
      .sort((a, b) => {
        if (empty(a.v) || empty(b.v)) return empty(a.v) === empty(b.v) ? a.i - b.i : empty(a.v) ? 1 : -1; // empty last, either way
        const c = typeof a.v === "string" || typeof b.v === "string" ? collator.compare(String(a.v), String(b.v)) : Number(a.v) - Number(b.v);
        return c * sign || a.i - b.i; // equal values keep the default order
      })
      .map((x) => x.r);
  }, [rows, q, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  return { rows: shown, total: rows?.length ?? 0, sort, toggle, setSort, q, setQ, filtering: q.trim().length > 0 };
}

/** A sortable column header. */
export function SortTh<T>({ table, col, children, className }: { table: Table<T>; col: string; children: ReactNode; className?: string }) {
  const dir = table.sort?.key === col ? table.sort.dir : null;
  return (
    <th className={className} aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}>
      <button type="button" className={`th-sort${dir ? " th-sort--on" : ""}`} onClick={() => table.toggle(col)}>
        {children}<span className="th-sort__icon" aria-hidden="true">{dir === "asc" ? "▲" : dir === "desc" ? "▼" : "▲▼"}</span>
      </button>
    </th>
  );
}

/** The filter box; while filtering it says how many rows are shown. */
export function TableFilter<T>({ table, placeholder, label }: { table: Table<T>; placeholder?: string; label?: string }) {
  return (
    <span className="table-filter">
      <input type="search" className="search" placeholder={placeholder ?? t("table.filter")} aria-label={label ?? placeholder ?? t("table.filter")} value={table.q} onChange={(e) => table.setQ(e.target.value)} />
      {table.filtering && <span className="table-filter__count" role="status">{t("table.count", { shown: table.rows.length, total: table.total })}</span>}
    </span>
  );
}

/** The row shown when the filter leaves nothing. */
export function NoMatch<T>({ table, colSpan }: { table: Table<T>; colSpan: number }) {
  if (!table.filtering || table.rows.length > 0 || table.total === 0) return null;
  return (
    <tr><td colSpan={colSpan} className="muted">
      {t("table.no_match", { q: table.q.trim() })}{" "}<button type="button" className="btn btn--link small" onClick={() => table.setQ("")}>{t("table.clear")}</button>
    </td></tr>
  );
}

/** For card grids: a "sort by" choice instead of column headers. */
export function SortSelect<T>({ table, options }: { table: Table<T>; options: Array<{ key: string; label: string }> }) {
  const value = table.sort ? `${table.sort.key}:${table.sort.dir}` : "";
  return (
    <label className="inline-field">{t("table.sort_by")}
      <select value={value} onChange={(e) => { const [key, dir] = e.target.value.split(":"); table.setSort(key ? { key: key!, dir: dir as "asc" } : null); }}>
        <option value="">{t("table.default_order")}</option>
        {options.flatMap((o) => [
          <option key={`${o.key}:asc`} value={`${o.key}:asc`}>{o.label} ▲</option>,
          <option key={`${o.key}:desc`} value={`${o.key}:desc`}>{o.label} ▼</option>,
        ])}
      </select>
    </label>
  );
}
