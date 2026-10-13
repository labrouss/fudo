import { execFile } from "node:child_process";
import type { MsgPart } from "@fudo/shared";
import { down, result, withDegraded, type Runner } from "./types.js";

/**
 * Uses the system ping binary (iputils or busybox), so no raw-socket privileges are needed in
 * Node itself; the container needs CAP_NET_RAW. Host is validated to never start with "-".
 */
export const pingRunner: Runner = (cfg, ctx) =>
  new Promise((resolve) => {
    const count = Number(cfg.packets ?? 3);
    const deadline = Math.max(1, Math.ceil(ctx.timeoutMs / 1000));
    const args = ["-n", "-c", String(count), "-w", String(deadline), String(cfg.host)];
    execFile("ping", args, { timeout: ctx.timeoutMs + 2000 }, (err, stdout, stderr) => {
      const out = `${stdout}\n${stderr}`;
      const loss = Number(/([\d.]+)% packet loss/.exec(out)?.[1] ?? NaN);
      const avg = Number(/=\s*[\d.]+\/([\d.]+)\//.exec(out)?.[1] ?? NaN);
      if (Number.isNaN(loss)) {
        const e = err as (NodeJS.ErrnoException & { killed?: boolean }) | null;
        const reason: MsgPart = e?.code === "ENOENT" ? ["ping.missing"] : e?.killed ? ["net.timeout", { s: deadline }] : (stderr.trim().split("\n").pop() || ["ping.failed"]);
        return resolve(down([reason]));
      }
      const latencyMs = Number.isNaN(avg) ? null : avg < 10 ? Math.round(avg * 100) / 100 : Math.round(avg * 10) / 10;
      if (loss >= 100) return resolve(down([["ping.noReply", { count }]], null, { lossPct: 100 }));
      const degraded = loss > Number(cfg.degradedLossPct ?? 20) || (latencyMs !== null && withDegraded(latencyMs, cfg.degradedLatencyMs));
      resolve(result(degraded ? "DEGRADED" : "UP", latencyMs, [latencyMs === null ? "? ms" : ["ping.avg", { ms: latencyMs }], ["ping.loss", { loss }]], { lossPct: loss }));
    });
  });
