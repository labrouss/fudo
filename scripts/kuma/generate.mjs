#!/usr/bin/env node
/**
 * Vendors Uptime Kuma's notification providers (MIT) into packages/kuma-notifications and generates
 * form definitions (providers.json) from Kuma's Vue components and English labels.
 *
 *   git clone --depth 1 https://github.com/louislam/uptime-kuma.git /tmp/uptime-kuma
 *   node scripts/kuma/generate.mjs /tmp/uptime-kuma
 *
 * Provider source files are copied unmodified; Kuma internals they import are replaced by shims.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const KUMA = path.resolve(process.argv[2] ?? "/tmp/uptime-kuma");
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../packages/kuma-notifications");
const PROVIDERS_DIR = path.join(KUMA, "server/notification-providers");
const FORMS_DIR = path.join(KUMA, "src/components/notifications");

// Fudo has native channels for these, or they need things a server-side channel cannot provide.
const EXCLUDE = {
  smtp: "native Email channel", webhook: "native Webhook channel", teams: "native Microsoft Teams channel", slack: "native Slack channel",
  Webpush: "needs a browser push subscription", nostr: "heavy crypto dependencies", apprise: "needs the apprise CLI in the container",
};

const en = JSON.parse(fs.readFileSync(path.join(KUMA, "src/lang/en.json"), "utf8"));
const t = (k) => (en[k] ?? k).replace(/\{[^}]*\}/g, "…").replace(/<[^>]+>/g, "").trim();
const humanize = (k) => k.replace(/^[a-z0-9]+(?=[A-Z])/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()) || k;

/** Kuma translation key when a label is exactly {{ $t("key") }} (so other languages can use Kuma's translations). */
const usedKeys = new Set();
function keyOf(s) {
  const m = /^\s*\{\{\s*\$t\(\s*["']([^"']+)["']\s*\)\s*\}\}\s*$/.exec(s);
  if (m && en[m[1]] !== undefined) { usedKeys.add(m[1]); return m[1]; }
  return undefined;
}

/** Text of a label/option: resolves {{ $t("key") }} and strips markup. */
function text(s) {
  return s.replace(/\{\{\s*\$t\(\s*["']([^"']+)["'][^)]*\)\s*\}\}/g, (_, k) => t(k)).replace(/<[^>]+>/g, " ").replace(/\{\{[^}]*\}\}/g, "").replace(/\s+/g, " ").trim();
}

