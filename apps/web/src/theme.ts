/**
 * Themes: colour sets from themes/<id>.json served by the API, applied as CSS custom properties
 * on <html>. The last resolved theme is cached in the browser and applied before the first render,
 * so a dark theme does not flash light on load. "system" follows the operating system's light/dark
 * setting (themes "light" and "dark") and switches live when it changes.
 */
import type { ResolvedTheme, ThemeInfo } from "@fudo/shared";
import { storageGet, storageSet } from "./storage";

const PREF_KEY = "fudo.theme";
const CACHE_KEY = "fudo.theme.cache";
export const SYSTEM = "system";

const darkQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
let applied: string | null = null;

export const themePreference = (): string => storageGet(PREF_KEY) || SYSTEM;
/** The theme id a preference stands for right now. */
export const effectiveTheme = (pref = themePreference()) => (pref === SYSTEM ? (darkQuery?.matches ? "dark" : "light") : pref);

function apply(t: Pick<ResolvedTheme, "id" | "mode" | "colors">) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.colors)) root.style.setProperty(`--${k}`, v);
  root.style.colorScheme = t.mode;            // native controls, scrollbars and date pickers follow
  root.dataset.theme = t.id;
  root.dataset.mode = t.mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.colors.night ?? "#1b1d22");
  applied = t.id;
}

async function load(id: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/themes/${encodeURIComponent(id)}`);
    if (!r.ok) return false;
    const t = (await r.json()) as ResolvedTheme;
    apply(t);
    storageSet(CACHE_KEY, JSON.stringify({ id: t.id, mode: t.mode, colors: t.colors }));
    return true;
  } catch { return false; }
}

/** Synchronously re-applies the cached theme, then refreshes it from the server. Call before rendering. */
export function initTheme() {
  try {
    const cached = JSON.parse(storageGet(CACHE_KEY) ?? "null") as ResolvedTheme | null;
    if (cached && cached.id === effectiveTheme()) apply(cached);
  } catch { /* ignore a broken cache */ }
  void load(effectiveTheme()).then((ok) => { if (!ok && effectiveTheme() !== "light") void load("light"); });
  darkQuery?.addEventListener("change", () => { if (themePreference() === SYSTEM) void load(effectiveTheme()); });
}

/** Chooses a theme (id or "system"); saved to the profile when signed in. */
export async function setTheme(pref: string, signedIn: boolean) {
  storageSet(PREF_KEY, pref);
  await load(effectiveTheme(pref));
  if (signedIn) await fetch("/api/auth/me/theme", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme: pref }) }).catch(() => {});
}

/** After sign-in: the profile's theme wins over this browser's, so it follows the user between browsers. */
export function adoptProfileTheme(pref: string | null) {
  if (!pref || pref === themePreference()) return;
  storageSet(PREF_KEY, pref);
  if (effectiveTheme(pref) !== applied) void load(effectiveTheme(pref));
}

export const listThemes = () => fetch("/api/themes").then((r) => (r.ok ? (r.json() as Promise<ThemeInfo[]>) : []));
