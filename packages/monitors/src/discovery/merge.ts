import type { Found } from "./types.js";

/** A device reported again (seen by several switches, or scanned itself): combine both reports. */
export function mergeFound(old: Found, f: Found): Found {
  const richer = Boolean((f.details as { snmp?: unknown }).snmp) || old.category === "other";
  const base = richer ? { ...old, ...f } : { ...f, ...old };
  const via = [...(((old.details.via as unknown[]) ?? [])), ...(((f.details.via as unknown[]) ?? []))];
  return {
    ...base,
    address: old.address || f.address,
    template: (old.address || f.address) && base.template === "none" ? (richer ? f.template : old.template) || "" : base.template,
    dependsOn: [...new Set([...(old.dependsOn ?? []), ...(f.dependsOn ?? [])])].filter((k) => k !== base.key),
    details: { ...old.details, ...f.details, ...(via.length ? { via } : {}), ...(old.details.links && !f.details.links ? { links: old.details.links } : {}) },
  };
}

