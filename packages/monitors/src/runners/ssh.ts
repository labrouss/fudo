import { createHash } from "node:crypto";
import { Client } from "ssh2";
import type { MsgPart } from "@fudo/shared";
import { down, elapsed, errorPart, result, withDegraded, type Runner } from "./types.js";

/** Evaluates command output against the configured check. */
export function sshVerdict(mode: string, expected: string, out: string, code: number | null): { ok: boolean; why: MsgPart } {
  const trimmed = out.trim();
  switch (mode) {
    case "exitCode": return { ok: code === 0, why: ["ssh.exitCode", { code: code ?? "?" }] };
    case "contains": return { ok: out.includes(expected), why: [out.includes(expected) ? "ssh.contains" : "ssh.notContains", { expected }] };
    case "notContains": return { ok: !out.includes(expected), why: [out.includes(expected) ? "ssh.contains" : "ssh.notContains", { expected }] };
    case "exact": return { ok: trimmed === expected.trim(), why: trimmed === expected.trim() ? ["ssh.matches"] : ["ssh.is", { output: trimmed.slice(0, 80) }] };
    case "regex": { const ok = new RegExp(expected, "m").test(out); return { ok, why: [ok ? "ssh.regexMatch" : "ssh.regexNoMatch", { pattern: expected }] }; }
  }
  return { ok: false, why: ["ssh.unknown"] };
}

export const sshRunner: Runner = (cfg, ctx) =>
  new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const conn = new Client();
    let settled = false, out = "", err = "";
    const done = (r: Awaited<ReturnType<Runner>>) => { if (settled) return; settled = true; clearTimeout(timer); conn.end(); resolve(r); };
    const timer = setTimeout(() => done(down([["net.timeout", { s: ctx.timeoutMs / 1000 }]])), ctx.timeoutMs);
    const pinned = String(cfg.hostKeySha256 ?? "").replace(/^SHA256:/, "").replace(/=+$/, "");
    let keyMismatch = false;
    conn.on("ready", () => {
      conn.exec(String(cfg.command), (e, stream) => {
        if (e) return done(down([["ssh.execFailed", { error: e.message }]]));
        stream.on("data", (d: Buffer) => { if (out.length < 100_000) out += d.toString("utf8"); });
        stream.stderr.on("data", (d: Buffer) => { if (err.length < 10_000) err += d.toString("utf8"); });
        stream.on("close", (code: number | null) => {
          const ms = elapsed(start);
          const v = sshVerdict(String(cfg.matchMode), String(cfg.expected ?? ""), out, code);
          const first = (out.trim() || err.trim()).split("\n")[0]?.slice(0, 100) ?? "";
          done(result(v.ok ? (withDegraded(ms, cfg.degradedLatencyMs) ? "DEGRADED" : "UP") : "DOWN", ms, first && cfg.matchMode !== "exact" ? [v.why, first] : [v.why], code === null ? undefined : { exitCode: code }));
        });
      });
    });
    conn.on("error", (e: Error & { level?: string }) => done(down([keyMismatch ? ["ssh.hostKey"] : e.level === "client-authentication" ? ["ssh.auth"] : errorPart(e, ctx.timeoutMs)])));
    conn.connect({
      host: String(cfg.host), port: Number(cfg.port), username: String(cfg.username), readyTimeout: ctx.timeoutMs,
      ...(cfg.authMethod === "key" ? { privateKey: String(cfg.privateKey), passphrase: String(cfg.passphrase || "") || undefined } : { password: String(cfg.password), tryKeyboard: true }),
      hostVerifier: pinned ? (key: Buffer) => { const ok = createHash("sha256").update(key).digest("base64").replace(/=+$/, "") === pinned; keyMismatch = !ok; return ok; } : undefined,
    });
    if (cfg.authMethod !== "key") conn.on("keyboard-interactive", (_n, _i, _l, prompts, finish) => finish(prompts.map(() => String(cfg.password))));
  });
