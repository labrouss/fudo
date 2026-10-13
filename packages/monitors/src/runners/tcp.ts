import net from "node:net";
import { down, elapsed, errorPart, result, withDegraded, type Runner } from "./types.js";

export const tcpRunner: Runner = (cfg, ctx) =>
  new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const socket = net.connect({ host: String(cfg.host), port: Number(cfg.port) });
    const done = (r: Awaited<ReturnType<Runner>>) => { socket.destroy(); resolve(r); };
    socket.setTimeout(ctx.timeoutMs, () => done(down([["net.timeout", { s: ctx.timeoutMs / 1000 }]])));
    socket.once("connect", () => {
      const ms = elapsed(start);
      done(result(withDegraded(ms, cfg.degradedLatencyMs) ? "DEGRADED" : "UP", ms, [["tcp.open", { port: Number(cfg.port) }], ["latency", { ms }]]));
    });
    socket.once("error", (err) => done(down([errorPart(err, ctx.timeoutMs)])));
  });
