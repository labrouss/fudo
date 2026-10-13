/**
 * Theme contract. Every themable colour of the web interface is a CSS custom property (--<name>).
 * A theme file (themes/<id>.json) sets any subset of them; missing ones come from the theme it
 * extends, and finally from the built-in light values below (which match apps/web/src/styles.css).
 */
export interface ThemeToken { name: string; group: string; light: string; description: string }

export const THEME_TOKENS: ThemeToken[] = [
  { name: "ground", group: "surfaces", light: "#f4f3ef", description: "Page background" },
  { name: "surface", group: "surfaces", light: "#ffffff", description: "Cards, dialogs" },
  { name: "surface-2", group: "surfaces", light: "#fbfaf7", description: "Page header, hover rows" },
  { name: "control", group: "surfaces", light: "#ffffff", description: "Inputs, buttons, selects" },
  { name: "ink", group: "text", light: "#16181d", description: "Main text" },
  { name: "ink-2", group: "text", light: "#3f3e39", description: "Secondary text" },
  { name: "muted", group: "text", light: "#5f5d56", description: "Hints, labels" },
  { name: "link", group: "text", light: "#2f5fa7", description: "Links" },
  { name: "line", group: "lines", light: "#e2dfd6", description: "Borders" },
  { name: "line-2", group: "lines", light: "#f1eee7", description: "Row separators" },
  { name: "field", group: "lines", light: "#d6d3c9", description: "Input borders" },
  { name: "field-hover", group: "lines", light: "#b9b5a8", description: "Input border on hover" },
  { name: "accent", group: "accent", light: "#2f5fa7", description: "Focus ring, charts, highlights" },
  { name: "brand", group: "accent", light: "#d42a3c", description: "Logo red: active marker, badges" },
  { name: "on-brand", group: "accent", light: "#ffffff", description: "Text on brand" },
  { name: "inverse", group: "accent", light: "#16181d", description: "Primary buttons, selected filters" },
  { name: "inverse-hover", group: "accent", light: "#2b2e35", description: "Primary button hover" },
  { name: "on-inverse", group: "accent", light: "#ffffff", description: "Text on primary buttons" },
  { name: "st-up", group: "status", light: "#2e8b63", description: "Up" },
  { name: "st-up-soft", group: "status", light: "#7cc19f", description: "Mostly up (availability bars)" },
  { name: "st-degraded", group: "status", light: "#c58723", description: "Degraded" },
  { name: "st-down", group: "status", light: "#c0392b", description: "Down" },
  { name: "st-impacted", group: "status", light: "#df7835", description: "Impacted" },
  { name: "st-maint", group: "status", light: "#6b8fc9", description: "Maintenance" },
  { name: "st-unknown", group: "status", light: "#b9b5a8", description: "Unknown / pending" },
  { name: "st-live", group: "status", light: "#3fb67f", description: "Live connection dot" },
  { name: "up-bg", group: "tints", light: "#e3f1ea", description: "Up pill background" },
  { name: "up-fg", group: "tints", light: "#135c43", description: "Up pill text" },
  { name: "down-bg", group: "tints", light: "#fbe4e1", description: "Down pill background" },
  { name: "down-fg", group: "tints", light: "#9a1c12", description: "Down pill text" },
  { name: "down-soft", group: "tints", light: "#fdf3f1", description: "Down node background" },
  { name: "down-line", group: "tints", light: "#e6b3ad", description: "Down banner border" },
  { name: "warn-bg", group: "tints", light: "#fbefd7", description: "Warning pill background" },
  { name: "warn-fg", group: "tints", light: "#7a4b06", description: "Warning pill text" },
  { name: "risk-soft", group: "tints", light: "#fbf6e8", description: "At-risk banner background" },
  { name: "risk-line", group: "tints", light: "#ecd9a4", description: "At-risk banner border" },
  { name: "info-bg", group: "tints", light: "#eef2f9", description: "Info pill background" },
  { name: "info-fg", group: "tints", light: "#23467f", description: "Info pill text" },
  { name: "info-line", group: "tints", light: "#c7d4ec", description: "Info banner border" },
  { name: "neu-bg", group: "tints", light: "#f1eee7", description: "Neutral pill background" },
  { name: "neu-fg", group: "tints", light: "#3f3e39", description: "Neutral pill text" },
  { name: "impact-bg", group: "tints", light: "#fde7d7", description: "Impacted pill background" },
  { name: "impact-fg", group: "tints", light: "#8a3b0b", description: "Impacted pill text" },
  { name: "impact-soft", group: "tints", light: "#fdf1e7", description: "Impacted banner background" },
  { name: "impact-line", group: "tints", light: "#f3c9a6", description: "Impacted banner border" },
  { name: "impact-ink", group: "tints", light: "#6b2e08", description: "Impacted banner text" },
  { name: "chart-ref", group: "charts", light: "#a8a59b", description: "Chart max line" },
  { name: "chart-down", group: "charts", light: "#f3c4bd", description: "Chart down band" },
  { name: "chart-p95", group: "charts", light: "#8f6ac8", description: "Chart p95 line" },
  { name: "chart-maint", group: "charts", light: "#dfe7f5", description: "Chart maintenance band" },
  { name: "bar-empty", group: "charts", light: "#e4e1d8", description: "Empty heartbeat/availability bar" },
  { name: "topo-grid", group: "charts", light: "#f4f2ec", description: "Topology grid" },
  { name: "topo-app", group: "charts", light: "#fbfaf7", description: "Topology application box" },
  { name: "topo-app-line", group: "charts", light: "#cfcabd", description: "Topology application border" },
  { name: "topo-edge", group: "charts", light: "#b9b5a8", description: "Topology edge" },
  { name: "night", group: "sidebar", light: "#1b1d22", description: "Sidebar background" },
  { name: "night-2", group: "sidebar", light: "#25282e", description: "Sidebar inputs" },
  { name: "night-line", group: "sidebar", light: "#33363e", description: "Sidebar borders" },
  { name: "night-hover", group: "sidebar", light: "#22252b", description: "Sidebar hover" },
  { name: "night-active", group: "sidebar", light: "#2b2e35", description: "Sidebar active item" },
  { name: "night-text", group: "sidebar", light: "#c9c7bf", description: "Sidebar text" },
  { name: "night-ink", group: "sidebar", light: "#e7e5df", description: "Sidebar strong text" },
  { name: "night-strong", group: "sidebar", light: "#ffffff", description: "Sidebar highlighted text" },
  { name: "night-muted", group: "sidebar", light: "#9a988f", description: "Sidebar labels" },
  { name: "night-faint", group: "sidebar", light: "#7d7b74", description: "Sidebar disabled items" },
  { name: "night-avatar", group: "sidebar", light: "#3a3e47", description: "Avatar" },
  { name: "code-bg", group: "overlays", light: "#1b1d22", description: "Code snippet background" },
  { name: "code-fg", group: "overlays", light: "#e7e5df", description: "Code snippet text" },
  { name: "backdrop", group: "overlays", light: "rgba(22, 24, 29, .45)", description: "Dialog backdrop" },
  { name: "shadow", group: "overlays", light: "rgba(22, 24, 29, .25)", description: "Dialog shadow" }
];
export const THEME_TOKEN_NAMES = new Set(THEME_TOKENS.map((t) => t.name));

