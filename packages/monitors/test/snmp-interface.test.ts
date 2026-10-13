import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startAgent } from "./fake-agent.js";
import { snmpInterfaceRunner, listInterfaces, resolveIndex, interfaceVerdict } from "../src/runners/snmp-interface.js";
import { snmpRunner } from "../src/runners/snmp.js";
import { formatBps, ratesBetween, sampleData, sampleFrom } from "../src/runners/counters.js";

const PORT = 16170;
const base = { host: "127.0.0.1", port: PORT, version: "v2c", community: "public", warnPct: 80, criticalPct: 95, errorsPerMin: 10, adminDown: "up", speedMbps: 0 };
const ctx = { timeoutMs: 6000, intervalS: 60 };
let agent: ReturnType<typeof startAgent>;
const stops: Array<() => void> = [];

beforeAll(() => {
  agent = startAgent(PORT, [
    { index: 1, name: "Gi1/0/1", descr: "GigabitEthernet1/0/1", alias: "Server A", speedMbps: 1000 },
    { index: 2, name: "Gi1/0/2", descr: "GigabitEthernet1/0/2", alias: "spare", speedMbps: 1000, oper: 2 },
    { index: 3, name: "Gi1/0/3", descr: "GigabitEthernet1/0/3", alias: "spare", speedMbps: 1000, admin: 2, oper: 2 },
    { index: 49, name: "Te1/1/1", descr: "TenGigabitEthernet1/1/1", alias: "Uplink core", speedMbps: 10000 },
  ]);
  stops.push(agent.flow(49, 4e9, 1e9), agent.flow(1, 900e6, 10e6));
});
afterAll(() => { stops.forEach((s) => s()); agent.close(); });

describe("SNMP interface check", () => {
  it("lists the interfaces for the finder", async () => {
    const list = await listInterfaces(base, 5000);
    expect(list.map((i) => i.name)).toEqual(["Gi1/0/1", "Gi1/0/2", "Gi1/0/3", "Te1/1/1"]);
    expect(list[3]).toMatchObject({ index: 49, alias: "Uplink core", speedMbps: 10000, oper: "up", admin: "up" });
    expect(list[2]).toMatchObject({ admin: "down", oper: "down" });
  });

  it("finds an interface by name, description, alias or index; an alias used twice is ambiguous", () => {
    const rows = new Map([["1", { name: "Gi1/0/1", descr: "GigabitEthernet1/0/1", alias: "spare" }], ["2", { name: "Gi1/0/2", descr: "GigabitEthernet1/0/2", alias: "spare" }]]);
    expect(resolveIndex("gi1/0/2", rows)).toEqual({ ix: "2" });
    expect(resolveIndex("GigabitEthernet1/0/1", rows)).toEqual({ ix: "1" });
    expect(resolveIndex("2", rows)).toEqual({ ix: "2" });
    expect(resolveIndex("spare", rows)).toEqual({ error: "ambiguous", count: 2 });
    expect(resolveIndex("Gi9", rows)).toEqual({ error: "notFound" });
  });

  it("measures traffic on the first check (two readings) and keeps the reading for the next", async () => {
    const r = (await snmpInterfaceRunner({ ...base, interface: "Uplink core" }, ctx))!;
    expect(r.status).toBe("UP");
    expect(Number(r.data!.inBps)).toBeGreaterThan(3.5e9);
    expect(Number(r.data!.inBps)).toBeLessThan(4.5e9);
    expect(r.data!.ix).toBe("49");
    expect(r.message).toMatch(/^Te1\/1\/1 \(Uplink core\): in \d.* Gbit\/s \(\d+ %\), out .* Mbit\/s|Gbit\/s/);
    await new Promise((res) => setTimeout(res, 1200));
    const t0 = Date.now();
    const r2 = (await snmpInterfaceRunner({ ...base, interface: "Uplink core" }, { ...ctx, previous: r.data as Record<string, unknown> }))!;
    expect(Date.now() - t0).toBeLessThan(800); // no second reading needed
    expect(Number(r2.data!.inBps)).toBeGreaterThan(3.5e9);
  });

  it("Degraded above the utilisation limit", async () => {
    const r = (await snmpInterfaceRunner({ ...base, interface: "Gi1/0/1" }, ctx))!;
    expect(r.status).toBe("DEGRADED");
    expect(r.message).toMatch(/^utilisation 9\d %, at or above 80 %/);
  });

  it("link down is Down; a disabled port is Up by default, Down if asked", async () => {
    expect((await snmpInterfaceRunner({ ...base, interface: "Gi1/0/2" }, ctx))!.message).toBe("Gi1/0/2 (spare): link down (down)");
    const off = (await snmpInterfaceRunner({ ...base, interface: "3" }, ctx))!;
    expect(off.status).toBe("UP");
    expect(off.message).toMatch(/administratively down/);
    expect((await snmpInterfaceRunner({ ...base, interface: "3", adminDown: "down" }, ctx))!.status).toBe("DOWN");
  });

  it("an unknown or ambiguous name says so", async () => {
    expect((await snmpInterfaceRunner({ ...base, interface: "Gi9/9/9" }, ctx))!.message).toMatch(/No interface “Gi9\/9\/9”/);
    expect((await snmpInterfaceRunner({ ...base, interface: "spare" }, ctx))!.message).toMatch(/matches 2 interfaces/);
  });

  it("a renumbered interface is found again by name", async () => {
    const r = (await snmpInterfaceRunner({ ...base, interface: "Te1/1/1" }, { ...ctx, previous: { ...(await snmpInterfaceRunner({ ...base, interface: "Te1/1/1" }, ctx))!.data, ix: "1" } as Record<string, unknown> }))!;
    expect(r.data!.ix).toBe("49");
    expect(r.status).toBe("UP");
  });

  it("after a device restart no spike: the pair is skipped and read again", async () => {
    const first = (await snmpInterfaceRunner({ ...base, interface: "Te1/1/1" }, ctx))!;
    agent.restart();
    const r = (await snmpInterfaceRunner({ ...base, interface: "Te1/1/1" }, { ...ctx, previous: first.data as Record<string, unknown> }))!;
    expect(Number(r.data!.inBps)).toBeLessThan(5e9);
    expect(Number(r.data!.inBps)).toBeGreaterThan(3e9);
  });

  it("errors per minute turn it Degraded", () => {
    const v = interfaceVerdict({ warnPct: 80, criticalPct: 0, errorsPerMin: 10 }, { admin: 1, oper: 1, speedMbps: 1000 }, "Gi1/0/5", { in: 1e6, out: 1e6, errPerMin: 30 });
    expect(v.status).toBe("DEGRADED");
    expect(v.parts[0]).toEqual(["snmpif.errors", { rate: 30, limit: 10 }]);
  });

  it("a configured speed overrides the reported one", () => {
    const v = interfaceVerdict({ warnPct: 80, criticalPct: 0, errorsPerMin: 0, speedMbps: 100 }, { admin: 1, oper: 1, speedMbps: 10000 }, "Tunnel1", { in: 90e6, out: 1e6, errPerMin: 0 });
    expect(v.status).toBe("DEGRADED");
    expect(v.data.inPct).toBe(90);
  });

  it("no response is a clear message", async () => {
    const r = (await snmpInterfaceRunner({ ...base, port: PORT + 1, interface: "1" }, { timeoutMs: 2000, intervalS: 60 }))!;
    expect(r.message).toMatch(/No SNMP response/);
  });
});

