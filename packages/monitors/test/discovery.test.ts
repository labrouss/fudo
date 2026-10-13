import { describe, expect, it } from "vitest";
import { parseTargets, classify } from "../src/discovery/index.js";
import { readRedfishRoot } from "../src/discovery/probe.js";

describe("scan targets", () => {
  it("networks without network/broadcast, ranges (short and long), addresses, host names; no duplicates", () => {
    const r = parseTargets("10.0.12.0/30, 10.0.12.10-12 10.0.12.11\nesx01.corp.local");
    expect(r).toEqual({ ok: true, targets: ["10.0.12.1", "10.0.12.2", "10.0.12.10", "10.0.12.11", "10.0.12.12", "esx01.corp.local"] });
    expect(parseTargets("10.0.0.0/24")).toMatchObject({ ok: true });
    expect((parseTargets("10.0.0.0/24") as { targets: string[] }).targets).toHaveLength(254);
    expect(parseTargets("10.0.0.5/32")).toEqual({ ok: true, targets: ["10.0.0.5"] });
  });
  it("refuses too many and nonsense", () => {
    expect(parseTargets("10.0.0.0/16")).toEqual({ ok: false, error: "tooMany", count: 65534 });
    expect(parseTargets("10.0.0.300")).toEqual({ ok: false, error: "invalid", entry: "10.0.0.300" });
    expect(parseTargets("10.0.0.9-10.0.0.2")).toMatchObject({ ok: false, error: "invalid" });
  });
});

describe("what a device looks like", () => {
  const base = { address: "10.0.0.5", ping: true, ports: [] as number[] };
  it("Redfish → BMC with HPE manager type", () => {
    const rf = readRedfishRoot(JSON.stringify({ RedfishVersion: "1.13", Vendor: "HPE", Product: "ProLiant DL380 Gen10", Oem: { Hpe: { Manager: [{ ManagerType: "iLO 5", ManagerFirmwareVersion: "2.81" }] } } }));
    expect(classify({ ...base, ports: [443], redfish: rf })).toMatchObject({ category: "bmc", vendor: "HPE", model: "ProLiant DL380 Gen10 · iLO 5 2.81", template: "hpe-ilo", assetKind: "bmc" });
    expect(readRedfishRoot("<html>")).toBeNull();
  });
  it("vSphere: ESXi or vCenter", () => {
    expect(classify({ ...base, vmware: { kind: "esxi", version: "8.0.2" } })).toMatchObject({ category: "esxi", template: "esxi-host", model: "ESXi 8.0.2" });
    expect(classify({ ...base, vmware: { kind: "vcenter", version: "8.0.2" } })).toMatchObject({ category: "vcenter", template: "vcenter" });
  });
  it("SNMP: vendor by enterprise number, category by description; name from sysName", () => {
    const sw = classify({ ...base, snmp: { sysDescr: "Cisco NX-OS(tm) n9000, Software", sysObjectID: "1.3.6.1.4.1.9.12.3.1.3.1812", sysName: "core-sw-01.corp.local" } });
    expect(sw).toMatchObject({ category: "switch", vendor: "Cisco", template: "network-device", assetKind: "switch", name: "core-sw-01" });
    expect(classify({ ...base, snmp: { sysDescr: "Fabric OS v9.1.1", sysObjectID: "1.3.6.1.4.1.1588.2.1.1.1", sysName: "fc-a" } })).toMatchObject({ category: "fc-switch", vendor: "Brocade", assetKind: "fc-switch" });
    expect(classify({ ...base, snmp: { sysDescr: "FortiGate-100F v7.2.5", sysObjectID: "1.3.6.1.4.1.12356.101.1.1", sysName: "fw1" } })).toMatchObject({ category: "firewall", assetKind: "firewall" });
    expect(classify({ ...base, snmp: { sysDescr: "HPE Primera 600 OS 4.5", sysObjectID: "1.3.6.1.4.1.12925.1", sysName: "primera-a" } })).toMatchObject({ category: "storage", vendor: "HPE", template: "storage-array" });
    expect(classify({ ...base, snmp: { sysDescr: "Linux app01 5.15.0 #101-Ubuntu SMP", sysObjectID: "1.3.6.1.4.1.8072.3.2.10", sysName: "app01" } })).toMatchObject({ category: "linux", os: "Ubuntu", vendor: "" });
  });
  it("ports when nothing else answers; SQL Server on Windows", () => {
    expect(classify({ ...base, ports: [135, 445, 3389] })).toMatchObject({ category: "windows", template: "windows-server", vendor: "Microsoft" });
    expect(classify({ ...base, ports: [135, 445, 3389, 1433] })).toMatchObject({ category: "database", template: "sql-server" });
    expect(classify({ ...base, ports: [22] })).toMatchObject({ category: "linux", template: "linux-server" });
    expect(classify({ ...base, ports: [80], rdns: "printer-3.corp.local." })).toMatchObject({ category: "other", template: "", name: "printer-3" });
  });
});

import { mergeFound } from "../src/discovery/merge.js";
describe("the same device seen twice", () => {
  const n = (over: Record<string, unknown>) => ({ key: "dev:esx01", address: "", name: "esx01", category: "other", vendor: "", model: "", os: "", template: "none", assetKind: "other", dependsOn: [] as string[], details: {} as Record<string, unknown>, ...over });
  it("seen by two switches: both links kept, both dependencies", () => {
    const m = mergeFound(n({ dependsOn: ["dev:sw1"], details: { via: [{ switch: "sw1", port: "1" }] } }), n({ address: "10.0.0.5", category: "esxi", template: "esxi-host", dependsOn: ["dev:sw2"], details: { via: [{ switch: "sw2", port: "7" }] } }));
    expect(m).toMatchObject({ address: "10.0.0.5", category: "esxi", template: "esxi-host", dependsOn: ["dev:sw1", "dev:sw2"] });
    expect(m.details.via).toHaveLength(2);
  });
  it("a switch scanned itself after being a neighbour: its own report wins, its links stay", () => {
    const m = mergeFound(n({ key: "dev:sw2", category: "switch", details: { via: [{ switch: "sw1" }] } }), n({ key: "dev:sw2", address: "10.0.0.2", category: "switch", model: "C9300", template: "network-device", details: { snmp: { sysName: "sw2" }, links: [{ port: "1", to: "esx01" }] } }));
    expect(m).toMatchObject({ address: "10.0.0.2", model: "C9300", template: "network-device" });
    expect(m.details.via).toHaveLength(1);
    expect(m.details.links).toHaveLength(1);
  });
});