/** Colours only: no url(), var() or other CSS that could load resources or break out of the value. */
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^(?:rgba?|hsla?)\(\s*-?[\d.]+(?:deg|%)?\s*(?:[,\s]\s*-?[\d.]+%?\s*){2}(?:[,/]\s*[\d.]+%?\s*)?\)$/i;
export const isThemeColor = (v: unknown): v is string => typeof v === "string" && (HEX.test(v.trim()) || FUNC.test(v.trim()));

export type ThemeMode = "light" | "dark";
export interface ThemeInfo { id: string; name: string; mode: ThemeMode; extends: string | null; description: string; swatches: string[] }
export interface ResolvedTheme extends ThemeInfo { colors: Record<string, string> }

/** Theme id = file name: lower-case letters, digits and dashes. */
export const THEME_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
/** User preference values: a theme id, or "system" (light/dark theme following the operating system). */
export const THEME_SYSTEM = "system";

export interface ThemeFile { _meta?: { name?: string; mode?: string; extends?: string; description?: string; authors?: string[] }; colors?: Record<string, unknown> }

/**
 * Resolves a theme with its `extends` chain (cycles and unknown bases fall back to the built-in light values).
 * Returns the complete token set. `problems` collects what was ignored, for logs and the theme check.
 */
export function resolveTheme(id: string, files: Map<string, ThemeFile>, problems: string[] = []): ResolvedTheme | null {
  const file = files.get(id);
  if (!file) return null;
  const chain: string[] = [];
  for (let cur: string | undefined = id; cur; cur = files.get(cur)?._meta?.extends) {
    if (chain.includes(cur)) { problems.push(`${id}: "extends" loops (${[...chain, cur].join(" → ")})`); break; }
    if (!files.has(cur)) { problems.push(`${chain[chain.length - 1]}: extends unknown theme "${cur}"`); break; }
    chain.push(cur);
  }
  const colors: Record<string, string> = Object.fromEntries(THEME_TOKENS.map((t) => [t.name, t.light]));
  for (const tid of chain.reverse()) {
    for (const [k, v] of Object.entries(files.get(tid)!.colors ?? {})) {
      if (!THEME_TOKEN_NAMES.has(k)) { problems.push(`${tid}: unknown colour "${k}"`); continue; }
      if (!isThemeColor(v)) { problems.push(`${tid}: "${k}" is not a colour (use #hex, rgb(), rgba(), hsl() or hsla())`); continue; }
      colors[k] = v.trim();
    }
  }
  // the mode is inherited too: a theme extending "dark" is dark unless it says otherwise
  const mode = (chain.map((c) => files.get(c)!._meta?.mode).filter(Boolean).pop() ?? "light") === "dark" ? "dark" : "light";
  const m = file._meta ?? {};
  return {
    id, name: m.name ?? id, mode, extends: m.extends ?? null, description: m.description ?? "", colors,
    swatches: ["ground", "surface", "night", "ink", "accent", "brand", "st-up", "st-down"].map((k) => colors[k]!),
  };
}