describe("counter arithmetic", () => {
  const s = (at: number, v: bigint, bits: 32 | 64, up: bigint | null = 1000n) => ({ at, up, values: { v }, bits: { v: bits } });
  it("per-second rate; a 32-bit counter wraps once", () => {
    expect(ratesBetween(s(0, 100n, 64), s(10_000, 1100n, 64), 900)).toEqual({ v: 100 });
    expect(ratesBetween(s(0, 4294967000n, 32), s(1000, 704n, 32), 900)).toEqual({ v: 1000 });
  });
  it("a 64-bit counter going back, a restart, a stale or too-close reading: not used", () => {
    expect(ratesBetween(s(0, 1000n, 64), s(1000, 10n, 64), 900)).toBeNull();
    expect(ratesBetween(s(0, 10n, 32, 5000n), s(1000, 20n, 32, 100n), 900)).toBeNull();
    expect(ratesBetween(s(0, 10n, 64), s(1_000_000, 20n, 64), 900)).toBeNull();
    expect(ratesBetween(s(0, 10n, 64), s(100, 20n, 64), 900)).toBeNull();
  });
  it("round-trips through result data, beyond JavaScript's safe integers", () => {
    const big = 2n ** 63n + 7n;
    expect(sampleFrom(sampleData(s(5, big, 64)))).toEqual(s(5, big, 64));
  });
  it("formats bit rates", () => {
    expect([950, 12_400, 412e6, 9.41e9, 1.5e6].map(formatBps)).toEqual(["950 bit/s", "12.4 kbit/s", "412 Mbit/s", "9.41 Gbit/s", "1.5 Mbit/s"]);
  });
});

describe("SNMP check: rate of a counter", () => {
  it("compares the change per second", async () => {
    const cfg = { host: "127.0.0.1", port: PORT, version: "v2c", community: "public", oid: "1.3.6.1.2.1.31.1.1.1.6.49", mode: "rate", condition: "gt", expected: "100000000" };
    const r = (await snmpRunner(cfg, ctx))!;
    expect(r.status).toBe("UP");
    expect(Number(r.data!.value)).toBeGreaterThan(4e8); // bytes per second
    expect(r.message).toMatch(/\/s > 100000000\/s$/);
    const v = (await snmpRunner({ ...cfg, mode: "value", condition: "any" }, ctx))!;
    expect(v.message).toMatch(/^1\.3\.6\.1\.2\.1\.31\.1\.1\.1\.6\.49 = \d+$/);
  });
});
