import { describe, expect, it } from "vitest";
import { evaluate, key, whatIf, wouldCreateCycle, blastRadius, type Snapshot, type MonitorNode } from "../src/index.js";

// Topology from the design:  ERP (web, api) and Payroll (web) → Core-SW-01 ; SQL on 3PAR ; FC fabrics A+B
function topo(overrides: Partial<Record<string, MonitorNode["status"]>> = {}): Snapshot {
  const mon = (id: string, assetId: string | null, tenantId: string | null = "fin"): MonitorNode => ({ id, tenantId, name: id, status: overrides[id] ?? "UP", paused: false, assetId });
  return {
    assets: [
      { id: "sw", tenantId: null, name: "Core-SW-01" },
      { id: "fabA", tenantId: null, name: "MDS-FAB-A" },
      { id: "fabB", tenantId: null, name: "MDS-FAB-B" },
      { id: "array", tenantId: null, name: "3PAR-A" },
      { id: "esx", tenantId: null, name: "ESX-CL-PROD" },
    ],
    monitors: [
      mon("sw-ping", "sw", null), mon("fabA-ping", "fabA", null), mon("fabB-ping", "fabB", null), mon("array-api", "array", null), mon("esx-ping", "esx", null),
      mon("erp-web", null), mon("erp-api", null), mon("sql", null), mon("pay-web", null),
    ],
    edges: [
      { fromType: "asset", fromId: "esx", toAssetId: "sw" },
      { fromType: "asset", fromId: "array", toAssetId: "fabA" },
      { fromType: "monitor", fromId: "erp-web", toAssetId: "esx" },
      { fromType: "monitor", fromId: "erp-api", toAssetId: "esx" },
      { fromType: "monitor", fromId: "pay-web", toAssetId: "esx" },
      { fromType: "application", fromId: "erp", toAssetId: "array" },
    ],
    applications: [
      { id: "erp", tenantId: "fin", name: "ERP", aggregation: "all", minUp: 1, members: [{ monitorId: "erp-web", required: true }, { monitorId: "erp-api", required: true }, { monitorId: "sql", required: true }] },
      { id: "pay", tenantId: "fin", name: "Payroll", aggregation: "all", minUp: 1, members: [{ monitorId: "pay-web", required: true }] },
      { id: "fc", tenantId: "fin", name: "FC paths", aggregation: "n_of_m", minUp: 1, members: [{ monitorId: "fabA-ping", required: true }, { monitorId: "fabB-ping", required: true }] },
    ],
    maintenance: { monitors: new Set(), assets: new Set(), applications: new Set() },
  };
}
const st = (r: ReturnType<typeof evaluate>, t: "monitor" | "asset" | "application", id: string) => r.get(key(t, id))!;

describe("evaluate", () => {
  it("all up", () => {
    const r = evaluate(topo());
    expect(st(r, "application", "erp").status).toBe("UP");
    expect(st(r, "asset", "esx").summary).toBe("1 of 1 checks up");
  });

  it("switch down: one root, dependents IMPACTED with the switch as cause", () => {
    const r = evaluate(topo({ "sw-ping": "DOWN", "esx-ping": "DOWN", "erp-web": "DOWN", "erp-api": "DOWN", "pay-web": "DOWN" }));
    expect(st(r, "asset", "sw").status).toBe("DOWN");
    expect(st(r, "asset", "esx")).toMatchObject({ status: "IMPACTED", cause: { id: "sw" } });
    expect(st(r, "monitor", "erp-web")).toMatchObject({ status: "IMPACTED", cause: { id: "sw" } });
    expect(st(r, "application", "erp")).toMatchObject({ status: "IMPACTED", cause: { name: "Core-SW-01" } });
    expect(st(r, "application", "pay")).toMatchObject({ status: "IMPACTED", cause: { id: "sw" } });
  });

  it("own failure without upstream problem is DOWN with the failing member as cause", () => {
    const r = evaluate(topo({ sql: "DOWN" }));
    expect(st(r, "application", "erp")).toMatchObject({ status: "DOWN", cause: { type: "monitor", id: "sql" } });
  });

  it("healthy entity on a failed dependency is at risk, not impacted", () => {
    const r = evaluate(topo({ "sw-ping": "DOWN" }));
    expect(st(r, "asset", "esx")).toMatchObject({ status: "UP", atRisk: { id: "sw" } });
    expect(st(r, "application", "erp").status).toBe("UP");
    expect(st(r, "application", "erp").atRisk?.id).toBe("sw");
  });

  it("n_of_m survives one fabric down as DEGRADED", () => {
    const r = evaluate(topo({ "fabB-ping": "DOWN" }));
    expect(st(r, "application", "fc").status).toBe("DEGRADED");
    const both = evaluate(topo({ "fabA-ping": "DOWN", "fabB-ping": "DOWN" }));
    expect(st(both, "application", "fc").status).toBe("DOWN");
  });

  it("maintenance on an asset is a planned root for its dependents", () => {
    const s = topo({ "esx-ping": "DOWN", "erp-web": "DOWN", "erp-api": "DOWN" });
    s.maintenance.assets.add("sw");
    const r = evaluate(s);
    expect(st(r, "asset", "sw").status).toBe("MAINTENANCE");
    expect(st(r, "application", "erp")).toMatchObject({ status: "IMPACTED", cause: { id: "sw", planned: true } });
  });

  it("application in maintenance", () => {
    const s = topo({ sql: "DOWN" });
    s.maintenance.applications.add("erp");
    expect(st(evaluate(s), "application", "erp").status).toBe("MAINTENANCE");
  });

  it("paused members are ignored", () => {
    const s = topo({ sql: "DOWN" });
    s.monitors.find((m) => m.id === "sql")!.paused = true;
    expect(st(evaluate(s), "application", "erp").status).toBe("UP");
  });
});

describe("graph helpers", () => {
  it("detects cycles", () => {
    const s = topo();
    expect(wouldCreateCycle(s.edges, "sw", "esx")).toBe(true);
    expect(wouldCreateCycle(s.edges, "esx", "array")).toBe(false);
    expect(wouldCreateCycle(s.edges, "sw", "sw")).toBe(true);
  });
  it("blast radius and what-if", () => {
    const s = topo();
    const br = blastRadius(s, "sw");
    expect(br.assets).toEqual(["esx"]);
    expect(br.applications.sort()).toEqual(["erp", "pay"]);
    const w = whatIf(s, "fabB");
    expect(w.applications.find((a) => a.id === "fc")!.after.status).toBe("DEGRADED");
    const w2 = whatIf(s, "sw");
    expect(w2.applications.find((a) => a.id === "erp")!.after).toMatchObject({ status: "IMPACTED", cause: { id: "sw" } });
  });
});
