#!/usr/bin/env node
/**
 * Translation checks for contributors and CI:
 *   pnpm i18n:check            report; exit code 1 on errors
 *   pnpm i18n:check --prune    also remove unused keys from en.json
 * Errors: keys used in code but missing from en.json, invalid language files,
 * placeholders that differ from English. Warnings: unused keys, untranslated keys.
 */
import fs from "node:fs";
import path from "node:path";

const LOCALES = path.resolve("locales");
const SRC = path.resolve("apps/web/src");
const DYNAMIC = ["def.", "msg.", "notify.", "report.", "api.", "backups.kind.", "backups.error.", "maintenance.week_opt.", "maintenance.rule.monthly_week.", "pm.", "status_page.", "oncall.target.", "retention.cat.", "retention.hint.", "traps.action.", "discovery.status.", "discovery.source.", "discovery.source_hint.", "discovery.what_it_does.", "discovery.cat.", "kuma.skip.", "kuma.warn.", "status.", "severity.", "kuma."]; // built from data at run time
const CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
let errors = 0;
const err = (m) => { errors++; console.log(`  ✗ ${m}`); };

const en = JSON.parse(fs.readFileSync(path.join(LOCALES, "en.json"), "utf8"));
const enKeys = Object.keys(en).filter((k) => k !== "_meta");

// keys referenced in the web app: t("key"), <T k="key">, and `prefix.${…}` templates
const used = new Set(), prefixes = new Set();
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|mts)$/.test(p)) {
      const code = fs.readFileSync(p, "utf8");
      for (const m of code.matchAll(/["']([a-z_]+\.[a-z0-9_.]+)["']/g)) if (m[1] in en) used.add(m[1]);
      for (const m of code.matchAll(/`([a-z_]+\.[a-z0-9_.]*)\$\{/g)) prefixes.add(m[1]);
    }
  }
})(SRC);
for (const m of fs.readFileSync(path.join(SRC, "i18n.ts"), "utf8").matchAll(/t\("([^"]+)"/g)) used.add(m[1]);

console.log("English (source)");
const missing = [...new Set([...fs.readFileSync(path.join(SRC, "..", "src", "i18n.ts"), "utf8").matchAll(/\bt\("([a-z_]+\.[a-z0-9_.]+)"/g)].map((m) => m[1]))].filter((k) => !(k in en));
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) {
      for (const m of fs.readFileSync(p, "utf8").matchAll(/\b(?:t|T k=)\(?["']([a-z_]+\.[a-z0-9_.]+)["']/g)) if (!(m[1] in en) && !DYNAMIC.some((x) => m[1].startsWith(x))) missing.push(`${m[1]} (${path.relative(SRC, p)})`);
    }
  }
})(SRC);
for (const k of new Set(missing)) err(`missing in en.json: ${k}`);
const isUsed = (k) => used.has(k) || DYNAMIC.some((x) => k.startsWith(x)) || [...prefixes].some((p) => k.startsWith(p));
const unused = enKeys.filter((k) => !isUsed(k));
console.log(`  ${enKeys.length} keys, ${unused.length} unused${unused.length ? `: ${unused.slice(0, 12).join(", ")}${unused.length > 12 ? " …" : ""}` : ""}`);
if (process.argv.includes("--prune") && unused.length) {
  const pruned = Object.fromEntries(Object.entries(en).filter(([k]) => !unused.includes(k)));
  fs.writeFileSync(path.join(LOCALES, "en.json"), JSON.stringify(pruned, null, 2) + "\n");
  console.log(`  removed ${unused.length} unused keys`);
}

// placeholders of a message: {name} and plural variables
const vars = (s) => new Set([...s.matchAll(/\{\s*(\w+)\s*(?:,|\})/g)].map((m) => m[1]));

for (const file of fs.readdirSync(LOCALES).filter((f) => f.endsWith(".json") && f !== "en.json").sort()) {
  const code = file.slice(0, -5);
  console.log(`\n${file}`);
  if (!CODE.test(code)) { err(`file name must be a language code (e.g. el.json, pt-BR.json)`); continue; }
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(LOCALES, file), "utf8")); } catch (e) { err(`invalid JSON: ${e.message}`); continue; }
  if (!data._meta?.name) err(`_meta.name is missing (the language's name in that language, e.g. "Ελληνικά")`);
  const keys = Object.keys(data).filter((k) => k !== "_meta");
  const extra = keys.filter((k) => !(k in en));
  const untranslated = enKeys.filter((k) => !(k in data));
  for (const k of keys) {
    if (typeof data[k] !== "string") { err(`${k}: must be a string`); continue; }
    if (!(k in en)) continue;
    const a = vars(en[k]), b = vars(data[k]);
    const lost = [...a].filter((v) => !b.has(v)), added = [...b].filter((v) => !a.has(v));
    if (lost.length || added.length) err(`${k}: placeholders differ from English (${lost.length ? `missing {${lost.join("}, {")}}` : ""}${lost.length && added.length ? "; " : ""}${added.length ? `unknown {${added.join("}, {")}}` : ""})`);
  }
  const pct = Math.round(((enKeys.length - untranslated.length) / enKeys.length) * 100);
  console.log(`  ${data._meta?.name ?? code}: ${pct}% translated (${untranslated.length} missing${extra.length ? `, ${extra.length} obsolete: ${extra.slice(0, 5).join(", ")}${extra.length > 5 ? " …" : ""}` : ""})`);
}
console.log(errors ? `\n${errors} error(s)` : "\nNo errors");
process.exit(errors ? 1 : 0);
