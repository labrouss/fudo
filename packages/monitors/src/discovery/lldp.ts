/**
 * Switch neighbours: each switch's LLDP table (LLDP-MIB) and, on Cisco, CDP — who is connected to
 * which port. Neighbours that are not network devices (servers, ESXi hosts, storage) depend on the
 * switch they hang off; links between switches are listed but get no dependency (either side may be
 * the core).
 */
import { openSession, text, type Session, type Varbind } from "../runners/snmp-session.js";
import { classify, shortName } from "./classify.js";
import { snmpAccess } from "./subnet.js";
import { parseTargets } from "./targets.js";
import { eachLimit, type Source } from "./types.js";

const LLDP_REM = "1.0.8802.1.1.2.1.4.1.1", LLDP_MAN = "1.0.8802.1.1.2.1.4.2.1.3", LLDP_LOC_PORT = "1.0.8802.1.1.2.1.3.7.1";
const CDP = "1.3.6.1.4.1.9.9.23.1.2.1.1";
const IF_NAME = "1.3.6.1.2.1.31.1.1.1.1", IF_DESCR = "1.3.6.1.2.1.2.2.1.2";
const SYS = ["1.3.6.1.2.1.1.1.0", "1.3.6.1.2.1.1.2.0", "1.3.6.1.2.1.1.5.0"];
const NETWORK = new Set(["switch", "router", "firewall", "fc-switch"]);

export interface Neighbour { localPort: string; remotePort: string; name: string; description: string; address: string; chassis: string; protocol: "LLDP" | "CDP"; platform?: string }

const col = async (s: Session, base: string) => s.column(base, 30).catch(() => new Map<string, Varbind>());
const ipFromHex = (b: unknown) => (Buffer.isBuffer(b) && b.length === 4 ? [...b].join(".") : "");
const hexOf = (v: Varbind | undefined) => (v && Buffer.isBuffer(v.value) ? [...(v.value as Buffer)].map((x) => x.toString(16).padStart(2, "0")).join(":") : text(v));

/** LLDP neighbours: remote table indexed timeMark.localPortNum.index; management addresses from the address table. */
export async function lldpNeighbours(s: Session): Promise<Neighbour[]> {
  const [chassis, portId, portDesc, sysName, sysDesc] = await Promise.all([4, 7, 8, 9, 10].map((c) => col(s, `${LLDP_REM}.${c}`)));
  if (!sysName!.size && !chassis!.size) return [];
  const [locId, locDesc, man] = await Promise.all([col(s, `${LLDP_LOC_PORT}.3`), col(s, `${LLDP_LOC_PORT}.4`), col(s, LLDP_MAN)]);
  const addrOf = new Map<string, string>();
  for (const oid of man.keys()) {
    // index: timeMark.localPort.remIndex.addrSubtype.len.a.b.c.d (IPv4 = subtype 1, length 4)
    const p = oid.split(".");
    if (p[3] === "1" && p[4] === "4" && p.length >= 9) addrOf.set(p.slice(0, 3).join("."), p.slice(5, 9).join("."));
  }
  return [...new Set([...chassis!.keys(), ...sysName!.keys()])].map((ix) => {
    const local = ix.split(".")[1]!;
    return {
      localPort: text(locDesc.get(local)) || text(locId.get(local)) || local, remotePort: text(portDesc!.get(ix)) || hexOf(portId!.get(ix)),
      name: text(sysName!.get(ix)), description: text(sysDesc!.get(ix)), address: addrOf.get(ix) ?? "", chassis: hexOf(chassis!.get(ix)), protocol: "LLDP" as const,
    };
  });
}

/** CDP neighbours (Cisco): cache table indexed ifIndex.deviceIndex. */
export async function cdpNeighbours(s: Session): Promise<Neighbour[]> {
  const [addr, devId, devPort, platform] = await Promise.all([4, 6, 7, 8].map((c) => col(s, `${CDP}.${c}`)));
  if (!devId!.size) return [];
  const [names, descrs] = await Promise.all([col(s, IF_NAME), col(s, IF_DESCR)]);
  return [...devId!.keys()].map((ix) => {
    const ifIndex = ix.split(".")[0]!;
    return {
      localPort: text(names.get(ifIndex)) || text(descrs.get(ifIndex)) || ifIndex, remotePort: text(devPort!.get(ix)), name: text(devId!.get(ix)).replace(/\(.*\)$/, ""),
      description: text(platform!.get(ix)), platform: text(platform!.get(ix)), address: ipFromHex(addr!.get(ix)?.value), chassis: "", protocol: "CDP" as const,
    };
  });
}


export const lldpSource: Source = async (params, ctx) => {
  const parsed = parseTargets(String(params.targets ?? ""), 512);
  if (!parsed.ok) throw new Error(parsed.error === "tooMany" ? `Too many switches (${parsed.count})` : `Not an address, range or host name: ${parsed.entry}`);
  const access = await snmpAccess(params.credentialIds, ctx);
  if (!access.length) throw new Error("Choose at least one SNMP credential: neighbour tables are read over SNMP");
  let done = 0;
  ctx.progress(0, parsed.targets.length);
  await eachLimit(parsed.targets, 8, ctx, async (target) => {
    for (const a of access) {
      const s = openSession({ ...a.cfg, host: target }, 4000);
      try {
        const sys = await s.get(SYS);
        const self = classify({ address: target, ping: true, ports: [], snmp: { sysDescr: text(sys[0]), sysObjectID: text(sys[1]), sysName: text(sys[2]) } });
        const swKey = `dev:${shortName(text(sys[2]) || target).toLowerCase()}`;
        const neighbours = [...(await lldpNeighbours(s)), ...(await cdpNeighbours(s))];
        await ctx.found({ key: swKey, address: target, name: self.name, category: NETWORK.has(self.category) ? self.category : "switch", vendor: self.vendor, model: self.model, os: self.os,
          template: "network-device", assetKind: NETWORK.has(self.category) ? self.assetKind : "switch",
          details: { source: "lldp", snmp: { sysDescr: text(sys[0]), sysName: text(sys[2]) }, snmpCredential: a.id, links: neighbours.map((n) => ({ port: n.localPort, to: n.name || n.address || n.chassis, toPort: n.remotePort, protocol: n.protocol })) } });
        // one result per neighbour (the same device seen by several switches merges into one)
        for (const n of neighbours) {
          const name = n.name ? shortName(n.name) : n.address || n.chassis;
          if (!name) continue;
          const looks = classify({ address: n.address || name, ping: false, ports: [], snmp: n.description ? { sysDescr: n.description, sysObjectID: "", sysName: n.name } : null });
          const network = NETWORK.has(looks.category);
          await ctx.found({
            key: `dev:${name.toLowerCase()}`, address: n.address, name, category: looks.category, vendor: looks.vendor, model: looks.model, os: looks.os,
            template: n.address ? looks.template : "none", assetKind: looks.assetKind,
            dependsOn: network ? [] : [swKey], parentKey: network ? null : swKey,
            details: { source: "lldp", via: [{ switch: self.name, port: n.localPort, remotePort: n.remotePort, protocol: n.protocol }], description: n.description, chassis: n.chassis || null },
          }, { merge: true });
        }
        break;
      } catch (err) { ctx.log.debug({ err, target }, "neighbour tables"); } finally { s.close(); }
    }
    ctx.progress(++done, parsed.targets.length);
  });
};
