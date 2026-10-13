/**
 * Language files: every <code>.json in the built-in locales/ directory and in LOCALES_DIR (drop-in,
 * overrides built-in) becomes a language. Files are re-read when they change. Uptime Kuma's own
 * translations are merged in for notification provider forms (keys "kuma.<key>").
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export interface LanguageInfo { code: string; name: string; englishName: string; complete: number; dir: "ltr" | "rtl" }
type Dict = Record<string, string>;

const CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const require = createRequire(import.meta.url);

function builtinDir(): string | null {
  for (const d of [process.env.LOCALES_BUILTIN_DIR, "/app/locales", path.resolve(process.cwd(), "../../locales"), path.resolve(process.cwd(), "locales")]) {
    if (d && fs.existsSync(path.join(d, "en.json"))) return d;
  }
  return null;
}
function kumaDir(): string | null {
  try { return path.join(path.dirname(require.resolve("@fudo/kuma-notifications/package.json")), "lang"); } catch { return null; }
}

export class Locales {
  private cache: { langs: Map<string, { meta: Record<string, string>; messages: Dict }>; kuma: Map<string, Dict> } | null = null;
  private dirs: string[];

  constructor(private log: { warn: (o: object, m: string) => void }, dropIn?: string) {
    this.dirs = [builtinDir(), dropIn].filter((d): d is string => Boolean(d && fs.existsSync(d)));
    for (const d of this.dirs) {
      try { fs.watch(d, () => { this.cache = null; }); } catch { /* not supported: files are read once */ }
    }
  }

  private load() {
    if (this.cache) return this.cache;
    const langs = new Map<string, { meta: Record<string, string>; messages: Dict }>();
    for (const dir of this.dirs) {
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
        const code = file.slice(0, -5);
        if (!CODE.test(code)) { this.log.warn({ file }, "ignored language file: name must be a language code, e.g. el.json or pt-BR.json"); continue; }
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Record<string, unknown>;
          const { _meta, ...rest } = raw;
          const messages = Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v === "string")) as Dict;
          const prev = langs.get(code);
          langs.set(code, { meta: { ...(prev?.meta ?? {}), ...((_meta as Record<string, string>) ?? {}) }, messages: { ...(prev?.messages ?? {}), ...messages } });
        } catch (err) {
          this.log.warn({ file, err: (err as Error).message }, "ignored invalid language file");
        }
      }
    }
    const kuma = new Map<string, Dict>();
    const kd = kumaDir();
    if (kd && fs.existsSync(kd)) for (const f of fs.readdirSync(kd).filter((x) => x.endsWith(".json"))) {
      try { kuma.set(f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(kd, f), "utf8")) as Dict); } catch { /* skip */ }
    }
    this.cache = { langs, kuma };
    return this.cache;
  }

  list(): LanguageInfo[] {
    const { langs } = this.load();
    const enKeys = Object.keys(langs.get("en")?.messages ?? {});
    return [...langs.entries()].map(([code, l]) => ({
      code, name: l.meta.name ?? code, englishName: l.meta.englishName ?? l.meta.name ?? code, dir: l.meta.dir === "rtl" ? "rtl" as const : "ltr" as const,
      complete: code === "en" || !enKeys.length ? 100 : Math.round((enKeys.filter((k) => k in l.messages).length / enKeys.length) * 100),
    })).sort((a, b) => (a.code === "en" ? -1 : b.code === "en" ? 1 : a.englishName.localeCompare(b.englishName)));
  }

  /** Messages of a language (without English fallback: the browser has English built in). */
  messages(code: string): Dict | null {
    const { langs, kuma } = this.load();
    const l = langs.get(code);
    if (!l) return null;
    // Kuma files are named like el-GR.json; use the exact code, else the same base language
    const base = code.split("-")[0]!;
    const kf = kuma.get(code) ?? [...kuma.entries()].find(([k]) => k.split(/[-_]/)[0] === base)?.[1];
    const kumaMessages = kf ? Object.fromEntries(Object.entries(kf).map(([k, v]) => [`kuma.${k}`, v])) : {};
    return { ...kumaMessages, ...l.messages };
  }
}
