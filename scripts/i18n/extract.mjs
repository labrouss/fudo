#!/usr/bin/env node
/**
 * One-time codemod: moves user-facing English text of the web app into locales/en.json and
 * replaces it with t("key") calls. Kept for reference; new code uses t() directly.
 *   node scripts/i18n/extract.mjs [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require(path.resolve("node_modules/typescript"));

const SRC = path.resolve("apps/web/src");
const EN = path.resolve("locales/en.json");
const DRY = process.argv.includes("--dry");
const ATTRS = new Set(["label", "title", "placeholder", "hint", "aria-label", "alt", "summary"]);
const PROPS = new Set(["label", "title", "description", "hint", "placeholder"]);
const CALLS = new Set(["setError", "setNotice", "setMessage", "confirm", "alert", "setInfo"]);
const SKIP_TAGS = new Set(["pre", "code"]);
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith(".tsx") && !p.endsWith("main.tsx")) files.push(p); } })(SRC);

const nsOf = (file) => {
  const rel = path.relative(SRC, file).replace(/\\/g, "/");
  const m = /^pages\/([^/]+)\//.exec(rel);
  if (m) return m[1].replace(/-/g, "_");
  if (rel.startsWith("pages/")) return path.basename(rel, ".tsx").toLowerCase();
  if (rel.startsWith("components/")) return "ui";
  return "app";
};
const slug = (text) => {
  const s = text.toLowerCase().replace(/\{(\w+)\}/g, "$1").normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const words = s.split("_").filter(Boolean);
  let out = "";
  for (const w of words) { if ((out + "_" + w).length > 42) break; out = out ? `${out}_${w}` : w; }
  return out || "text";
};
const hasWords = (s) => /[A-Za-z]{2,}/.test(s);
const looksLikeCode = (s) => /^\s*$/.test(s) || /^[\/#.]/.test(s) || s.includes("://") || /^[A-Z0-9_]+$/.test(s) || /^[a-z0-9]+([-_.:][a-z0-9]+)+$/.test(s) || /^[a-z]+[A-Z]\w*$/.test(s) || /[{};=<>]/.test(s) && !/\s/.test(s);

function insideSkippedTag(node) {
  for (let p = node.parent; p; p = p.parent) {
    if ((ts.isJsxElement(p) && SKIP_TAGS.has(p.openingElement.tagName.getText())) || (ts.isJsxSelfClosingElement(p) && SKIP_TAGS.has(p.tagName.getText()))) return true;
    if (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p)) {
      // className with mono / snippet → code-like content
      const cls = (p.attributes?.properties ?? []).find((a) => a.name?.getText?.() === "className");
      if (cls && /snippet|mono/.test(cls.getText())) return true;
    }
  }
  return false;
}

/** Is this string/template in a place users see? */
function userFacing(node) {
  let cur = node, p = node.parent;
  while (p && (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || (ts.isConditionalExpression(p) && p.condition !== cur) || (ts.isBinaryExpression(p) && ["??", "||", "&&"].includes(p.operatorToken.getText()) && p.right === cur))) { cur = p; p = p.parent; }
  if (!p) return false;
  if (ts.isJsxExpression(p)) {
    const pp = p.parent;
    if (ts.isJsxElement(pp) || ts.isJsxFragment(pp)) return !insideSkippedTag(p);
    if (ts.isJsxAttribute(pp)) return ATTRS.has(pp.name.getText());
    return false;
  }
  if (ts.isPropertyAssignment(p) && p.initializer === cur) return PROPS.has(p.name.getText());
  if (ts.isCallExpression(p) && p.arguments.includes(cur)) {
    const callee = p.expression.getText();
    return CALLS.has(callee) || CALLS.has(callee.split(".").pop());
  }
  return false;
}

