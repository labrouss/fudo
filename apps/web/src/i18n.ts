/**
 * Interface translations. English is bundled (always available); other languages come from the
 * API, which discovers every file in locales/ (and LOCALES_DIR) at start-up, so adding a language
 * never needs a rebuild. The page reloads when the language changes, so t() is a plain function.
 */
import { formatMessage, renderMessage, type MsgPart } from "@fudo/shared";
import { storageGet, storageSet } from "./storage";
import en from "../../../locales/en.json";

export interface LanguageInfo { code: string; name: string; englishName: string; complete: number; dir: "ltr" | "rtl" }
type Dict = Record<string, string>;

const EN = en as unknown as Dict;
let dict: Dict = EN;
let lang = "en";
let languages: LanguageInfo[] = [{ code: "en", name: "English", englishName: "English", complete: 100, dir: "ltr" }];
const STORAGE = "fudo.lang";

/** Picks the language: explicit choice, then the browser's preferences, then English. */
/** Browser storage can be blocked (strict privacy settings, some private modes): never let that break the interface. */
const stored = () => storageGet(STORAGE);

function choose(available: string[]): string {
  const saved = stored();
  if (saved && available.includes(saved)) return saved;
  for (const pref of navigator.languages ?? [navigator.language]) {
    const p = pref.toLowerCase();
    const exact = available.find((a) => a.toLowerCase() === p);
    if (exact) return exact;
    const base = available.find((a) => a.toLowerCase() === p.split("-")[0]);
    if (base) return base;
  }
  return "en";
}

export async function initI18n(): Promise<void> {
  try {
    const r = await fetch("/api/locales");
    if (r.ok) languages = (await r.json()) as LanguageInfo[];
  } catch { /* API unreachable: English */ }
  // ?lang=… (set by setLanguage when browser storage is blocked) wins once, then is removed from the address
  const fromUrl = new URL(location.href).searchParams.get("lang");
  if (fromUrl) { const u = new URL(location.href); u.searchParams.delete("lang"); history.replaceState(null, "", u.toString()); }
  lang = fromUrl && languages.some((l) => l.code === fromUrl) ? fromUrl : choose(languages.map((l) => l.code));
  if (lang !== "en") {
    try {
      const r = await fetch(`/api/locales/${encodeURIComponent(lang)}`);
      if (r.ok) dict = { ...EN, ...((await r.json()) as { messages: Dict }).messages };
      else lang = "en";
    } catch { lang = "en"; }
  }
  document.documentElement.lang = lang;
  document.documentElement.dir = languages.find((l) => l.code === lang)?.dir ?? "ltr";
}

/**
 * Locale for dates and numbers. Arabic uses Western digits (0–9): IP addresses, ports and ids are
 * always written that way in infrastructure tools, and one digit system reads better than a mix.
 */
export const uiLocale = () => (lang === "ar" || lang.startsWith("ar-") ? `${lang}-u-nu-latn` : lang);
export const availableLanguages = () => languages;
/** A language's own name ("Ελληνικά"), or the code when it is not installed. */
export const languageName = (code: string) => languages.find((l) => l.code === code)?.name ?? code;

/** Remembers the choice (browser + user profile) and reloads the interface in that language. */
export async function setLanguage(code: string, saveToProfile = true) {
  storageSet(STORAGE, code); // blocked storage: the profile and the URL below still carry the choice
  if (saveToProfile) {
    await fetch("/api/auth/me/locale", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: code }) }).catch(() => {});
  }
  // with storage blocked, the reload finds the language in the URL (and then in the profile)
  const url = new URL(location.href);
  if (stored() !== code) url.searchParams.set("lang", code);
  location.replace(url.toString());
}

/** Applies the language saved in the user's profile (after sign-in, e.g. on another browser). */
export function adoptProfileLanguage(code: string | null | undefined) {
  if (code && code !== lang && !stored() && languages.some((l) => l.code === code)) void setLanguage(code, false);
}


/**
 * Formats a message: {name} placeholders and ICU-style plurals
 * "{count, plural, one {# monitor} other {# monitors}}" (shared with the server).
 */
export const format = (msg: string, params?: Record<string, unknown>): string => formatMessage(msg, params, lang, uiLocale());

/**
 * Server-generated text (check results, incident titles, summaries) in the interface language.
 * Rows written before 0.15 have no parts: their stored English text is shown instead.
 */
export function tmsg(parts: MsgPart[] | null | undefined, fallback: string | null | undefined = ""): string {
  if (!parts || !parts.length) return fallback ?? "";
  return renderMessage(parts, (code) => dict[`msg.${code}`] ?? EN[`msg.${code}`], lang, uiLocale());
}

/** Translates a key; unknown keys fall back to English, then to `fallback`, then to the key. */
export function t(key: string, params?: Record<string, unknown>, fallback?: string): string {
  return format(dict[key] ?? EN[key] ?? fallback ?? key, params);
}

/** Translates generated definition texts (monitor fields, channel fields…) with the English text as fallback. */
export const td = (key: string, english: string | undefined) => (english === undefined ? undefined : format(dict[key] ?? EN[key] ?? english));

/** The chosen interface language code (as listed in the picker). */
export const currentLanguage = () => lang;

/** A duration in minutes with translated units: "45 min", "1.5 h", "3 d" (locale decimal separator). */
export function formatMinutes(m: number, opts: { dayUnit?: boolean } = {}): string {
  const nf = (v: number, digits = 0) => new Intl.NumberFormat(uiLocale(), { maximumFractionDigits: digits }).format(v);
  if (m < 60) return t("unit.min", { n: nf(m) });
  if (m < 2880 || opts.dayUnit === false) return t("unit.h", { n: nf(m / 60, 1) });
  return t("unit.d", { n: nf(m / 1440) });
}
