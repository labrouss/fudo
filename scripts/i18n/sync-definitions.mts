/**
 * Adds the texts of shared definitions (monitor types and fields, built-in channel types,
 * templates, asset kinds, events) to locales/en.json as def.* keys, and server messages as msg.* keys,
 * so they can be translated.
 * Run after changing definitions:  pnpm i18n:sync
 */
import fs from "node:fs";
import { MONITOR_TYPES } from "../../packages/monitors/src/definitions.ts";
import { CREDENTIAL_KIND_DEFS } from "../../packages/monitors/src/credentials.ts";
import { MONITOR_TEMPLATES } from "../../packages/monitors/src/templates.ts";
import { CHANNEL_TYPES, NOTIFY_EVENTS } from "../../packages/notify/src/definitions.ts";
import { NOTIFY_TEXTS } from "../../packages/notify/src/texts.ts";
import { REPORT_TEXTS } from "../../packages/reports/src/texts.ts";
import { API_TEXTS } from "../../apps/api/src/lib/api-texts.ts";
import { readdirSync, readFileSync as readText, statSync } from "node:fs";
import { ASSET_KINDS, MESSAGES } from "../../packages/shared/src/index.ts";

const out: Record<string, string> = {};
const put = (k: string, v: string | undefined) => { if (v) out[k] = v; };
const fields = (prefix: string, list: Array<{ key: string; label: string; hint?: string; placeholder?: string; options?: Array<{ value: string; label: string }> }>) => {
  for (const f of list) {
    put(`${prefix}.${f.key}.label`, f.label); put(`${prefix}.${f.key}.hint`, f.hint); put(`${prefix}.${f.key}.placeholder`, f.placeholder);
    for (const o of f.options ?? []) put(`${prefix}.${f.key}.option.${o.value}`, o.label);
  }
};
for (const t of MONITOR_TYPES) {
  put(`def.monitor.${t.id}.label`, t.label); put(`def.monitor.${t.id}.description`, t.description); put(`def.monitor_category.${t.category}`, t.category);
  fields(`def.monitor.${t.id}.field`, t.fields);
}
for (const k of CREDENTIAL_KIND_DEFS) { put(`def.credential.${k.id}.label`, k.label); fields(`def.credential.${k.id}.field`, k.fields); }
for (const c of CHANNEL_TYPES.filter((c) => !c.id.startsWith("kuma:"))) {
  put(`def.channel.${c.id}.label`, c.label); put(`def.channel.${c.id}.description`, c.description);
  fields(`def.channel.${c.id}.field`, c.fields);
}
for (const g of new Set(CHANNEL_TYPES.map((c) => c.group))) put(`def.channel_group.${g}`, g);
for (const t of MONITOR_TEMPLATES) { put(`def.template.${t.id}.label`, t.label); put(`def.template.${t.id}.description`, t.description); }
for (const [k, v] of Object.entries(ASSET_KINDS)) put(`def.asset_kind.${k}`, v as string);
for (const e of NOTIFY_EVENTS) put(`def.event.${e.id}`, e.label);
// description of every Uptime Kuma channel type (apps/web/src/defs.ts)
put("def.kuma_description", "Uptime Kuma provider ({category})");
// server-generated messages (check results, incident titles, summaries): packages/shared/src/messages.ts
for (const [code, text] of Object.entries(MESSAGES)) put(`msg.${code}`, text);
// notifications and emails: packages/notify/src/texts.ts
for (const [key, text] of Object.entries(NOTIFY_TEXTS)) put(key, text);
// PDF reports and report emails: packages/reports/src/texts.ts
for (const [key, text] of Object.entries(REPORT_TEXTS)) put(key, text);

/* ---------- API error messages (api.*) ----------
 * Error messages stay English in the code; this scan collects them so they can be translated.
 * `${expr}` becomes {name} (the last identifier of the expression); helper calls that compose a
 * sentence from a noun (notFound("Application"), assertOwned(row, t, "This application")) are
 * expanded to full sentences so each is translated whole.                                        */
