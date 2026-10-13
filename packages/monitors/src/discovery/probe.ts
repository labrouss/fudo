/**
 * Probing one address for a subnet scan: ping, a few TCP ports, SNMP (with the credentials given,
 * first that answers), and over HTTPS the Redfish service root (BMCs) or the vSphere API (ESXi,
 * vCenter) plus the certificate's name. Everything has a short timeout; nothing is written.
 */
import { execFile } from "node:child_process";
import dns from "node:dns/promises";
import net from "node:net";
import https from "node:https";
import { openSession, text } from "../runners/snmp-session.js";
import type { HostInfo } from "./classify.js";

export const SCAN_PORTS = [22, 23, 80, 135, 443, 445, 902, 1433, 3389, 5985, 8080];
const SYS = { descr: "1.3.6.1.2.1.1.1.0", objectId: "1.3.6.1.2.1.1.2.0", name: "1.3.6.1.2.1.1.5.0" };

export interface ProbeOptions {
  /** SNMP access to try, in order (opened configs: version, community or v3 user…) */
  snmp: Array<{ id: string; cfg: Record<string, unknown> }>;
  timeoutMs: number;
  ports?: number[];
}
export interface ProbeResult extends HostInfo { snmpCredential?: string | null }

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

function ping(ip: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("ping", ["-n", "-c", "1", "-w", String(Math.max(1, Math.ceil(timeoutMs / 1000))), ip], { timeout: timeoutMs + 1500 }, (err) => resolve(!err));
  });
}

export function tcpOpen(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (ok: boolean) => { s.destroy(); resolve(ok); };
    s.setTimeout(timeoutMs, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

/** One HTTPS GET without verifying the certificate (devices use self-signed ones). */
export function httpsGet(host: string, path: string, timeoutMs: number, port = 443): Promise<{ status: number; body: string; certName: string | null } | null> {
  return new Promise((resolve) => {
    const req = https.request({ host, port, path, method: "GET", rejectUnauthorized: false, timeout: timeoutMs, headers: { accept: "application/json, */*", "user-agent": "Fudo discovery" } }, (res) => {
      let body = "";
      const cert = (res.socket as unknown as { getPeerCertificate?: () => { subject?: { CN?: string } } }).getPeerCertificate?.();
      res.setEncoding("utf8");
      res.on("data", (c: string) => { if (body.length < 200_000) body += c; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, certName: cert?.subject?.CN ?? null }));
    });
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
    req.end();
  });
}

async function snmpProbe(ip: string, opts: ProbeOptions) {
  for (const c of opts.snmp) {
    const s = openSession({ ...c.cfg, host: ip, port: Number(c.cfg.port ?? 161) }, Math.min(3000, opts.timeoutMs * 2));
    try {
      const vbs = await s.get([SYS.descr, SYS.objectId, SYS.name]);
      return { info: { sysDescr: text(vbs[0]), sysObjectID: text(vbs[1]), sysName: text(vbs[2]) }, credential: c.id };
    } catch { /* not this one */ } finally { s.close(); }
  }
  return null;
}

/** Redfish service root: vendor, product and manager (iLO 5, iDRAC 9…). */
export function readRedfishRoot(body: string): HostInfo["redfish"] {
  try {
    const j = JSON.parse(body);
    if (!j || typeof j !== "object" || !("RedfishVersion" in j)) return null;
    const mgr = j.Oem?.Hpe?.Manager?.[0] ?? j.Oem?.Hp?.Manager?.[0];
    const vendor = j.Vendor ?? (j.Oem?.Hpe || j.Oem?.Hp ? "HPE" : j.Oem?.Dell ? "Dell" : "");
    return { vendor: String(vendor), product: [j.Product, mgr?.ManagerType].filter(Boolean).join(" · "), version: String(mgr?.ManagerFirmwareVersion ?? "") };
  } catch { return null; }
}

export async function probe(target: string, opts: ProbeOptions): Promise<ProbeResult | null> {
  const t = opts.timeoutMs;
  let ip = target, rdns: string | null = null;
  if (!/^[\d.]+$/.test(target)) {
    const a = await withTimeout(dns.lookup(target, { family: 4 }).catch(() => null), 3000, null);
    if (!a) return null;
    ip = a.address; rdns = target;
  }
  const ports = opts.ports ?? SCAN_PORTS;
  const [alive, open, snmp] = await Promise.all([
    ping(ip, t),
    Promise.all(ports.map((p) => tcpOpen(ip, p, t))).then((r) => ports.filter((_, i) => r[i])),
    snmpProbe(ip, opts),
  ]);
  if (!alive && !open.length && !snmp) return null;
  rdns ??= await withTimeout(dns.reverse(ip).then((n) => n[0] ?? null).catch(() => null), 1500, null);
  let redfish: HostInfo["redfish"] = null, vmware: HostInfo["vmware"] = null, certName: string | null = null;
  if (open.includes(443)) {
    const root = await httpsGet(ip, "/redfish/v1/", Math.max(t * 2, 2000));
    certName = root?.certName ?? null;
    if (root && root.status === 200) redfish = readRedfishRoot(root.body);
    if (!redfish) {
      const sdk = await httpsGet(ip, "/sdk/vimServiceVersions.xml", Math.max(t * 2, 2000));
      if (sdk && sdk.status === 200 && /urn:vim25/.test(sdk.body)) {
        const version = /<version>([\d.]+)<\/version>/.exec(sdk.body)?.[1] ?? "";
        // vCenter has the vSphere Automation API; a standalone ESXi host does not
        const cis = await httpsGet(ip, "/rest/com/vmware/cis/session", Math.max(t * 2, 2000));
        vmware = { kind: cis && cis.status !== 404 ? "vcenter" : "esxi", version };
      }
    }
  }
  return { address: ip, ping: alive, ports: open, rdns, snmp: snmp?.info ?? null, snmpCredential: snmp?.credential ?? null, redfish, vmware, certName };
}
