/**
 * What a discovered device probably is, from what answered: Redfish (a BMC), the vSphere API
 * (ESXi or vCenter), SNMP (sysObjectID enterprise, sysDescr) and open ports. The guess picks the
 * monitor template and asset kind offered for review; people can always change it.
 */
export interface HostInfo {
  address: string;
  ping: boolean;
  ports: number[];
  rdns?: string | null;
  snmp?: { sysDescr: string; sysObjectID: string; sysName: string } | null;
  redfish?: { vendor: string; product: string; version: string } | null;
  vmware?: { kind: "esxi" | "vcenter"; version: string } | null;
  certName?: string | null;
}
export interface Classified { category: string; vendor: string; model: string; os: string; template: string; assetKind: string; name: string }

/** IANA enterprise numbers of common infrastructure vendors (sysObjectID 1.3.6.1.4.1.<n>…). */
const ENTERPRISE: Record<string, string> = {
  "9": "Cisco", "11": "HPE", "232": "HPE", "47196": "HPE Aruba", "14823": "HPE Aruba", "25506": "HPE", "2636": "Juniper", "1588": "Brocade",
  "12356": "Fortinet", "25461": "Palo Alto Networks", "30065": "Arista", "674": "Dell", "6027": "Dell", "6876": "VMware", "311": "Microsoft",
  "3375": "F5", "1916": "Extreme Networks", "789": "NetApp", "12925": "HPE", "37447": "HPE Nimble", "12325": "pfSense",
  "41112": "Ubiquiti", "4526": "Netgear", "2011": "Huawei", "10002": "Ubiquiti", "6574": "Synology", "24681": "QNAP", "318": "APC", "534": "Eaton",
};

/** Category from SNMP sysDescr: the most specific match wins. */
const DESCR: Array<[RegExp, string]> = [
  [/3par|primera|alletra|nimble|storeonce|msa \d|storeserv|netapp|ontap|powerstore|unity|isilon/i, "storage"],
  [/fabric os|mds 9|nx-os.*mds|brocade/i, "fc-switch"],
  [/fortigate|fortios|pan-os|palo alto|asa\b|adaptive security appliance|firepower|pfsense|opnsense|sophos|check ?point/i, "firewall"],
  [/\b(ios xr|ios xe)\b.*router|isr\d|asr\d|routeros|junos.*(mx|srx)|vyos/i, "router"],
  [/cisco ios|nx-os|nexus|catalyst|procurve|aruba|arubaos|comware|junos|arista|\beos\b|dell.*(networking|os10)|powerconnect|extremexos|switch|edgeswitch|unifi/i, "switch"],
  [/integrated lights-out|\bilo\b|idrac|bmc|imm\b|xclarity/i, "bmc"],
  [/vmware esxi/i, "esxi"],
  [/windows/i, "windows"],
  [/linux|ubuntu|debian|red hat|rhel|centos|suse|freebsd/i, "linux"],
  [/\bups\b|smart-ups|powerware/i, "ups"],
];

const TEMPLATE: Record<string, { template: string; assetKind: string }> = {
  bmc: { template: "hpe-ilo", assetKind: "bmc" },
  vcenter: { template: "vcenter", assetKind: "vcenter" },
  esxi: { template: "esxi-host", assetKind: "hypervisor" },
  switch: { template: "network-device", assetKind: "switch" },
  "fc-switch": { template: "network-device", assetKind: "fc-switch" },
  router: { template: "network-device", assetKind: "router" },
  firewall: { template: "network-device", assetKind: "firewall" },
  storage: { template: "storage-array", assetKind: "storage-array" },
  windows: { template: "windows-server", assetKind: "server" },
  linux: { template: "linux-server", assetKind: "server" },
  database: { template: "sql-server", assetKind: "database" },
  ups: { template: "", assetKind: "other" },
  enclosure: { template: "none", assetKind: "enclosure" },
  server: { template: "hpe-ilo", assetKind: "server" },
  vm: { template: "", assetKind: "server" },
  other: { template: "", assetKind: "other" },
};
export const CATEGORIES = Object.keys(TEMPLATE);
export const templateFor = (category: string) => TEMPLATE[category] ?? TEMPLATE.other!;

export const enterpriseOf = (oid: string) => /^\.?1\.3\.6\.1\.4\.1\.(\d+)/.exec(oid)?.[1] ?? null;
const firstLine = (s: string) => s.split(/\r?\n/)[0]!.trim().slice(0, 160);
/** A host name without its domain; an IP address stays whole. */
export const shortName = (s: string) => (/^[\d.]+$/.test(s) || s.includes(":") ? s : s.replace(/\.$/, "").split(".")[0]!);

export function classify(h: HostInfo): Classified {
  const descr = h.snmp?.sysDescr ?? "";
  const ent = h.snmp ? enterpriseOf(h.snmp.sysObjectID) : null;
  let vendor = (ent && ENTERPRISE[ent]) || "";
  let model = "", os = "";
  let category = "other";
  const open = (p: number) => h.ports.includes(p);

  if (h.redfish) {
    category = "bmc";
    vendor = h.redfish.vendor || vendor;
    model = [h.redfish.product, h.redfish.version].filter(Boolean).join(" ");
  } else if (h.vmware) {
    category = h.vmware.kind;
    vendor = "VMware";
    model = `${h.vmware.kind === "esxi" ? "ESXi" : "vCenter Server"}${h.vmware.version ? ` ${h.vmware.version}` : ""}`;
  } else if (descr) {
    category = DESCR.find(([re]) => re.test(descr))?.[1] ?? "other";
    model = firstLine(descr);
  }
  // ports when SNMP says nothing useful
  if (category === "other") {
    if (open(3389) || (open(445) && open(135))) category = "windows";
    else if (open(1433)) category = "database";
    else if (open(22) && !open(445)) category = "linux";
  }
  if (category === "windows") { os = "Windows"; if (open(1433)) category = "database"; }
  if (category === "linux") os = /ubuntu|debian|red hat|centos|suse|freebsd/i.exec(descr)?.[0] ?? "Linux";
  if (category === "esxi" || category === "vcenter") os = model;
  if (!vendor && category === "windows") vendor = "Microsoft";
  const name = h.snmp?.sysName ? shortName(h.snmp.sysName) : h.rdns ? shortName(h.rdns) : h.certName && !/^[\d.]+$/.test(h.certName) && !h.certName.includes("*") ? shortName(h.certName) : h.address;
  return { category, vendor, model, os, ...templateFor(category), name };
}
