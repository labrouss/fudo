/** Subnet scan: every address of the targets, 64 at a time (see probe.ts and classify.ts). */
import { applyCredential } from "../credentials.js";
import { classify } from "./classify.js";
import { probe } from "./probe.js";
import { parseTargets } from "./targets.js";
import { eachLimit, type Source } from "./types.js";

/** SNMP access to try, from shared credentials (community or v3 user). */
export async function snmpAccess(ids: unknown, ctx: Parameters<Source>[1]) {
  const out: Array<{ id: string; cfg: Record<string, unknown> }> = [];
  for (const id of (Array.isArray(ids) ? ids : []) as string[]) {
    const c = await ctx.credential(id);
    if (c && (c.kind === "snmp-community" || c.kind === "snmpv3")) out.push({ id, cfg: applyCredential("snmp", { version: "v2c", port: 161 }, c) });
  }
  return out;
}

export const subnetSource: Source = async (params, ctx) => {
  const parsed = parseTargets(String(params.targets ?? ""));
  if (!parsed.ok) throw new Error(parsed.error === "tooMany" ? `Too many addresses (${parsed.count})` : `Not an address, range or host name: ${parsed.entry}`);
  const snmp = await snmpAccess(params.credentialIds, ctx);
  const timeoutMs = Math.min(5000, Math.max(300, Number(params.timeoutMs ?? 1000)));
  let done = 0;
  ctx.progress(0, parsed.targets.length);
  await eachLimit(parsed.targets, 64, ctx, async (target) => {
    try {
      const h = await probe(target, { snmp, timeoutMs });
      if (h) {
        const c = classify(h);
        await ctx.found({
          key: h.address, address: h.address, name: c.name, category: c.category, vendor: c.vendor, model: c.model, os: c.os, template: c.template, assetKind: c.assetKind,
          details: { source: "subnet", ping: h.ping, ports: h.ports, rdns: h.rdns ?? null, snmp: h.snmp ?? null, snmpCredential: h.snmpCredential ?? null, redfish: h.redfish ?? null, vmware: h.vmware ?? null, certName: h.certName ?? null },
        });
      }
    } catch (err) { ctx.log.debug({ err, target }, "probe failed"); }
    ctx.progress(++done, parsed.targets.length);
  });
};