/* ---------- contrast (WCAG 2) ---------- */
function rgb(c: string): [number, number, number] | null {
  const s = c.trim();
  if (s.startsWith("#")) {
    const h = s.slice(1); const f = h.length <= 4 ? h.slice(0, 3).split("").map((x) => x + x).join("") : h.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)) as [number, number, number];
  }
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
const lum = ([r, g, b]: [number, number, number]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
/** Contrast ratio 1–21, or null for colours it cannot evaluate (hsl, transparency). */
export function contrast(a: string, b: string): number | null {
  const x = rgb(a), y = rgb(b);
  if (!x || !y) return null;
  const [l1, l2] = [lum(x), lum(y)].sort((p, q) => q - p) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}
/** Pairs checked by `pnpm themes:check`: [text, background, minimum ratio]. 4.5 = body text (WCAG AA), 3 = large text and UI parts. */
export const CONTRAST_PAIRS: Array<[string, string, number]> = [
  ["ink", "surface", 4.5], ["ink", "ground", 4.5], ["muted", "surface", 4.5], ["muted", "ground", 4.5], ["ink-2", "surface", 4.5], ["link", "surface", 4.5],
  ["ink", "control", 4.5], ["on-inverse", "inverse", 4.5], ["on-brand", "brand", 3],
  ["up-fg", "up-bg", 4.5], ["down-fg", "down-bg", 4.5], ["warn-fg", "warn-bg", 4.5], ["info-fg", "info-bg", 4.5], ["neu-fg", "neu-bg", 4.5], ["impact-fg", "impact-bg", 4.5],
  ["impact-ink", "impact-soft", 4.5], ["code-fg", "code-bg", 4.5],
  ["night-text", "night", 4.5], ["night-muted", "night", 4.5], ["night-strong", "night-active", 4.5],
  ["st-up", "surface", 3], ["st-down", "surface", 3], ["st-degraded", "surface", 3], ["st-impacted", "surface", 3], ["st-maint", "surface", 3], ["accent", "surface", 3],
];
