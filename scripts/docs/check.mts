/**
 * Help translations (docs/guide/<lang>/<page>.md).
 *
 *   pnpm docs:check                         validate translations and links; show coverage
 *   pnpm docs:check --new el getting-started  start a translation (English copy with a stamp)
 *   pnpm docs:check --stamp docs/guide/el/getting-started.md
 *                                           after updating a translation to the current English page
 *
 * Errors (exit 1): unknown language folders or pages, missing stamps, broken links.
 * Warnings: translations made from an older English page ("outdated").
 */
import fs from "node:fs";
import path from "node:path";
import { docHash, docStamp, docStampLine } from "../../packages/shared/src/doc-hash.ts";

const root = path.resolve(import.meta.dirname, "../..");
const guide = path.join(root, "docs/guide");
const rel = (p: string) => path.relative(root, p);
const english = new Map(fs.readdirSync(guide).filter((f) => f.endsWith(".md")).map((f) => [f, fs.readFileSync(path.join(guide, f), "utf8")]));
const locales = new Set(fs.readdirSync(path.join(root, "locales")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)));
const STAMP_LINE = /^\uFEFF?\s*<!--\s*translation-of:[^>]*-->[ \t]*\n?/;
const args = process.argv.slice(2);

/* ---------- --new <lang> <page> ---------- */
if (args[0] === "--new") {
  const [lang, page] = [args[1], (args[2] ?? "").replace(/\.md$/, "")];
  const en = english.get(`${page}.md`);
  if (!lang || !locales.has(lang) || lang === "en") { console.error(`Unknown language "${lang}" (it needs locales/${lang}.json)`); process.exit(1); }
  if (!en) { console.error(`Unknown page "${page}". Pages: ${[...english.keys()].map((f) => f.slice(0, -3)).join(", ")}`); process.exit(1); }
  const file = path.join(guide, lang, `${page}.md`);
  if (fs.existsSync(file)) { console.error(`${rel(file)} already exists`); process.exit(1); }
  // links resolve from docs/guide/<lang>/: other guide pages point to English until they are translated
  const body = en.replace(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g, (_, href: string) => {
    const [p, frag] = href.split("#");
    const target = path.resolve(guide, p!);
    const translated = path.join(guide, lang, path.basename(p!));
    const to = path.dirname(target) === guide && fs.existsSync(translated) ? path.basename(p!) : path.relative(path.join(guide, lang), target);
    return `](${to.split(path.sep).join("/")}${frag ? `#${frag}` : ""})`;
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${docStampLine(`${page}.md`, en)}\n${body}`);
  console.log(`Created ${rel(file)}: translate the text below the first line (keep that line).`);
  process.exit(0);
}

/* ---------- --stamp <file> ---------- */
if (args[0] === "--stamp") {
  const file = path.resolve(args[1] ?? "");
  const page = path.basename(file);
  const en = english.get(page);
  if (!en || !fs.existsSync(file) || path.dirname(path.dirname(file)) !== guide) { console.error("Usage: pnpm docs:check --stamp docs/guide/<lang>/<page>.md"); process.exit(1); }
  const tr = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, `${docStampLine(page, en)}\n${tr.replace(STAMP_LINE, "")}`);
  console.log(`${rel(file)} now matches the current English page.`);
  process.exit(0);
}

/* ---------- check ---------- */
let errors = 0, warnings = 0;
const err = (m: string) => { errors++; console.log(`  ✗ ${m}`); };
const warn = (m: string) => { warnings++; console.log(`  ! ${m}`); };

function checkLinks(file: string, md: string) {
  for (const m of md.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = m[1]!;
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    const target = path.resolve(path.dirname(file), href.split("#")[0]!);
    if (!fs.existsSync(target)) {
      const hint = path.dirname(file) !== guide && path.dirname(target) === path.dirname(file) && english.has(path.basename(target))
        ? ` (not translated yet: link to ../${path.basename(target)})` : "";
      err(`${rel(file)}: broken link ${href}${hint}`);
    }
  }
}

console.log("English");
for (const [f, md] of english) checkLinks(path.join(guide, f), md);
console.log(`  ${english.size} pages`);

const langs = fs.readdirSync(guide, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
for (const lang of langs) {
  const dir = path.join(guide, lang);
  console.log(`\n${lang}`);
  if (!locales.has(lang) || lang === "en") { err(`docs/guide/${lang}: no language "${lang}" (folders are named like the files in locales/)`); continue; }
  let current = 0, outdated = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) {
    const file = path.join(dir, f);
    const tr = fs.readFileSync(file, "utf8");
    const en = english.get(f);
    if (!en) { err(`${rel(file)}: there is no English page ${f}`); continue; }
    const stamp = docStamp(tr);
    if (!stamp || stamp.source !== f) { err(`${rel(file)}: the first line must be ${docStampLine(f, en)}`); continue; }
    if (stamp.hash !== docHash(en)) {
      outdated++;
      warn(`${rel(file)}: outdated, docs/guide/${f} changed since. Update the text, then run: pnpm docs:check --stamp ${rel(file)}`);
    } else current++;
    checkLinks(file, tr);
  }
  console.log(`  ${current + outdated} of ${english.size} pages translated${outdated ? `, ${outdated} outdated` : ""}`);
}

console.log(`\n${errors} errors, ${warnings} warnings`);
process.exit(errors ? 1 : 0);
