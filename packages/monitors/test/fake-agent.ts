/// <reference path="../src/net-snmp.d.ts" />
/**
 * A small SNMP agent for tests: a "switch" with an ifTable/ifXTable whose counters the test moves.
 */
import snmp from "net-snmp";

export interface FakeIf { index: number; name: string; descr: string; alias: string; speedMbps: number; admin?: number; oper?: number; inOctets?: bigint; outOctets?: bigint; inErrors?: number; outErrors?: number }

const c64 = (v: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt.asUintN(64, v)); return b; };
const RO = snmp.MaxAccess["read-only"];

export function startAgent(port: number, ifs: FakeIf[], community = "public") {
  const agent = snmp.createAgent({ port, address: "127.0.0.1" }, () => {});
  agent.getAuthorizer().addCommunity(community);
  const mib = agent.getMib();
  let ticks = 100000;
  mib.registerProvider({ name: "sysUpTime", type: snmp.MibProviderType.Scalar, oid: "1.3.6.1.2.1.1.3", scalarType: snmp.ObjectType.TimeTicks, maxAccess: RO });
  const col = (number: number, name: string, type: number) => ({ number, name, type, maxAccess: number === 1 && name === "ifIndex" ? snmp.MaxAccess["not-accessible"] : RO });
  mib.registerProvider({
    name: "ifTable", type: snmp.MibProviderType.Table, oid: "1.3.6.1.2.1.2.2.1", maxAccess: snmp.MaxAccess["not-accessible"],
    tableColumns: [col(1, "ifIndex", snmp.ObjectType.Integer), col(2, "ifDescr", snmp.ObjectType.OctetString), col(3, "ifType", snmp.ObjectType.Integer), col(5, "ifSpeed", snmp.ObjectType.Gauge),
      col(7, "ifAdminStatus", snmp.ObjectType.Integer), col(8, "ifOperStatus", snmp.ObjectType.Integer), col(10, "ifInOctets", snmp.ObjectType.Counter), col(13, "ifInDiscards", snmp.ObjectType.Counter),
      col(14, "ifInErrors", snmp.ObjectType.Counter), col(16, "ifOutOctets", snmp.ObjectType.Counter), col(19, "ifOutDiscards", snmp.ObjectType.Counter), col(20, "ifOutErrors", snmp.ObjectType.Counter)],
    tableIndex: [{ columnName: "ifIndex" }],
  });
  mib.registerProvider({
    name: "ifXTable", type: snmp.MibProviderType.Table, oid: "1.3.6.1.2.1.31.1.1.1", maxAccess: snmp.MaxAccess["not-accessible"],
    tableColumns: [col(1, "ifName", snmp.ObjectType.OctetString), col(6, "ifHCInOctets", snmp.ObjectType.Counter64), col(10, "ifHCOutOctets", snmp.ObjectType.Counter64),
      col(15, "ifHighSpeed", snmp.ObjectType.Gauge), col(18, "ifAlias", snmp.ObjectType.OctetString)],
    tableAugments: "ifTable",
  });
  const state = new Map<number, Required<FakeIf>>();
  const write = (f: Required<FakeIf>) => {
    const ifRow = [f.index, f.descr, 6, Math.min(f.speedMbps * 1e6, 4294967295), f.admin, f.oper, Number(f.inOctets % 2n ** 32n), 0, f.inErrors, Number(f.outOctets % 2n ** 32n), 0, f.outErrors];
    const xRow = [f.index, f.name, c64(f.inOctets), c64(f.outOctets), f.speedMbps, f.alias];
    if (state.has(f.index)) {
      [2, 3, 5, 7, 8, 10, 13, 14, 16, 19, 20].forEach((n, i) => mib.setTableSingleCell("ifTable", n, [f.index], ifRow[i + 1]));
      [1, 6, 10, 15, 18].forEach((n, i) => mib.setTableSingleCell("ifXTable", n, [f.index], xRow[i + 1]));
    } else { mib.addTableRow("ifTable", ifRow); mib.addTableRow("ifXTable", xRow); }
    state.set(f.index, f);
  };
  for (const f of ifs) write({ admin: 1, oper: 1, inOctets: 0n, outOctets: 0n, inErrors: 0, outErrors: 0, ...f });
  mib.setScalarValue("sysUpTime", ticks);
  const timer = setInterval(() => { ticks += 10; mib.setScalarValue("sysUpTime", ticks); }, 100);
  return {
    /** change an interface (counters, state) */
    set(index: number, patch: Partial<FakeIf>) { write({ ...state.get(index)!, ...patch }); },
    /** traffic at a constant rate: a timer adds bytes every 100 ms */
    flow(index: number, inBps: number, outBps: number) {
      const t = setInterval(() => { const f = state.get(index)!; write({ ...f, inOctets: f.inOctets + BigInt(Math.round(inBps / 80)), outOctets: f.outOctets + BigInt(Math.round(outBps / 80)) }); }, 100);
      return () => clearInterval(t);
    },
    restart() { ticks = 50; for (const f of state.values()) write({ ...f, inOctets: 0n, outOctets: 0n }); mib.setScalarValue("sysUpTime", ticks); },
    close() { clearInterval(timer); agent.close(); },
  };
}
