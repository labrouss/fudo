import net from "node:net";
import tls from "node:tls";
import { down, elapsed, errorPart, result, withDegraded, type Runner } from "./types.js";

/** Minimal SMTP dialogue: greeting, EHLO, optional STARTTLS, QUIT. Never sends mail. */
export const smtpRunner: Runner = (cfg, ctx) =>
  new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const hostName = String(cfg.host);
    const tlsOpts = { servername: net.isIP(hostName) ? undefined : hostName, rejectUnauthorized: !cfg.ignoreTls };
    let socket: net.Socket = cfg.security === "tls" ? tls.connect({ host: hostName, port: Number(cfg.port), ...tlsOpts }) : net.connect({ host: hostName, port: Number(cfg.port) });
    let buf = "", banner = "", step = "greeting", settled = false, secured = cfg.security === "tls";
    const done = (r: Awaited<ReturnType<Runner>>) => { if (settled) return; settled = true; clearTimeout(timer); try { socket.write("QUIT\r\n"); } catch { /* closed */ } socket.destroy(); resolve(r); };
    const timer = setTimeout(() => done(down([["smtp.timeout", { s: ctx.timeoutMs / 1000, step }]])), ctx.timeoutMs);
    const send = (line: string) => socket.write(`${line}\r\n`);
    const attach = (s: net.Socket) => {
      s.on("data", (d) => onData(d.toString("latin1")));
      s.on("error", (err) => done(down([errorPart(err, ctx.timeoutMs)])));
    };
    function onData(chunk: string) {
      buf += chunk;
      // a reply is complete when its last line has a space after the code ("250 OK", not "250-")
      const lines = buf.split("\r\n");
      if (!lines.slice(0, -1).some((l) => /^\d{3} /.test(l))) return;
      const reply = buf; buf = "";
      const code = Number(reply.slice(0, 3));
      if (step === "greeting") {
        if (code !== 220) return done(down([["smtp.greeting", { reply: reply.trim().slice(0, 120) }]]));
        banner = reply.trim().split("\r\n")[0]!.slice(4, 120);
        step = "ehlo"; send(`EHLO ${cfg.heloName || "fudo.local"}`);
      } else if (step === "ehlo") {
        if (code !== 250) return done(down([["smtp.ehlo", { reply: reply.trim().slice(0, 120) }]]));
        if (cfg.security === "starttls" && !secured) {
          if (!/STARTTLS/i.test(reply)) return done(down([["smtp.noStarttls"]]));
          step = "starttls"; send("STARTTLS");
        } else {
          const ms = elapsed(start);
          done(result(withDegraded(ms, cfg.degradedLatencyMs) ? "DEGRADED" : "UP", ms, secured ? ["TLS", banner] : [banner]));
        }
      } else if (step === "starttls") {
        if (code !== 220) return done(down([["smtp.starttlsRefused", { reply: reply.trim().slice(0, 120) }]]));
        socket.removeAllListeners("data");
        const upgraded = tls.connect({ socket, ...tlsOpts }, () => { secured = true; step = "ehlo"; send(`EHLO ${cfg.heloName || "fudo.local"}`); });
        socket = upgraded; attach(upgraded);
      }
    }
    attach(socket);
  });
