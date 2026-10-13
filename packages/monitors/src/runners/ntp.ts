import dgram from "node:dgram";
import net from "node:net";
import { down, errorPart, result, type Runner } from "./types.js";

const NTP_EPOCH_OFFSET = 2208988800; // seconds between 1900 and 1970
const readTs = (b: Buffer, o: number) => (b.readUInt32BE(o) - NTP_EPOCH_OFFSET) * 1000 + (b.readUInt32BE(o + 4) / 2 ** 32) * 1000;

/** SNTP client (RFC 4330): stratum, round-trip delay and clock offset. */
export const ntpRunner: Runner = (cfg, ctx) =>
  new Promise((resolve) => {
    const sock = dgram.createSocket(net.isIPv6(String(cfg.host)) ? "udp6" : "udp4");
    const done = (r: Awaited<ReturnType<Runner>>) => { clearTimeout(timer); try { sock.close(); } catch { /* closed */ } resolve(r); };
    const timer = setTimeout(() => done(down([["ntp.noResponse", { s: ctx.timeoutMs / 1000 }]])), ctx.timeoutMs);
    const req = Buffer.alloc(48);
    req[0] = 0x23; // LI 0, version 4, mode 3 (client)
    const t1 = Date.now();
    sock.on("error", (err) => done(down([errorPart(err, ctx.timeoutMs)])));
    sock.on("message", (msg) => {
      const t4 = Date.now();
      if (msg.length < 48) return done(down([["ntp.invalid"]]));
      const stratum = msg[1]!;
      if (stratum === 0) return done(down([["ntp.kod", { code: msg.subarray(12, 16).toString("ascii") }]]));
      const t2 = readTs(msg, 32), t3 = readTs(msg, 40);
      const offset = Math.round(((t2 - t1) + (t3 - t4)) / 2);
      const delay = Math.max(0, Math.round((t4 - t1) - (t3 - t2)));
      if (stratum > Number(cfg.maxStratum)) return done(down([stratum >= 16 ? ["ntp.unsync"] : ["ntp.stratumAbove", { stratum, max: Number(cfg.maxStratum) }]], delay, { stratum, offsetMs: offset }));
      const degraded = Math.abs(offset) > Number(cfg.degradedOffsetMs);
      const shown = `${offset > 0 ? "+" : ""}${offset}`;
      done(result(degraded ? "DEGRADED" : "UP", delay, [["ntp.stratum", { stratum }], degraded ? ["ntp.offsetLimit", { offset: shown, limit: Number(cfg.degradedOffsetMs) }] : ["ntp.offset", { offset: shown }]], { stratum, offsetMs: offset }));
    });
    sock.send(req, Number(cfg.port), String(cfg.host));
  });
