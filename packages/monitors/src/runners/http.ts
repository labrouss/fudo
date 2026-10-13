import { Agent, fetch } from "undici";
import { down, elapsed, errorPart, result, withDegraded, type Runner } from "./types.js";

const strict = new Agent({ connect: { rejectUnauthorized: true } });
const lenient = new Agent({ connect: { rejectUnauthorized: false } });
const MAX_BODY = 1024 * 1024;

export function statusAccepted(code: number, spec: string): boolean {
  return spec.split(",").some((part) => {
    const [a, b] = part.split("-").map((x) => Number(x.trim()));
    return b === undefined ? code === a : code >= a! && code <= b;
  });
}

export function parseHeaders(text: string): Record<string, string> {
  const h: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return h;
}

/** Minimal JSON path: $.a.b[0].c */
export function jsonPathGet(value: unknown, path: string): unknown {
  const parts = path.replace(/^\$/, "").match(/\.[^.[\]]+|\[\d+\]/g) ?? [];
  let cur: unknown = value;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = p.startsWith("[") ? (cur as unknown[])[Number(p.slice(1, -1))] : (cur as Record<string, unknown>)[p.slice(1)];
  }
  return cur;
}

async function readLimited(body: AsyncIterable<Uint8Array> | null): Promise<string> {
  if (!body) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const c of body) {
    chunks.push(c);
    size += c.length;
    if (size >= MAX_BODY) break;
  }
  return Buffer.concat(chunks).toString("utf8");
}

export const httpRunner: Runner = async (cfg, ctx) => {
  const start = process.hrtime.bigint();
  const method = String(cfg.method ?? "GET");
  try {
    const res = await fetch(String(cfg.url), {
      method,
      headers: { "user-agent": "Fudo-Monitor/1.0", ...parseHeaders(String(cfg.headers ?? "")) },
      body: method === "GET" || method === "HEAD" || !cfg.body ? undefined : String(cfg.body),
      redirect: cfg.followRedirects === false ? "manual" : "follow",
      dispatcher: cfg.ignoreTls ? lenient : strict,
      signal: AbortSignal.timeout(ctx.timeoutMs),
    });
    const needBody = Boolean(cfg.keyword) || Boolean(cfg.jsonPath);
    const text = needBody ? await readLimited(res.body) : (await res.body?.cancel(), "");
    const ms = elapsed(start);
    const head = `${res.status}${res.statusText ? " " + res.statusText : ""}`;

    if (!statusAccepted(res.status, String(cfg.acceptedStatus ?? "200-299"))) {
      return down([["http.unexpected", { status: head }]], ms);
    }
    if (cfg.keyword) {
      const found = text.includes(String(cfg.keyword));
      if (cfg.keywordMode === "absent" ? found : !found) {
        return down([[cfg.keywordMode === "absent" ? "http.keywordFound" : "http.keywordMissing", { keyword: String(cfg.keyword) }]], ms);
      }
    }
    if (cfg.jsonPath) {
      let json: unknown;
      try { json = JSON.parse(text); } catch { return down([["http.notJson"]], ms); }
      const v = jsonPathGet(json, String(cfg.jsonPath));
      const expected = String(cfg.jsonExpected ?? "");
      if (v === undefined) return down([["http.jsonMissing", { path: String(cfg.jsonPath) }]], ms);
      const actual = typeof v === "object" ? JSON.stringify(v) : String(v);
      if (expected && actual !== expected) return down([["http.jsonMismatch", { path: String(cfg.jsonPath), actual: actual.slice(0, 80), expected }]], ms);
    }
    return result(withDegraded(ms, cfg.degradedLatencyMs) ? "DEGRADED" : "UP", ms, [head, ["latency", { ms }]]);
  } catch (err) {
    return down([errorPart(err, ctx.timeoutMs)]);
  }
};
