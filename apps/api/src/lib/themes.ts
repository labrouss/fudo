/**
 * Theme files: every <id>.json in the built-in themes/ directory and in THEMES_DIR (drop-in; a file
 * with the same id as a built-in theme is merged over it) becomes a theme. Files are re-read when they change.
 * Values are validated as plain colours (see @fudo/shared theme.ts), so a theme cannot inject CSS.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveTheme, THEME_ID, type ResolvedTheme, type ThemeFile, type ThemeInfo } from "@fudo/shared";

function builtinDir(): string | null {
  for (const d of [process.env.THEMES_BUILTIN_DIR, "/app/themes", path.resolve(process.cwd(), "../../themes"), path.resolve(process.cwd(), "themes")]) {
    if (d && fs.existsSync(path.join(d, "light.json"))) return d;
  }
  return null;
}

export class Themes {
  private cache: Map<string, ResolvedTheme> | null = null;
  private dirs: string[];

  constructor(private log: { warn: (o: object, m: string) => void }, dropIn?: string) {
    this.dirs = [builtinDir(), dropIn].filter((d): d is string => Boolean(d && fs.existsSync(d)));
    for (const d of this.dirs) {
      try { fs.watch(d, () => { this.cache = null; }); } catch { /* not supported: files are read once */ }
    }
  }

  private load(): Map<string, ResolvedTheme> {
    if (this.cache) return this.cache;
    const files = new Map<string, ThemeFile>();
    for (const dir of this.dirs) {
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
        const id = file.slice(0, -5);
        if (!THEME_ID.test(id)) { this.log.warn({ file }, "ignored theme file: name must be lower-case letters, digits and dashes, e.g. solarized-dark.json"); continue; }
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as ThemeFile;
          if (typeof raw !== "object" || raw === null || (raw.colors !== undefined && typeof raw.colors !== "object")) throw new Error("expected { _meta, colors }");
          // same id as a built-in theme: merge over it (like language files), so a one-line file can
          // re-brand the built-in Dark theme without losing everything it does not mention
          const prev = files.get(id);
          files.set(id, prev ? { _meta: { ...prev._meta, ...raw._meta }, colors: { ...prev.colors, ...raw.colors } } : raw);
        } catch (err) {
          this.log.warn({ file, err: (err as Error).message }, "ignored invalid theme file");
        }
      }
    }
    const out = new Map<string, ResolvedTheme>();
    for (const id of files.keys()) {
      const problems: string[] = [];
      const t = resolveTheme(id, files, problems);
      if (problems.length) this.log.warn({ theme: id, problems }, "theme values ignored");
      if (t) out.set(id, t);
    }
    this.cache = out;
    return out;
  }

  /** Light and dark first, then the rest by name. */
  list(): ThemeInfo[] {
    const order = (id: string) => (id === "light" ? 0 : id === "dark" ? 1 : 2);
    return [...this.load().values()].map(({ colors: _c, ...info }) => info).sort((a, b) => order(a.id) - order(b.id) || a.name.localeCompare(b.name));
  }
  get(id: string): ResolvedTheme | null { return this.load().get(id) ?? null; }
  has(id: string): boolean { return this.load().has(id); }
}
