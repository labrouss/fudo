import { t } from "../../i18n";
import { useCallback, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { type TopologyDto, type TopologyNode } from "@fudo/shared";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { FormError } from "../../components/Field";
import { ASSET_KIND_LABELS, STATUS_LABEL } from "../../defs";
import { navigate } from "../../router";
import { useLiveReload } from "../../live";

const NW = 210, NH = 52, COLW = 290, ROWH = 74, PAD = 40;
/** Theme tokens (see themes/README.md). */
const COLORS: Record<string, string> = { UP: "var(--st-up)", DEGRADED: "var(--st-degraded)", DOWN: "var(--st-down)", IMPACTED: "var(--st-impacted)", MAINTENANCE: "var(--st-maint)", UNKNOWN: "var(--st-unknown)" };

interface Placed extends TopologyNode { x: number; y: number; col: number }

/** Layered layout: columns by longest dependency path (dependents left, infrastructure right), barycenter ordering. */
function layout(item: TopologyDto): { nodes: Placed[]; width: number; height: number; cols: number } {
  const out = new Map<string, string[]>(), inc = new Map<string, string[]>();
  for (const n of item.nodes) { out.set(n.key, []); inc.set(n.key, []); }
  for (const e of item.edges) { out.get(e.from)?.push(e.to); inc.get(e.to)?.push(e.from); }
  const rank = new Map<string, number>();
  const visit = (k: string, seen: Set<string>): number => {
    if (rank.has(k)) return rank.get(k)!;
    if (seen.has(k)) return 0;
    seen.add(k);
    const r = Math.max(0, ...inc.get(k)!.map((p) => visit(p, seen) + 1));
    rank.set(k, r);
    return r;
  };
  item.nodes.forEach((n) => visit(n.key, new Set()));
  const maxRank = Math.max(0, ...rank.values());
  // isolated assets go to the infrastructure column, isolated applications to the first
  for (const n of item.nodes) if (!out.get(n.key)!.length && !inc.get(n.key)!.length) rank.set(n.key, n.type === "application" ? 0 : Math.max(maxRank, 1));
  const cols: string[][] = [];
  for (const n of [...item.nodes].sort((a, b) => a.name.localeCompare(b.name))) (cols[rank.get(n.key)!] ??= []).push(n.key);
  const colsDense = cols.filter(Boolean);
  const pos = new Map<string, number>();
  const index = () => colsDense.forEach((c) => c.forEach((k, i) => pos.set(k, i)));
  index();
  for (let pass = 0; pass < 4; pass++) {
    const order = pass % 2 === 0 ? colsDense.slice(1) : colsDense.slice(0, -1).reverse();
    for (const col of order) {
      const nb = pass % 2 === 0 ? inc : out;
      const bary = (k: string) => { const ns = nb.get(k)!.filter((x) => pos.has(x)); return ns.length ? ns.reduce((s, x) => s + pos.get(x)!, 0) / ns.length : pos.get(k)!; };
      col.sort((a, b) => bary(a) - bary(b));
      index();
    }
  }
  const tallest = Math.max(1, ...colsDense.map((c) => c.length));
  const byKey = new Map(item.nodes.map((n) => [n.key, n]));
  const nodes: Placed[] = [];
  colsDense.forEach((c, ci) => {
    const off = ((tallest - c.length) * ROWH) / 2;
    c.forEach((k, i) => nodes.push({ ...byKey.get(k)!, col: ci, x: PAD + ci * COLW, y: PAD + 20 + off + i * ROWH }));
  });
  return { nodes, width: PAD * 2 + (colsDense.length - 1) * COLW + NW, height: PAD * 2 + 20 + tallest * ROWH, cols: colsDense.length };
}

export function TopologyPage({ isGlobal }: { isGlobal: boolean }) {
  const [data, setData] = useState<TopologyDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [problems, setProblems] = useState(false);
  const [q, setQ] = useState("");
  const [view, setView] = useState<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const load = useCallback(() => api.get<TopologyDto>("/topology").then((d) => { setData(d); setError(null); }).catch((e) => setError(errorFields(e).message)), []);
  useLiveReload(load, ["status", "monitor"]);

  const shown = useMemo<TopologyDto | null>(() => {
    if (!data || !problems) return data;
    // problems and everything on their dependency paths (both directions)
    const bad = new Set(data.nodes.filter((n) => !["UP", "UNKNOWN"].includes(n.status)).map((n) => n.key));
    const keep = new Set(bad);
    for (let grew = true; grew;) { grew = false; for (const e of data.edges) { if (keep.has(e.from) && bad.has(e.from) && !keep.has(e.to)) { keep.add(e.to); grew = true; } if (keep.has(e.to) && !keep.has(e.from) && bad.has(e.to)) { keep.add(e.from); grew = true; } } }
    return { nodes: data.nodes.filter((n) => keep.has(n.key)), edges: data.edges.filter((e) => keep.has(e.from) && keep.has(e.to)) };
  }, [data, problems]);
  const L = useMemo(() => (shown ? layout(shown) : null), [shown]);

  // upstream + downstream closure of the hovered node
  const lit = useMemo(() => {
    if (!hover || !shown) return null;
    const s = new Set([hover]);
    for (const dir of ["down", "up"] as const) {
      const stack = [hover];
      while (stack.length) { const k = stack.pop()!; for (const e of shown.edges) { const next = dir === "down" ? (e.from === k ? e.to : null) : e.to === k ? e.from : null; if (next && !s.has(next)) { s.add(next); stack.push(next); } } }
    }
    return s;
  }, [hover, shown]);

  if (error) return <><PageHeader help="concepts" title={t("common.topology")} /><div className="content"><FormError message={error} /></div></>;
  if (!L || !shown) return <><PageHeader help="concepts" title={t("common.topology")} /><div className="content"><p className="muted">{t("common.loading")}</p></div></>;
  const at = new Map(L.nodes.map((n) => [n.key, n]));
  const match = (n: TopologyNode) => q && n.name.toLowerCase().includes(q.toLowerCase());
  const vbW = L.width / view.k, vbH = L.height / view.k;

  const onWheel = (e: WheelEvent<SVGSVGElement>) => { const k = Math.min(3, Math.max(0.3, view.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); setView({ ...view, k }); };
  const onDown = (e: PointerEvent<SVGSVGElement>) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current; if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect(); const scale = vbW / rect.width;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
    setView({ ...view, x: d.vx - (e.clientX - d.x) * scale, y: d.vy - (e.clientY - d.y) * scale });
  };
  const onUp = () => { setTimeout(() => (drag.current = null), 0); };
  const open = (n: TopologyNode) => { if (!drag.current?.moved) navigate(`/${n.type === "asset" ? "assets" : "applications"}/${n.id}`); };

  return (
    <>
      <PageHeader help="concepts" title={t("common.topology")}>
        <input type="search" className="search" placeholder={t("topology.find_an_asset_or_application")} aria-label={t("topology.find_in_map")} value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check small"><input type="checkbox" checked={problems} onChange={(e) => setProblems(e.target.checked)} />{t("topology.problems_only")}</label>
        <div className="seg" role="group" aria-label={t("topology.zoom")}>
          <button className="seg__btn" onClick={() => setView({ ...view, k: Math.min(3, view.k * 1.25) })} aria-label={t("topology.zoom_in")}>+</button>
          <button className="seg__btn" onClick={() => setView({ x: 0, y: 0, k: 1 })}>{t("topology.fit")}</button>
          <button className="seg__btn" onClick={() => setView({ ...view, k: Math.max(0.3, view.k / 1.25) })} aria-label={t("topology.zoom_out")}>−</button>
        </div>
      </PageHeader>
      <div className="content">
        {shown.nodes.length === 0 ? (
          <section className="card empty"><p>{problems ? t("topology.no_problems_everything_on_the_map_is_up") : isGlobal ? t("topology.no_shared_assets_yet_add_assets_and") : t("topology.nothing_to_draw_yet_add_applications")}</p></section>
        ) : (
          <section className="card card--flush topo">
            <svg viewBox={`${view.x} ${view.y} ${vbW} ${vbH}`} className="topo__svg" style={{ width: "100%", maxWidth: L.width * 1.1, maxHeight: 760, aspectRatio: `${L.width} / ${L.height}` }}
              onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} role="img" aria-label={t("topology.dependency_map")}>
              <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L9 5L1 9" fill="none" stroke="context-stroke" strokeWidth="1.5" /></marker></defs>
              {Array.from({ length: L.cols }, (_, c) => (
                <text key={c} x={PAD + c * COLW} y={PAD - 6} className="topo__col">{colLabel(L.nodes.filter((n) => n.col === c), c, L.cols)}</text>
              ))}
              {shown.edges.map((e) => {
                const a = at.get(e.from), b = at.get(e.to);
                if (!a || !b) return null;
                const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
                const on = lit ? lit.has(e.from) && lit.has(e.to) : false;
                const bad = ["DOWN", "IMPACTED"].includes(b.status);
                return (
                  <path key={`${e.from}${e.to}`} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 2},${y2}`} markerEnd="url(#arr)"
                    className={`topo__edge${bad ? " topo__edge--bad" : ""}${on ? " topo__edge--on" : ""}${lit && !on ? " topo__dim" : ""}`}><title>{e.via ? t("topology.via_via", { via: e.via }) : t("topology.depends_on")}</title></path>
                );
              })}
              {L.nodes.map((n) => (
                <g key={n.key} transform={`translate(${n.x},${n.y})`} className={`topo__node${lit && !lit.has(n.key) ? " topo__dim" : ""}${match(n) ? " topo__node--match" : ""}`}
                  onPointerEnter={() => setHover(n.key)} onPointerLeave={() => setHover(null)} onClick={() => open(n)} role="link" aria-label={`${n.name}, ${STATUS_LABEL[n.status] ?? n.status}`} tabIndex={0}
                  onKeyDown={(ev) => { if (ev.key === "Enter") open(n); }}>
                  <rect width={NW} height={NH} rx={8} className={n.type === "application" ? "topo__box topo__box--app" : "topo__box"} />
                  <rect width={5} height={NH} rx={2} fill={COLORS[n.status] ?? COLORS.UNKNOWN} />
                  <text x={14} y={21} className="topo__name">{n.name.length > 24 ? `${n.name.slice(0, 23)}…` : n.name}</text>
                  <text x={14} y={39} className="topo__meta">
                    {STATUS_LABEL[n.status] ?? n.status}{n.status === "IMPACTED" && n.cause ? t("topology.by_name", { name: n.cause.name }) : ""} · {n.type === "application" ? (n.tenantName && isGlobal ? n.tenantName : t("common.application_2")) : (ASSET_KIND_LABELS[n.kind ?? ""] ?? n.kind ?? "asset").split(" ")[0]}
                  </text>
                  <circle cx={NW - 12} cy={12} r={5} fill={COLORS[n.status] ?? COLORS.UNKNOWN} />
                </g>
              ))}
            </svg>
            <div className="topo__legend">
              {Object.entries(COLORS).map(([s, c]) => <span key={s}><i style={{ background: c }} />{STATUS_LABEL[s] ?? s}</span>)}
              <span className="muted">{t("topology.drag_to_pan_scroll_to_zoom_hover_to_trace")}</span>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function colLabel(nodes: Placed[], col: number, cols: number): string {
  if (nodes.length && nodes.every((n) => n.type === "application")) return t("common.applications");
  if (col === cols - 1 && cols > 1) return t("def.monitor_category.Infrastructure");
  return col === 0 ? t("topology.top_level") : t("topology.depends_col");
}
