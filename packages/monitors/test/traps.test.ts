import { describe, expect, it } from "vitest";
import { clearedKeys, decide, ipMatches, oidList, readTrap, trapDetail, trapIfIndex, badOids } from "../src/traps.js";
import { snmpTrapRunner } from "../src/runners/snmp-trap.js";

const v2 = (oid: string, extra: Array<{ oid: string; type: number; value: unknown }> = [], community = "public") => readTrap({
  type: 167, community,
  varbinds: [{ oid: "1.3.6.1.2.1.1.3.0", type: 67, value: 1234 }, { oid: "1.3.6.1.6.3.1.1.4.1.0", type: 6, value: oid }, ...extra],
}, { address: "::ffff:10.0.12.5" });
const ifFields = (ix: number) => [
  { oid: `1.3.6.1.2.1.2.2.1.1.${ix}`, type: 2, value: ix },
  { oid: `1.3.6.1.2.1.2.2.1.2.${ix}`, type: 4, value: Buffer.from(`GigabitEthernet1/0/${ix}`) },
  { oid: `1.3.6.1.2.1.31.1.1.1.18.${ix}`, type: 4, value: Buffer.from("esx01 vmnic0") },
];

describe("reading traps", () => {
  it("v2c: trap OID, standard name, named fields, sender without the IPv6 prefix", () => {
    const t = v2("1.3.6.1.6.3.1.1.5.3", ifFields(12));
    expect(t).toMatchObject({ version: "v2c", source: "10.0.12.5", community: "public", oid: "1.3.6.1.6.3.1.1.5.3", name: "linkDown" });
    expect(t.fields.map((f) => f.name)).toEqual(["ifIndex.12", "ifDescr.12", "ifAlias.12"]);
    expect(trapIfIndex(t)).toBe("12");
    expect(trapDetail(t)).toBe("GigabitEthernet1/0/12 (esx01 vmnic0)");
  });
  it("v1: generic traps become their v2 OID, enterprise traps enterprise.0.specific; the agent address names the sender", () => {
    const g = readTrap({ type: 164, enterprise: "1.3.6.1.4.1.9", agentAddr: "10.0.12.9", generic: 2, specific: 0, varbinds: [] }, { address: "10.9.9.9" });
    expect(g).toMatchObject({ version: "v1", oid: "1.3.6.1.6.3.1.1.5.3", name: "linkDown", source: "10.0.12.9" });
    const e = readTrap({ type: 164, enterprise: "1.3.6.1.4.1.232", agentAddr: "0.0.0.0", generic: 6, specific: 6022, varbinds: [] }, { address: "10.0.12.7" });
    expect(e).toMatchObject({ oid: "1.3.6.1.4.1.232.0.6022", name: null, source: "10.0.12.7" });
  });
  it("a relay's snmpTrapAddress names the device; its community copy is never kept", () => {
    const t = v2("1.3.6.1.6.3.1.1.5.1", [{ oid: "1.3.6.1.6.3.18.1.3.0", type: 64, value: "10.0.50.1" }, { oid: "1.3.6.1.6.3.18.1.4.0", type: 4, value: Buffer.from("s3cret") }]);
    expect(t.source).toBe("10.0.50.1");
    expect(JSON.stringify(t.fields)).not.toContain("s3cret");
  });
  it("binary values as hex", () => {
    expect(v2("1.3.6.1.4.1.1.0.1", [{ oid: "1.3.6.1.4.1.1.2", type: 4, value: Buffer.from([0, 0x1b, 0xff, 0x10]) }]).fields[0]!.value).toBe("00:1b:ff:10");
  });
});

