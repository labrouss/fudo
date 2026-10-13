import tls from "node:tls";
import net from "node:net";
import { down, elapsed, errorPart, result, type Runner } from "./types.js";

const DAY = 86_400_000;

export const tlsRunner: Runner = (cfg, ctx) =>
  new Promise((resolve) => {
    const host = String(cfg.host);
    const servername = String(cfg.servername || (net.isIP(host) ? "" : host)) || undefined;
    const start = process.hrtime.bigint();
    const socket = tls.connect({ host, port: Number(cfg.port ?? 443), servername, rejectUnauthorized: false });
    const done = (r: Awaited<ReturnType<Runner>>) => { socket.destroy(); resolve(r); };
    socket.setTimeout(ctx.timeoutMs, () => done(down([["net.timeout", { s: ctx.timeoutMs / 1000 }]])));
    socket.once("error", (err) => done(down([errorPart(err, ctx.timeoutMs)])));
    socket.once("secureConnect", () => {
      const ms = elapsed(start);
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) return done(down([["tls.none"]], ms));
      const expires = new Date(cert.valid_to);
      const daysLeft = Math.floor((expires.getTime() - Date.now()) / DAY);
      const subject = [cert.subject?.CN ?? host].flat().join(", ");
      const issuer = [cert.issuer?.O ?? cert.issuer?.CN ?? "?"].flat().join(", ");
      const data = { certDaysLeft: daysLeft, expires: expires.toISOString() };
      if (daysLeft < 0) return done(down([["tls.expiredAgo", { subject, days: -daysLeft }]], ms, data));
      if (!socket.authorized && !cfg.allowUntrusted) {
        return done(down([["tls.notTrusted"], errorPart({ code: String(socket.authorizationError) }, ctx.timeoutMs)], ms, data));
      }
      done(result(daysLeft <= Number(cfg.warnDays ?? 21) ? "DEGRADED" : "UP", ms, [subject, ["tls.daysLeft", { days: daysLeft, date: expires.toISOString().slice(0, 10) }], issuer], data));
    });
  });