// ---------- pass 1: collect
const occurrences = []; // { file, start, end, text, params, kind, lead, trail, ns }
const manual = [];
for (const file of files) {
  const code = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const ns = nsOf(file);
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const raw = node.getFullText ? code.slice(node.pos, node.end) : node.text;
      if (hasWords(raw) && !insideSkippedTag(node)) {
        // JSX whitespace: lines are trimmed and joined with a single space
        const lines = raw.split(/\r?\n/);
        const text = lines.map((l, i) => (i === 0 ? l.replace(/^\s+/, lines.length > 1 ? "" : "") : l.trim())).map((l, i, a) => (i === a.length - 1 && a.length > 1 ? l.trim() : l)).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        const lead = /^[ \t]+\S/.test(raw) && !raw.startsWith("\n");
        const trail = /\S[ \t]+$/.test(raw);
        occurrences.push({ file, start: node.pos, end: node.end, text, params: [], kind: "jsxtext", lead, trail, ns });
      }
      return;
    }
    if (ts.isJsxAttribute(node) && ATTRS.has(node.name.getText()) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const text = node.initializer.text;
      if (hasWords(text) && !looksLikeCode(text)) occurrences.push({ file, start: node.initializer.getStart(sf), end: node.initializer.end, text, params: [], kind: "attr", ns });
      return;
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && hasWords(node.text) && !looksLikeCode(node.text) && userFacing(node)) {
      occurrences.push({ file, start: node.getStart(sf), end: node.end, text: node.text, params: [], kind: "expr", ns });
      return;
    }
    if (ts.isTemplateExpression(node) && userFacing(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      if (!parts.some(hasWords) || looksLikeCode(node.head.text)) return;
      const bad = node.templateSpans.find((s) => ts.isConditionalExpression(s.expression) && [s.expression.whenTrue, s.expression.whenFalse].every((b) => ts.isStringLiteral(b) || ts.isNoSubstitutionTemplateLiteral(b)) && [s.expression.whenTrue, s.expression.whenFalse].some((b) => b.text.length <= 3));
      if (bad) { manual.push(`${path.relative(SRC, file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}  ${node.getText().slice(0, 90)}`); return; }
      const used = new Set();
      const params = node.templateSpans.map((s, i) => {
        const e = s.expression;
        let name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : ts.isCallExpression(e) && ts.isIdentifier(e.expression) ? e.expression.text.replace(/^(format|fmt)/i, "").toLowerCase() || `p${i}` : `p${i}`;
        if (!/^[A-Za-z_]\w*$/.test(name) || used.has(name)) name = `p${i}`;
        used.add(name);
        return { name, expr: e.getText(sf) };
      });
      const text = node.head.text + node.templateSpans.map((s, i) => `{${params[i].name}}${s.literal.text}`).join("");
      occurrences.push({ file, start: node.getStart(sf), end: node.end, text, params, kind: "expr", ns });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// ---------- keys: shared texts go to "common"
const nsByText = new Map();
for (const o of occurrences) { if (!nsByText.has(o.text)) nsByText.set(o.text, new Set()); nsByText.get(o.text).add(o.ns); }
const keyOfText = new Map(), textOfKey = new Map();
const existing = fs.existsSync(EN) ? JSON.parse(fs.readFileSync(EN, "utf8")) : {};
for (const [k, v] of Object.entries(existing)) if (k !== "_meta") { textOfKey.set(k, v); keyOfText.set(v, k); }
for (const o of occurrences) {
  if (keyOfText.has(o.text)) { o.key = keyOfText.get(o.text); continue; }
  const ns = nsByText.get(o.text).size > 1 ? "common" : o.ns;
  let key = `${ns}.${slug(o.text)}`, n = 2;
  while (textOfKey.has(key) && textOfKey.get(key) !== o.text) key = `${ns}.${slug(o.text)}_${n++}`;
  textOfKey.set(key, o.text); keyOfText.set(o.text, key); o.key = key;
}

// ---------- pass 2: rewrite files (from the end, so positions stay valid)
const byFile = new Map();
for (const o of occurrences) { if (!byFile.has(o.file)) byFile.set(o.file, []); byFile.get(o.file).push(o); }
let changed = 0;
for (const [file, list] of byFile) {
  let code = fs.readFileSync(file, "utf8");
  for (const o of list.sort((a, b) => b.start - a.start)) {
    const args = o.params.length ? `, { ${o.params.map((p) => (p.name === p.expr ? p.name : `${p.name}: ${p.expr}`)).join(", ")} }` : "";
    const call = `t(${JSON.stringify(o.key)}${args})`;
    let rep;
    if (o.kind === "jsxtext") {
      const raw = code.slice(o.start, o.end);
      const nlLead = raw.match(/^\s*\n[ \t]*/)?.[0] ?? "";
      const nlTrail = raw.match(/\n[ \t]*$/)?.[0] ?? "";
      rep = `${nlLead}${o.lead ? '{" "}' : ""}{${call}}${o.trail ? '{" "}' : ""}${nlTrail}`;
    } else if (o.kind === "attr") rep = `{${call}}`;
    else rep = call;
    code = code.slice(0, o.start) + rep + code.slice(o.end);
  }
  // locale-aware dates and numbers
  code = code.replace(/\.toLocale(String|DateString|TimeString)\(\)/g, ".toLocale$1(uiLocale())").replace(/\.toLocale(DateString|TimeString)\(\[\],/g, ".toLocale$1(uiLocale(),");
  const rel = path.relative(path.dirname(file), path.join(SRC, "i18n")).replace(/\\/g, "/");
  const imp = rel.startsWith(".") ? rel : `./${rel}`;
  const needed = ["t", ...(code.includes("uiLocale()") ? ["uiLocale"] : [])];
  if (!new RegExp(`from "${imp.replace(/\./g, "\\.")}"`).test(code)) code = `import { ${needed.join(", ")} } from "${imp}";\n` + code;
  if (!DRY) fs.writeFileSync(file, code);
  changed++;
}
// dates in files without other texts
for (const file of files) {
  let code = fs.readFileSync(file, "utf8");
  if (!/\.toLocale(String|DateString|TimeString)\((\)|\[\],)/.test(code)) continue;
  code = code.replace(/\.toLocale(String|DateString|TimeString)\(\)/g, ".toLocale$1(uiLocale())").replace(/\.toLocale(DateString|TimeString)\(\[\],/g, ".toLocale$1(uiLocale(),");
  const rel = path.relative(path.dirname(file), path.join(SRC, "i18n")).replace(/\\/g, "/");
  const imp = rel.startsWith(".") ? rel : `./${rel}`;
  if (!code.includes(`from "${imp}"`)) code = `import { uiLocale } from "${imp}";\n` + code;
  else if (!/import \{[^}]*uiLocale/.test(code)) code = code.replace(new RegExp(`import \\{ ([^}]*) \\} from "${imp.replace(/\./g, "\\.")}";`), (m, names) => `import { ${names}, uiLocale } from "${imp}";`);
  if (!DRY) fs.writeFileSync(file, code);
}

const out = { _meta: existing._meta ?? { name: "English", englishName: "English", dir: "ltr" }, ...Object.fromEntries([...textOfKey.entries()].sort(([a], [b]) => a.localeCompare(b))) };
if (!DRY) fs.writeFileSync(EN, JSON.stringify(out, null, 2) + "\n");
console.log(`${occurrences.length} texts → ${textOfKey.size} keys in ${changed} files`);
console.log(`needs manual work (English-only plural logic), ${manual.length}:\n  ${manual.join("\n  ")}`);
