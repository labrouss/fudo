/**
 * Message formatting shared by the web app and the server: {name} placeholders and ICU-style plurals
 * "{count, plural, one {# monitor} other {# monitors}}". Numbers are written with the language's decimal
 * separator but without digit grouping, so ports, years and ids stay as they are (3000, not 3.000).
 */
const pluralRules = new Map<string, Intl.PluralRules>();
const numberFormats = new Map<string, Intl.NumberFormat>();

export function formatNumber(n: number, numberLocale: string): string {
  let f = numberFormats.get(numberLocale);
  if (!f) {
    try { f = new Intl.NumberFormat(numberLocale, { useGrouping: false, maximumFractionDigits: 2 }); } catch { f = new Intl.NumberFormat("en", { useGrouping: false, maximumFractionDigits: 2 }); }
    numberFormats.set(numberLocale, f);
  }
  return f.format(n);
}

export function formatMessage(msg: string, params: Record<string, unknown> | undefined, lang: string, numberLocale = lang): string {
  if (!params) return msg;
  let out = "", i = 0;
  while (i < msg.length) {
    const open = msg.indexOf("{", i);
    if (open < 0) { out += msg.slice(i); break; }
    out += msg.slice(i, open);
    let depth = 0, j = open;
    for (; j < msg.length; j++) { if (msg[j] === "{") depth++; else if (msg[j] === "}" && --depth === 0) break; }
    const body = msg.slice(open + 1, j);
    const m = /^\s*(\w+)\s*,\s*plural\s*,(.*)$/s.exec(body);
    if (m) {
      const n = Number(params[m[1]!]);
      const cases = new Map<string, string>();
      for (const c of m[2]!.matchAll(/(=\d+|zero|one|two|few|many|other)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) cases.set(c[1]!, c[2]!);
      let rules = pluralRules.get(lang);
      if (!rules) { try { rules = new Intl.PluralRules(lang); } catch { rules = new Intl.PluralRules("en"); } pluralRules.set(lang, rules); }
      const chosen = cases.get(`=${n}`) ?? cases.get(rules.select(n)) ?? cases.get("other") ?? "";
      out += formatMessage(chosen.replace(/#/g, formatNumber(n, numberLocale)), params, lang, numberLocale);
    } else {
      const v = params[body.trim()];
      out += v === undefined || v === null ? `{${body}}` : typeof v === "number" ? formatNumber(v, numberLocale) : String(v);
    }
    i = j + 1;
  }
  return out;
}
