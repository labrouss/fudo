import { describe, expect, it } from "vitest";
import { planIncidents, type Candidate } from "../src/incidents.js";

const app = (status: string, extra: Partial<Candidate> = {}): Candidate => ({ type: "application", id: "erp", tenantId: "fin", name: "ERP", status, cause: null, criticality: "high", ...extra });
const sw = (status: string): Candidate => ({ type: "asset", id: "sw", tenantId: null, name: "Core-SW-01", status, cause: null });

describe("planIncidents", () => {
  it("opens for a down asset and an impacted application with titles and severity", () => {
    const a = planIncidents([sw("DOWN"), app("IMPACTED", { cause: { type: "asset", id: "sw", name: "Core-SW-01" } })], [], []);
    expect(a.map((x) => x.kind)).toEqual(["open", "open"]);
    expect(a[0]).toMatchObject({ title: "Core-SW-01 is down", severity: "major" });
    expect(a[1]).toMatchObject({ title: "ERP impacted by Core-SW-01", severity: "major" });
  });
  it("does not open for impacted assets, degraded apps or planned maintenance", () => {
    expect(planIncidents([{ ...sw("IMPACTED") }], [], [])).toEqual([]);
    expect(planIncidents([app("DEGRADED")], [], [])).toEqual([]);
    expect(planIncidents([app("IMPACTED", { cause: { type: "asset", id: "sw", name: "SW", planned: true } })], [], [])).toEqual([]);
  });
  it("updates when the cause or status changes, and resolves on recovery", () => {
    const open = [{ id: "i1", entityType: "application", entityId: "erp", entityStatus: "IMPACTED", causeId: "sw", title: "ERP impacted by Core-SW-01" }];
    expect(planIncidents([app("IMPACTED", { cause: { type: "asset", id: "sw", name: "Core-SW-01" } })], open, [])).toEqual([]);
    expect(planIncidents([app("DOWN", { cause: { type: "monitor", id: "sql", name: "SQL" } })], open, [])[0]).toMatchObject({ kind: "update", title: "ERP is down", from: "IMPACTED" });
    expect(planIncidents([app("UP")], open, [])[0]).toMatchObject({ kind: "resolve", reason: "Recovered (up)" });
  });
  it("reopens a recently resolved incident instead of opening a new one (flapping)", () => {
    const recent = [{ id: "old", entityType: "asset", entityId: "sw", resolvedAt: new Date(Date.now() - 60_000) }];
    expect(planIncidents([sw("DOWN")], [], recent)[0]).toMatchObject({ kind: "reopen", incidentId: "old" });
    const stale = [{ id: "old", entityType: "asset", entityId: "sw", resolvedAt: new Date(Date.now() - 3_600_000) }];
    expect(planIncidents([sw("DOWN")], [], stale)[0]).toMatchObject({ kind: "open" });
  });
  it("resolves incidents whose entity disappeared", () => {
    const open = [{ id: "i9", entityType: "monitor", entityId: "gone", entityStatus: "DOWN", causeId: null, title: "x" }];
    expect(planIncidents([], open, [])[0]).toMatchObject({ kind: "resolve", incidentId: "i9" });
  });
});