describe("what a trap monitor does", () => {
  const std = { match: "standard" };
  it("standard: link down, cold start… are problems, per interface; link up clears that interface", () => {
    expect(decide(std, v2("1.3.6.1.6.3.1.1.5.3", ifFields(12)))).toEqual({ kind: "problem", key: "linkDown#12" });
    expect(decide(std, v2("1.3.6.1.6.3.1.1.5.1"))).toEqual({ kind: "problem", key: "coldStart" });
    const up = decide(std, v2("1.3.6.1.6.3.1.1.5.4", ifFields(12)))!;
    expect(up.kind).toBe("clear");
    expect(clearedKeys(up as never, ["linkDown#12", "linkDown#13", "coldStart"])).toEqual(["linkDown#12"]);
    expect(decide(std, v2("1.3.6.1.4.1.232.0.6022"))).toBeNull();
  });
  it("only these traps: names or OID prefixes; a field must contain the text if set", () => {
    const cfg = { match: "oids", oids: "1.3.6.1.4.1.232\nauthenticationFailure", contains: "critical" };
    const hp = v2("1.3.6.1.4.1.232.0.6022", [{ oid: "1.3.6.1.4.1.232.11.2.11.1", type: 4, value: Buffer.from("Fan 3: CRITICAL") }]);
    expect(decide(cfg, hp)).toEqual({ kind: "problem", key: "1.3.6.1.4.1.232.0.6022" });
    expect(decide({ ...cfg, contains: "degraded" }, hp)).toBeNull();
    expect(decide({ match: "oids", oids: "1.3.6.1.4.1.9" }, hp)).toBeNull();
  });
  it("clearing traps end the same interface's problems, or all", () => {
    const cfg = { match: "any", clearOids: "1.3.6.1.4.1.232.0.6023" };
    const clr = decide(cfg, v2("1.3.6.1.4.1.232.0.6023"))!;
    expect(clearedKeys(clr as never, ["a", "b#3"])).toEqual(["a", "b#3"]);
    const clrIf = decide(cfg, v2("1.3.6.1.4.1.232.0.6023", ifFields(3)))!;
    expect(clearedKeys(clrIf as never, ["a", "b#3"])).toEqual(["b#3"]);
    expect(decide(cfg, v2("1.3.6.1.4.1.9.0.1"))).toEqual({ kind: "problem", key: "1.3.6.1.4.1.9.0.1" });
  });
  it("names and OIDs in lists; unknown names are reported", () => {
    expect(oidList("linkDown, .1.3.6.1.4.1.9\ncoldstart")).toEqual(["1.3.6.1.6.3.1.1.5.3", "1.3.6.1.4.1.9", "1.3.6.1.6.3.1.1.5.1"]);
    expect(badOids("linkDown fanFailed")).toEqual(["fanFailed"]);
  });
  it("senders: addresses and IPv4 ranges", () => {
    expect(ipMatches("10.0.12.5", "10.0.12.0/24")).toBe(true);
    expect(ipMatches("10.0.13.5", "10.0.12.0/24")).toBe(false);
    expect(ipMatches("::ffff:10.0.12.5", "10.0.12.5")).toBe(true);
    expect(ipMatches("10.0.12.5", "10.0.12.50")).toBe(false);
  });
});

describe("trap monitor status", () => {
  const p = (key: string, lastAt: number, count = 1) => ({ key, label: key.split("#")[0]!, source: "10.0.12.5", detail: `Gi1/0/${key.split("#")[1]}`, firstAt: new Date(lastAt), lastAt: new Date(lastAt), count });
  it("Up without open problems, naming the last trap", async () => {
    expect((await snmpTrapRunner({}, { timeoutMs: 1, intervalS: 60, traps: { problems: [], last: null } }))!.message).toBe("No traps received yet");
    expect((await snmpTrapRunner({}, { timeoutMs: 1, intervalS: 60, traps: { problems: [], last: { label: "linkUp", source: "10.0.12.5", at: new Date() } } }))!.message).toBe("No open traps (last: linkUp from 10.0.12.5)");
  });
  it("Down (or Degraded) with the newest problem and how many more", async () => {
    const r = (await snmpTrapRunner({ effect: "DOWN" }, { timeoutMs: 1, intervalS: 60, traps: { problems: [p("linkDown#3", 1000), p("linkDown#7", 2000, 4)], last: null } }))!;
    expect(r.status).toBe("DOWN");
    expect(r.message).toBe("linkDown from 10.0.12.5: Gi1/0/7 · received 4 times · 1 more open");
    expect((await snmpTrapRunner({ effect: "DEGRADED" }, { timeoutMs: 1, intervalS: 60, traps: { problems: [p("x#1", 1)], last: null } }))!.status).toBe("DEGRADED");
  });
});
