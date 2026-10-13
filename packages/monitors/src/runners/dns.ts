import { promises as dns } from "node:dns";
import { down, elapsed, errorPart, result, type Runner } from "./types.js";

export const dnsRunner: Runner = async (cfg, ctx) => {
  const resolver = new dns.Resolver({ timeout: ctx.timeoutMs, tries: 1 });
  if (cfg.server) resolver.setServers([String(cfg.server)]);
  const name = String(cfg.hostname);
  const type = String(cfg.recordType ?? "A");
  const start = process.hrtime.bigint();
  try {
    let answers: string[];
    switch (type) {
      case "MX": answers = (await resolver.resolveMx(name)).map((r) => `${r.priority} ${r.exchange}`); break;
      case "TXT": answers = (await resolver.resolveTxt(name)).map((r) => r.join("")); break;
      default: answers = (await resolver.resolve(name, type)) as string[];
    }
    const ms = elapsed(start);
    const list = answers.join(", ");
    const expected = String(cfg.expected ?? "").toLowerCase();
    if (expected && !list.toLowerCase().includes(expected)) {
      return down([list ? ["dns.missing", { answer: list.slice(0, 200), expected: String(cfg.expected) }] : ["dns.empty", { expected: String(cfg.expected) }]], ms);
    }
    return result("UP", ms, [`${type} ${list.slice(0, 200)}`, ["latency", { ms }]]);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return down([["dns.noRecord", { type, name }]]);
    return down([errorPart(err, ctx.timeoutMs)]);
  }
};
