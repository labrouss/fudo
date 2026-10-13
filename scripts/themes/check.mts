/**
 * pnpm themes:check [dir]   validates themes/*.json (and optionally a drop-in folder, e.g. THEMES_DIR)
 *
 * Errors (exit 1): invalid JSON or file name, missing name/mode, unknown colour names, values that are
 * not plain colours, broken "extends". Warnings: text/background pairs below WCAG contrast targets, and
 * dark themes that do not extend "dark" but leave colours to the light defaults.
 */
import fs from "node:fs";
import path from "node:path";
import { contrast, CONTRAST_PAIRS, resolveTheme, THEME_ID, THEME_TOKENS, type ThemeFile } from "../../packages/shared/src/theme.ts";

const root = path.resolve(import.meta.dirname, "../..");
const dirs = [path.join(root, "themes"), ...process.argv.slice(2).map((d) => path.resolve(d))];
const files = new Map<string, ThemeFile>();
const where = new Map<string, string>();
let errors = 0, warnings = 0;
const err = (m: string) => { errors++; console.log(`  ✗ ${m}`); };
const warn = (m: string) => { warnings++; console.log(`  ! ${m}`); };

for (const dir of dirs) {
  if (!fs.existsSync(dir)) { err(`${dir}: folder not found`); continue; }
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const id = f.slice(0, -5);
    if (!THEME_ID.test(id)) { err(`${f}: file name must be lower-case letters, digits and dashes (e.g. solarized-dark.json)`); continue; }
    try { files.set(id, JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))); where.set(id, path.relative(root, path.join(dir, f))); }
    catch (e) { err(`${f}: invalid JSON (${(e as Error).message})`); }
  }
}
if (!files.has("light")) err("themes/light.json is missing (it is the base every theme falls back to)");

for (const [id, file] of files) {
  console.log(`${where.get(id)}`);
  const m = file._meta ?? {};
  if (!m.name) err(`${id}: _meta.name is missing`);
  if (m.mode !== undefined && m.mode !== "light" && m.mode !== "dark") err(`${id}: _meta.mode must be "light" or "dark"`);
  if (!m.mode && !m.extends) err(`${id}: set _meta.mode ("light" or "dark") or extend a theme`);
  const problems: string[] = [];
  const t = resolveTheme(id, files, problems);
  for (const p of problems) err(p);
  if (!t) continue;
  const own = Object.keys(file.colors ?? {}).length;
  if (t.mode === "dark" && !m.extends && id !== "dark" && own < THEME_TOKENS.length) {
    warn(`${id}: dark theme sets ${own} of ${THEME_TOKENS.length} colours; the rest come from the light theme. Add "extends": "dark" to inherit dark values instead.`);
  }
  for (const [a, b, min] of CONTRAST_PAIRS) {
    const r = contrast(t.colors[a]!, t.colors[b]!);
    if (r !== null && r < min) warn(`${id}: ${a} on ${b} has contrast ${r.toFixed(2)}:1 (target ${min}:1)`);
  }
  console.log(`  ${t.name} · ${t.mode}${m.extends ? ` · extends ${m.extends}` : ""} · ${own} colours set`);
}

// the built-in light theme, the CSS defaults and the token list must agree
const css = fs.readFileSync(path.join(root, "apps/web/src/styles.css"), "utf8");
const rootBlock = css.slice(css.indexOf(":root"), css.indexOf("\n}", css.indexOf(":root")));
const cssTokens = Object.fromEntries([...rootBlock.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((x) => [x[1]!, x[2]!.trim()]));
const light = files.get("light")?.colors ?? {};
for (const tk of THEME_TOKENS) {
  if (cssTokens[tk.name] !== tk.light) err(`styles.css --${tk.name} is "${cssTokens[tk.name]}", packages/shared/src/theme.ts says "${tk.light}"`);
  if (light[tk.name] !== tk.light) err(`themes/light.json "${tk.name}" is "${light[tk.name]}", packages/shared/src/theme.ts says "${tk.light}"`);
}
for (const k of Object.keys(cssTokens)) if (!THEME_TOKENS.some((x) => x.name === k)) err(`styles.css defines --${k}, which is not in packages/shared/src/theme.ts`);

console.log(`\n${files.size} themes, ${THEME_TOKENS.length} colours, ${errors} errors, ${warnings} warnings`);
process.exit(errors ? 1 : 0);