const apiTexts = new Set<string>(API_TEXTS);
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const full = `${dir}/${f}`;
  return statSync(full).isDirectory() ? files(full) : full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
});
const literal = (lit: string): string => {
  if (!lit.startsWith("`")) return JSON.parse(lit);
  const seen = new Map<string, number>();
  return lit.slice(1, -1).replace(/\$\{([^}]*)\}/g, (_, expr: string) => {
    const base = expr.match(/(\w+)\s*\)?\s*$/)?.[1] ?? "value";
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    return `{${n > 1 ? `${base}${n}` : base}}`;
  }).replace(/\\"/g, '"');
};
const STR = String.raw`("(?:[^"\\]|\\.)*"|\`[^\`]*\`)`;
const root = new URL("../..", import.meta.url).pathname;
for (const f of files(`${root}apps/api/src`)) {
  const src = readText(f, "utf8");
  for (const m of src.matchAll(new RegExp(String.raw`new HttpError\(\s*\d+,\s*"[a-z_]+",\s*` + STR + String.raw`([^\n]*)`, "g"))) {
    apiTexts.add(literal(m[1]!));
    for (const fm of m[2]!.matchAll(/\w+:\s*("(?:[^"\\]|\\.)*")/g)) { const t = JSON.parse(fm[1]!); if (/^[A-Z]/.test(t)) apiTexts.add(t); }
  }
  for (const m of src.matchAll(new RegExp(String.raw`\b(?:conflict|forbidden|unauthorized)\(\s*` + STR, "g"))) apiTexts.add(literal(m[1]!));
  for (const m of src.matchAll(/\bnotFound\(\s*"([^"]+)"\s*\)/g)) apiTexts.add(`${m[1]} not found`);
  for (const m of src.matchAll(/\bnotSelf\([^\n;]*?,\s*"([^"]+)"\s*\)/g)) apiTexts.add(`You cannot ${m[1]} your own account here`);
  const owners = new Set(["This item", ...[...src.matchAll(/\bassertOwned\([^\n;]*?,\s*[\w.]+,\s*"([^"]+)"\s*\)/g)].map((m) => m[1]!)]);
  if (src.includes("assertOwned(")) for (const o of owners) {
    apiTexts.add(`${o} belongs to another tenant and can only be changed there`);
    apiTexts.add(`${o} belongs to the Global infrastructure scope and can only be changed there`);
  }
}
// validation messages written in the schemas
for (const f of [`${root}packages/shared/src/validation.ts`, `${root}packages/notify/src/definitions.ts`, `${root}packages/monitors/src/definitions.ts`, `${root}packages/monitors/src/definitions-extra.ts`, `${root}packages/monitors/src/credentials.ts`, `${root}apps/api/src/routes/credentials.ts`]) {
  const src = readText(f, "utf8");
  for (const m of src.matchAll(/,\s*"([A-Z][^"]{2,200})"\s*\)/g)) apiTexts.add(m[1]!);
  for (const m of src.matchAll(/message:\s*"([^"]+)"/g)) apiTexts.add(m[1]!);
}
// shared credentials: required-secret messages and the credential choice errors
for (const f of [`${root}packages/monitors/src/credentials.ts`, `${root}apps/api/src/lib/credentials.ts`]) {
  const src = readText(f, "utf8");
  for (const m of src.matchAll(/(?:=|:)\s*"((?:Enter|Paste) [^"]{2,200})"/g)) apiTexts.add(m[1]!);
  for (const m of src.matchAll(/fieldError\(\s*"([^"]+)"\s*\)/g)) apiTexts.add(m[1]!);
}
// discovery: field messages written inline (ternaries, objects)
{
  const src = readText(`${root}apps/api/src/routes/discovery.ts`, "utf8");
  for (const m of src.matchAll(/[:?,(]\s*"([A-Z][^"]{5,200})"/g)) if (/\s/.test(m[1]!) && !/^(BEGIN|NOTIFY|SELECT|COMMIT)\b/.test(m[1]!)) apiTexts.add(m[1]!);
  for (const m of src.matchAll(/:\s*(`Not a network[^`]*`)/g)) apiTexts.add(literal(m[1]!));
}
// SMTP diagnostics (packages/shared/src/smtp.ts)
for (const m of readText(`${root}packages/shared/src/smtp.ts`, "utf8").matchAll(/return (`[^`]*`)/g)) apiTexts.add(literal(m[1]!));
// the generic frame inside assertOwned itself: its concrete sentences are generated above
for (const frame of ["{what} belongs to {value} and can only be changed there", "{what} not found", "You cannot {what} your own account here"]) apiTexts.delete(frame);
const apiKeys = new Map<string, string>();
for (const text of [...apiTexts].sort()) {
  let key = "api." + text.toLowerCase().replace(/\{(\w+)\}/g, "$1").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60).replace(/_$/, "");
  for (let n = 2; apiKeys.has(key); n++) key = key.replace(/_\d+$/, "") + `_${n}`;
  apiKeys.set(key, text);
  put(key, text);
}

const p = "locales/en.json";
const en = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
const kept = Object.fromEntries(Object.entries(en).filter(([k]) => !k.startsWith("def.") && !k.startsWith("msg.") && !k.startsWith("notify.") && !k.startsWith("report.") && !k.startsWith("api.")));
const { _meta, ...rest } = { ...kept, ...out } as Record<string, unknown>;
fs.writeFileSync(p, JSON.stringify({ _meta, ...Object.fromEntries(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b))) }, null, 2) + "\n");
console.log(`${Object.keys(out).length} definition texts`);