/** Nearest enclosing v-if/v-show that tests another notification field, if any. */
function conditionFor(tpl, pos) {
  const opens = [...tpl.slice(0, pos).matchAll(/<([A-Za-z-]+)\b[^>]*\bv-(?:if|show)="([^"]+)"[^>]*>/g)];
  for (let i = opens.length - 1; i >= 0; i--) {
    const o = opens[i];
    const tag = o[1];
    if (o[0].endsWith("/>")) continue; // self-closing: encloses nothing
    // walk forward: the element encloses the field only if it is still open at `pos`
    let depth = 1;
    for (const m of tpl.slice(o.index + o[0].length, pos).matchAll(new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g"))) {
      if (m[1]) depth--; else if (!m[2]) depth++;
      if (depth === 0) break;
    }
    if (depth <= 0) continue;
    const e = o[2].trim();
    let m;
    if ((m = /^\$parent\.notification\.(\w+)\s*={2,3}\s*["']([^"']*)["']$/.exec(e))) return { key: m[1], equals: m[2] };
    if ((m = /^!\s*\$parent\.notification\.(\w+)$/.exec(e))) return { key: m[1], equals: false };
    if ((m = /^\$parent\.notification\.(\w+)$/.exec(e))) return { key: m[1], equals: true };
    return { key: null }; // conditional on something we cannot evaluate: never required
  }
  return null;
}

/** Defaults the component assigns in its script, e.g. this.$parent.notification.ntfyPriority = 5 */
function defaultsOf(src) {
  const script = (/<script[^>]*>([\s\S]*)<\/script>/.exec(src) ?? [])[1] ?? "";
  const d = {};
  for (const m of script.matchAll(/\$parent\.notification\.(\w+)\s*(?:\|\|=|\?\?=|=)\s*("[^"\n]*"|'[^'\n]*'|-?\d+(?:\.\d+)?|true|false)\s*;/g)) {
    if (!(m[1] in d)) d[m[1]] = JSON.parse(m[2].replace(/^'(.*)'$/, '"$1"'));
  }
  return d;
}

function parseForm(src) {
  const tpl = (/<template>([\s\S]*)<\/template>/.exec(src) ?? [])[1] ?? "";
  const defaults = defaultsOf(src);
  const labels = new Map();
  for (const m of tpl.matchAll(/<label[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/label>/g)) labels.set(m[1], { text: text(m[2]), key: keyOf(m[2]) });
  const fields = [];
  const seen = new Set();
  for (const m of tpl.matchAll(/v-model(?:\.[a-z]+)*="\$parent\.notification\.([A-Za-z0-9_]+)"/g)) {
    const key = m[1];
    if (seen.has(key)) continue;
    seen.add(key);
    const start = tpl.lastIndexOf("<", m.index);
    const end = tpl.indexOf(">", m.index);
    const tag = tpl.slice(start, end + 1);
    const name = (/^<([A-Za-z-]+)/.exec(tag) ?? [])[1] ?? "input";
    const type = (/\btype="([^"]+)"/.exec(tag) ?? [])[1];
    const id = (/\bid="([^"]+)"/.exec(tag) ?? [])[1];
    const required = /\srequired(\s|>|=)/.test(tag) || /:required="true"/.test(tag);
    let kind = "text";
    let options;
    if (name === "HiddenInput" || type === "password") kind = "secret";
    else if (name === "textarea") kind = "textarea";
    else if (type === "checkbox") kind = "checkbox";
    else if (type === "number") kind = "number";
    else if (name === "select") {
      const body = tpl.slice(end + 1, tpl.indexOf("</select>", end));
      options = [...body.matchAll(/<option[^>]*\bvalue="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)].map((o) => ({ value: o[1], label: text(o[2]) || o[1], ...(keyOf(o[2]) ? { labelKey: keyOf(o[2]) } : {}) }));
      kind = options.length ? "select" : "text";
    }
    const found = id ? labels.get(id) : undefined;
    let label = found?.text, labelKey = found?.key;
    if (!label && kind === "checkbox") {
      const after = tpl.slice(end + 1, end + 400);
      const l = /<label[^>]*>([\s\S]*?)<\/label>/.exec(after);
      if (l) { label = text(l[1]); labelKey = keyOf(l[1]); }
    }
    // hint: the first form-text after the field, if it is plain text
    const hintM = /<(?:div|p|small)[^>]*class="form-text"[^>]*>([\s\S]*?)<\/(?:div|p|small)>/.exec(tpl.slice(end, end + 700));
    const hint = hintM ? text(hintM[1]).slice(0, 200) : undefined;
    const hintKey = hintM ? keyOf(hintM[1]) : undefined;
    const cond = conditionFor(tpl, start);
    const showIf = cond?.key ? { key: cond.key, equals: cond.equals } : undefined;
    fields.push({
      key, label: (label || humanize(key)).replace(/\s*\*$/, ""), kind, required: required && cond?.key !== null,
      ...(options ? { options } : {}), ...(hint ? { hint } : {}), ...(showIf ? { showIf } : {}),
      ...(labelKey ? { labelKey } : {}), ...(hint && hintKey ? { hintKey } : {}),
      ...(key in defaults ? { default: defaults[key] } : {}),
    });
  }
  return fields;
}

// component name -> file, form list key (= provider type) -> component name
const indexSrc = fs.readFileSync(path.join(FORMS_DIR, "index.js"), "utf8");
const compFile = new Map([...indexSrc.matchAll(/import (\w+) from "\.\/([^"]+\.vue)"/g)].map((m) => [m[1], m[2]]));
const listBody = indexSrc.slice(indexSrc.indexOf("NotificationFormList = {"), indexSrc.indexOf("};", indexSrc.indexOf("NotificationFormList = {")));
const formOf = new Map([...listBody.matchAll(/^\s*"?([\w.]+)"?\s*:\s*(\w+)\s*,/gm)].map((m) => [m[1], m[2]]));

// display names and categories from the notification dialog
const dialog = fs.readFileSync(path.join(KUMA, "src/components/NotificationDialog.vue"), "utf8");
const names = new Map();
const CAT = { universal: "Universal", chatPlatforms: "Chat", pushServices: "Push", smsServices: "SMS", email: "Email", incidentManagement: "Incident management", homeAutomation: "Home automation", other: "Other", regional: "Regional" };
for (const g of dialog.matchAll(/let (\w+) = \{([\s\S]*?)\n\s*\};/g)) {
  for (const e of g[2].matchAll(/^\s*"?([\w.]+)"?\s*:\s*(?:"([^"]+)"|this\.\$t\("([^"]+)"\))/gm)) {
    if (!names.has(e[1])) names.set(e[1], { label: e[2] ?? t(e[3]), category: CAT[g[1]] ?? humanize(g[1]) });
  }
}

// provider classes: file -> instance name
// only the vendored providers are replaced: server/settings.js and server/util-server.js are Fudo shims
fs.rmSync(path.join(OUT, "server/notification-providers"), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "server/notification-providers"), { recursive: true });
for (const f of fs.readdirSync(PROVIDERS_DIR)) fs.copyFileSync(path.join(PROVIDERS_DIR, f), path.join(OUT, "server/notification-providers", f));

const providers = [];
const skipped = [];
for (const f of fs.readdirSync(PROVIDERS_DIR).filter((f) => f.endsWith(".js") && f !== "notification-provider.js")) {
  const src = fs.readFileSync(path.join(PROVIDERS_DIR, f), "utf8");
  const id = (/\bname\s*=\s*["']([^"']+)["']/.exec(src) ?? [])[1];
  if (!id) { skipped.push(`${f}: no provider name`); continue; }
  if (EXCLUDE[id]) { skipped.push(`${id}: ${EXCLUDE[id]}`); continue; }
  const comp = formOf.get(id);
  const vue = comp && compFile.get(comp);
  if (!vue) { skipped.push(`${id}: no form component`); continue; }
  const fields = parseForm(fs.readFileSync(path.join(FORMS_DIR, vue), "utf8"));
  const meta = names.get(id) ?? { label: humanize(id), category: "Other" };
  providers.push({ id, file: f, label: meta.label, category: meta.category, fields });
}
providers.sort((a, b) => a.label.localeCompare(b.label));

const version = JSON.parse(fs.readFileSync(path.join(KUMA, "package.json"), "utf8")).version;
const commit = execSync("git rev-parse --short HEAD", { cwd: KUMA }).toString().trim();
fs.writeFileSync(path.join(OUT, "providers.json"), JSON.stringify({ source: { project: "Uptime Kuma", version, commit, license: "MIT" }, providers }, null, 1) + "\n");
fs.copyFileSync(path.join(KUMA, "LICENSE"), path.join(OUT, "LICENSE"));
// Kuma's translations of the texts used in the forms (one file per language, only the used keys)
const LANG_OUT = path.join(OUT, "lang");
fs.rmSync(LANG_OUT, { recursive: true, force: true });
fs.mkdirSync(LANG_OUT, { recursive: true });
let langs = 0;
for (const f of fs.readdirSync(path.join(KUMA, "src/lang")).filter((f) => f.endsWith(".json") && f !== "en.json")) {
  const all = JSON.parse(fs.readFileSync(path.join(KUMA, "src/lang", f), "utf8"));
  const subset = Object.fromEntries([...usedKeys].filter((k) => typeof all[k] === "string" && all[k].trim()).map((k) => [k, all[k].replace(/<[^>]+>/g, "").replace(/\{[^}]*\}/g, "…")]));
  if (Object.keys(subset).length) { fs.writeFileSync(path.join(LANG_OUT, f), JSON.stringify(subset, null, 1) + "\n"); langs++; }
}
console.log(`${usedKeys.size} translatable Kuma texts, ${langs} languages`);
console.log(`vendored Uptime Kuma ${version} (${commit}): ${providers.length} providers, ${providers.reduce((n, p) => n + p.fields.length, 0)} fields`);
console.log(`skipped:\n  ${skipped.join("\n  ")}`);
