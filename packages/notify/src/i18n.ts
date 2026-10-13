/**
 * Server-side translations for notifications, emails and reports. Reads the same language files as
 * the web interface (built-in locales/ plus the LOCALES_DIR drop-in, merged per key) and re-reads
 * them when they change. Missing keys fall back to English, then to the built-in English texts.
 */
import fs from "node:fs";
import path from "node:path";
import { formatMessage, MESSAGES, renderMessage, type MsgPart } from "@fudo/shared";
import { NOTIFY_TEXTS } from "./texts.js";

type Dict = Record<string, string>;
export type Translate = (key: string, params?: Record<string, unknown>) => string;

function builtinDir(): string | null {
  for (const d of [process.env.LOCALES_BUILTIN_DIR, "/app/locales", path.resolve(process.cwd(), "../../locales"), path.resolve(process.cwd(), "locales")]) {
    if (d && fs.existsSync(path.join(d, "en.json"))) return d;
  }
  return null;
}

export class ServerI18n {
  private cache = new Map<string, Dict>();
  private dirs: string[];

  constructor(dropIn = process.env.LOCALES_DIR) {
    this.dirs = [builtinDir(), dropIn].filter((d): d is string => Boolean(d && fs.existsSync(d)));
    // unref: watching must not keep short-lived processes (scripts, CLI tools) alive
    for (const d of this.dirs) { try { fs.watch(d, () => this.cache.clear()).unref(); } catch { /* read once */ } }
  }

  private dict(lang: string): Dict {
    let d = this.cache.get(lang);
    if (d) return d;
    d = {};
    for (const dir of this.dirs) {
      const f = path.join(dir, `${lang}.json`);
      if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(lang) || !fs.existsSync(f)) continue;
      try { Object.assign(d, JSON.parse(fs.readFileSync(f, "utf8"))); } catch { /* ignore a broken drop-in */ }
    }
    this.cache.set(lang, d);
    return d;
  }

  /** Is there a language file for this code? */
  has(lang: string): boolean { return lang === "en" || Object.keys(this.dict(lang)).length > 0; }

  /** All [key, text] pairs of a language whose keys start with `prefix`. */
  entries(lang: string, prefix: string): Array<[string, string]> {
    return Object.entries(this.dict(lang)).filter((e): e is [string, string] => e[0].startsWith(prefix) && typeof e[1] === "string");
  }

  /** Writing direction from the language file's _meta ("rtl" for Arabic). */
  dir(lang: string): "ltr" | "rtl" {
    const meta = (this.dict(lang) as unknown as { _meta?: { dir?: string } })._meta;
    return meta?.dir === "rtl" ? "rtl" : "ltr";
  }

  /** Locale for numbers and dates: Arabic keeps Western digits, as in the web interface. */
  numberLocale(lang: string) { return lang === "ar" || lang.startsWith("ar-") ? `${lang}-u-nu-latn` : lang; }

  lookup(lang: string): (key: string) => string | undefined {
    const d = this.dict(lang), en = this.dict("en");
    return (key) => d[key] ?? en[key] ?? NOTIFY_TEXTS[key] ?? (key.startsWith("msg.") ? MESSAGES[key.slice(4)] : undefined);
  }

  t(lang: string): Translate {
    const look = this.lookup(lang);
    return (key, params) => formatMessage(look(key) ?? key, params, lang, this.numberLocale(lang));
  }

  /** Server message parts (incident titles, check results) in a language; falls back to the stored text. */
  render(lang: string, parts: MsgPart[] | null | undefined, fallback: string): string {
    if (!parts?.length) return fallback;
    const look = this.lookup(lang);
    return renderMessage(parts, (code) => look(`msg.${code}`), lang, this.numberLocale(lang));
  }
}

/** One instance per process. */
let shared: ServerI18n | null = null;
export const serverI18n = () => (shared ??= new ServerI18n());
