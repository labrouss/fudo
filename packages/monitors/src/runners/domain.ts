import net from "node:net";
import { fetch } from "undici";
import { down, result, type Runner } from "./types.js";

let bootstrap: { at: number; services: Array<[string[], string[]]> } | null = null;

/** Expiry date from an RDAP domain object (event "expiration"). */
export function rdapExpiry(obj: unknown): Date | null {
  const events = (obj as { events?: Array<{ eventAction?: string; eventDate?: string }> })?.events ?? [];
  const e = events.find((x) => x.eventAction === "expiration");
  return e?.eventDate ? new Date(e.eventDate) : null;
}

/** Expiry date from WHOIS text (common registry formats). */
export function whoisExpiry(text: string): Date | null {
  const m = /(?:Registry Expiry Date|Registrar Registration Expiration Date|Expiration Date|Expiry Date|Expiry date|Expires On|expires|paid-till|Valid Until|Expiration Time)\s*[:.]*\s*([0-9]{4}[-./][0-9]{2}[-./][0-9]{2}(?:[T ][0-9:.]+Z?)?|[0-9]{2}[-./][0-9]{2}[-./][0-9]{4})/i.exec(text);
  if (!m) return null;
  let s = m[1]!.trim();
  if (/^[0-9]{2}[-./]/.test(s)) { const [d, mo, y] = s.split(/[-./]/); s = `${y}-${mo}-${d}`; }
  const d = new Date(s.replace(/\./g, "-").replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function whois(server: string, query: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host: server, port: 43 });
    let out = "";
    s.setTimeout(timeoutMs, () => { s.destroy(); reject(new Error(`WHOIS ${server} timed out`)); });
    s.on("connect", () => s.write(`${query}\r\n`));
    s.on("data", (d) => { out += d.toString("utf8"); if (out.length > 200_000) s.destroy(); });
    s.on("end", () => resolve(out));
    s.on("close", () => resolve(out));
    s.on("error", reject);
  });
}

async function rdapLookup(domain: string, timeoutMs: number): Promise<Date | null | "unsupported"> {
  if (!bootstrap || Date.now() - bootstrap.at > 86_400_000) {
    const r = await fetch("https://data.iana.org/rdap/dns.json", { signal: AbortSignal.timeout(timeoutMs) });
    bootstrap = { at: Date.now(), services: ((await r.json()) as { services: Array<[string[], string[]]> }).services };
  }
  const labels = domain.split(".");
  let base: string | undefined;
  for (let i = 1; i < labels.length && !base; i++) {
    const suffix = labels.slice(i).join(".");
    base = bootstrap.services.find(([tlds]) => tlds.includes(suffix))?.[1][0];
  }
  if (!base) return "unsupported";
  const r = await fetch(`${base.replace(/\/?$/, "/")}domain/${domain}`, { headers: { accept: "application/rdap+json" }, signal: AbortSignal.timeout(timeoutMs) });
  if (r.status === 404) throw new Error("Domain not found in the registry");
  if (!r.ok) throw new Error(`RDAP HTTP ${r.status}`);
  return rdapExpiry(await r.json());
}

export const domainRunner: Runner = async (cfg, ctx) => {
  const domain = String(cfg.domain);
  const started = Date.now();
  let expiry: Date | null = null, via = "RDAP";
  const rd = await rdapLookup(domain, ctx.timeoutMs).catch((err: Error) => err);
  if (rd instanceof Error && /not found/.test(rd.message)) return down([rd.message]);
  if (rd instanceof Date) expiry = rd;
  if (!expiry) {
    via = "WHOIS";
    const tld = domain.split(".").pop()!;
    const iana = await whois("whois.iana.org", tld, ctx.timeoutMs).catch(() => "");
    const server = /^whois:\s*(\S+)/im.exec(iana)?.[1];
    if (!server) return result("DEGRADED", null, [["domain.noService", { tld }]]);
    expiry = whoisExpiry(await whois(server, domain, ctx.timeoutMs).catch((e: Error) => { throw new Error(`WHOIS ${server}: ${e.message}`); }));
    if (!expiry) return result("DEGRADED", null, [["domain.noExpiry", { server, domain }]]);
  }
  const days = Math.floor((expiry.getTime() - Date.now()) / 86_400_000);
  const when = expiry.toISOString().slice(0, 10);
  const latencyMs = Date.now() - started;
  if (days < 0) return down([["domain.expired", { date: when }]], latencyMs, { daysLeft: days });
  return result(days <= Number(cfg.warnDays) ? "DEGRADED" : "UP", latencyMs, [["domain.expires", { date: when, days }], via], { daysLeft: days });
};
