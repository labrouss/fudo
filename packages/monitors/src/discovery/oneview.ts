/**
 * HPE OneView (Synergy, BladeSystem, rack servers): enclosures (frames), server hardware with its
 * iLO address, and interconnects; servers and interconnects depend on their enclosure.
 */
import { fetch } from "undici";
import { insecure } from "../runners/vcenter.js";
import { shortName, templateFor } from "./classify.js";
import type { Source } from "./types.js";

type Obj = Record<string, any>;
const API_VERSION = "2000"; // OneView 6.x+; older appliances answer with their own highest version

export const oneviewSource: Source = async (params, ctx) => {
  const cred = await ctx.credential(String(params.credentialId ?? ""));
  if (!cred || cred.kind !== "password") throw new Error("The shared credential for OneView is missing (it must be an account and password)");
  const host = String(params.host ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const base = `https://${host}`;
  const dispatcher = params.ignoreTls === false ? undefined : insecure;
  const headers = (extra: Record<string, string> = {}) => ({ "x-api-version": API_VERSION, accept: "application/json", "content-type": "application/json", ...extra });
  const login = await fetch(`${base}/rest/login-sessions`, { method: "POST", headers: headers(), dispatcher, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ userName: cred.fields.username, password: cred.secrets.password, ...(params.domain ? { authLoginDomain: params.domain } : {}) }) });
  if (!login.ok) throw new Error(`OneView sign-in failed: HTTP ${login.status}`);
  const session = String(((await login.json()) as Obj).sessionID ?? "");
  const get = async (path: string): Promise<Obj[]> => {
    const out: Obj[] = [];
    let next: string | null = `${path}${path.includes("?") ? "&" : "?"}count=500`;
    while (next && out.length < 5000) {
      const r = await fetch(`${base}${next}`, { headers: headers({ auth: session }), dispatcher, signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`OneView ${path}: HTTP ${r.status}`);
      const b = (await r.json()) as Obj;
      out.push(...((b.members as Obj[]) ?? []));
      next = typeof b.nextPageUri === "string" && b.nextPageUri ? b.nextPageUri : null;
    }
    return out;
  };
  try {
    await ctx.found({ key: "oneview", address: host, name: shortName(host), category: "other", vendor: "HPE", model: "OneView", os: "", template: "", assetKind: "service", details: { source: "oneview" } });
    const [enclosures, servers, interconnects] = await Promise.all([get("/rest/enclosures"), get("/rest/server-hardware"), get("/rest/interconnects")]);
    const total = enclosures.length + servers.length + interconnects.length;
    let done = 0;
    ctx.progress(0, total);
    const encKey = new Map<string, string>();
    for (const e of enclosures) {
      const key = `enc:${e.serialNumber ?? e.uri}`;
      encKey.set(String(e.uri), key);
      await ctx.found({ key, address: "", name: String(e.name), category: "enclosure", vendor: "HPE", model: String(e.model ?? e.enclosureType ?? "Enclosure"), os: "", ...templateFor("enclosure"),
        details: { source: "oneview", serial: e.serialNumber ?? null, status: e.status ?? null, uri: e.uri } });
      ctx.progress(++done, total);
    }
    for (const s of servers) {
      const ilo = ((s.mpHostInfo?.mpIpAddresses ?? []) as Obj[]).map((a) => String(a.address ?? "")).find((a) => /^[\d.]+$/.test(a)) ?? ((s.mpHostInfo?.mpIpAddresses ?? []) as Obj[])[0]?.address ?? "";
      const enc = encKey.get(String(s.locationUri ?? ""));
      const name = s.serverName ? shortName(String(s.serverName)) : String(s.name);
      await ctx.found({
        key: `srv:${s.serialNumber ?? s.uri}`, address: String(ilo), name, category: "server", vendor: "HPE", model: [s.model, s.mpModel && s.mpFirmwareVersion ? `${s.mpModel} ${s.mpFirmwareVersion}` : s.mpModel].filter(Boolean).join(" · "), os: "",
        template: ilo ? templateFor("server").template : "none", assetKind: "server", parentKey: enc ?? null, dependsOn: enc ? [enc] : [],
        details: { source: "oneview", bay: s.name, serial: s.serialNumber ?? null, power: s.powerState ?? null, status: s.status ?? null, iLO: ilo || null, uri: s.uri },
      });
      ctx.progress(++done, total);
    }
    for (const i of interconnects) {
      const ip = ((i.ipAddressList ?? []) as Obj[]).map((a) => String(a.ipAddress ?? "")).find((a) => /^[\d.]+$/.test(a)) ?? "";
      const enc = encKey.get(String(i.enclosureUri ?? ""));
      await ctx.found({
        key: `ic:${i.serialNumber ?? i.uri}`, address: ip, name: String(i.name), category: "switch", vendor: "HPE", model: String(i.model ?? i.productName ?? "Interconnect"), os: String(i.firmwareVersion ?? ""),
        template: ip ? "network-device" : "none", assetKind: "switch", parentKey: enc ?? null, dependsOn: enc ? [enc] : [],
        details: { source: "oneview", serial: i.serialNumber ?? null, status: i.status ?? null, uri: i.uri },
      });
      ctx.progress(++done, total);
    }
  } finally {
    await fetch(`${base}/rest/login-sessions`, { method: "DELETE", headers: headers({ auth: session }), dispatcher, signal: AbortSignal.timeout(5000) }).catch(() => {});
  }
};
