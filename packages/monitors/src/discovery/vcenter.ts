/**
 * vCenter inventory: the vCenter itself, its ESXi hosts (tagged with their cluster) and VMs
 * (address from VMware Tools when it reports one), each VM depending on the host it runs on.
 * vCenter 7.0 U2+ (/api) and 6.5–7.0 (/rest).
 */
import { fetch } from "undici";
import { insecure, login, readJson, type Flavor } from "../runners/vcenter.js";
import { classify, shortName, templateFor } from "./classify.js";
import { eachLimit, type Source } from "./types.js";

type Obj = Record<string, any>;

export const vcenterSource: Source = async (params, ctx) => {
  const cred = await ctx.credential(String(params.credentialId ?? ""));
  if (!cred || cred.kind !== "password") throw new Error("The shared credential for vCenter is missing (it must be an account and password)");
  const host = String(params.host ?? "").trim();
  const base = /^https?:\/\//.test(host) ? host.replace(/\/$/, "") : `https://${host}`;
  const dispatcher = params.ignoreTls === false ? undefined : insecure;
  const timeoutMs = 20_000;
  const s = await login(base, String(cred.fields.username ?? ""), cred.secrets.password ?? "", dispatcher, timeoutMs).catch((err: Error) => { throw new Error(`vCenter sign-in failed: ${err.message}`); });
  const list = async (flavor: Flavor, path: string): Promise<Obj[]> => {
    const r = await fetch(`${base}${flavor === "api" ? `/api${path}` : `/rest${path.replace(/\?(\w+)=/, "?filter.$1=")}`}`, { headers: { "vmware-api-session-id": s.token, accept: "application/json" }, dispatcher, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw new Error(`vCenter ${path}: HTTP ${r.status}`);
    const b = await readJson(r);
    const v = flavor === "rest" ? (b as Obj | undefined)?.value : b;
    return Array.isArray(v) ? (v as Obj[]) : v && typeof v === "object" ? [v as Obj] : [];
  };
  const one = async (path: string): Promise<Obj | null> => (await list(s.flavor, path).catch(() => []))[0] ?? null;

  const vcName = host.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
  await ctx.found({ key: "vcenter", address: vcName, name: shortName(vcName), category: "vcenter", vendor: "VMware", model: "vCenter Server", os: "", ...templateFor("vcenter"), details: { source: "vcenter" } });

  const clusters = await list(s.flavor, "/vcenter/cluster");
  const hostCluster = new Map<string, string>();
  for (const c of clusters) for (const h of await list(s.flavor, `/vcenter/host?clusters=${c.cluster}`)) hostCluster.set(h.host, c.name);
  const hosts = await list(s.flavor, "/vcenter/host");
  const vmsByHost = new Map<string, Obj[]>();
  if (params.includeVms !== false) for (const h of hosts) vmsByHost.set(h.host, await list(s.flavor, `/vcenter/vm?hosts=${h.host}`));
  const allVms = [...vmsByHost.values()].flat().filter((v) => params.poweredOffVms === true || v.power_state === "POWERED_ON");
  let done = 0;
  ctx.progress(0, hosts.length + allVms.length);
  for (const h of hosts) {
    const cluster = hostCluster.get(h.host) ?? null;
    await ctx.found({
      key: `host:${h.host}`, address: String(h.name), name: shortName(String(h.name)), category: "esxi", vendor: "VMware", model: "ESXi", os: "", ...templateFor("esxi"),
      details: { source: "vcenter", moid: h.host, cluster, connection: h.connection_state ?? null, power: h.power_state ?? null, tags: cluster ? [`cluster:${cluster}`] : [] },
    });
    ctx.progress(++done, hosts.length + allVms.length);
  }
  const hostOf = new Map<string, string>();
  for (const [hid, vms] of vmsByHost) for (const v of vms) hostOf.set(v.vm, hid);
  await eachLimit(allVms, 8, ctx, async (v) => {
    // VMware Tools: the guest's address and OS, when it reports them
    const ident = v.power_state === "POWERED_ON" ? await one(`/vcenter/vm/${v.vm}/guest/identity`) : null;
    const address = String(ident?.ip_address ?? ident?.host_name ?? "");
    const guest = String(ident?.full_name?.default_message ?? ident?.full_name ?? ident?.family ?? "");
    const looks = classify({ address: address || v.name, ping: false, ports: [], snmp: guest ? { sysDescr: guest, sysObjectID: "", sysName: "" } : null });
    const category = looks.category === "windows" || looks.category === "linux" ? looks.category : "vm";
    const t = templateFor(category);
    const hid = hostOf.get(v.vm);
    await ctx.found({
      key: `vm:${v.vm}`, address, name: String(v.name), category, vendor: "VMware", model: `VM · ${v.cpu_count ?? "?"} vCPU · ${Math.round(Number(v.memory_size_MiB ?? 0) / 1024)} GB`, os: guest,
      template: address ? t.template : "none", assetKind: t.assetKind, parentKey: hid ? `host:${hid}` : null, dependsOn: hid ? [`host:${hid}`] : [],
      details: { source: "vcenter", moid: v.vm, power: v.power_state, guestHostName: ident?.host_name ?? null, cluster: hid ? hostCluster.get(hid) ?? null : null },
    });
    ctx.progress(++done, hosts.length + allVms.length);
  });
};
