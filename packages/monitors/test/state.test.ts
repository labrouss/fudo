import { describe, expect, it } from "vitest";
import { nextState, type MonitorState } from "../src/state.js";

const cfg = { failuresBeforeDown: 3, successesBeforeUp: 2 };
const run = (start: MonitorState, results: Array<"UP" | "DEGRADED" | "DOWN">) => {
  let s = start;
  const trail: string[] = [];
  for (const r of results) {
    const n = nextState(s, r, cfg);
    trail.push(n.status + (n.retrying ? "*" : ""));
    s = n;
  }
  return trail;
};
const fresh: MonitorState = { status: "UNKNOWN", failStreak: 0, successStreak: 0 };

describe("nextState", () => {
  it("goes Up on the first success", () => {
    expect(run(fresh, ["UP"])).toEqual(["UP"]);
  });
  it("needs N consecutive failures to go Down", () => {
    expect(run(fresh, ["UP", "DOWN", "DOWN", "DOWN"])).toEqual(["UP", "UP*", "UP*", "DOWN"]);
  });
  it("a success in between resets the failure count", () => {
    expect(run(fresh, ["UP", "DOWN", "DOWN", "UP", "DOWN", "DOWN"])).toEqual(["UP", "UP*", "UP*", "UP", "UP*", "UP*"]);
  });
  it("needs M consecutive successes to recover", () => {
    expect(run(fresh, ["DOWN", "DOWN", "DOWN", "UP", "DOWN", "UP", "UP"])).toEqual(["UNKNOWN*", "UNKNOWN*", "DOWN", "DOWN", "DOWN", "DOWN", "UP"]);
  });
  it("Degraded applies immediately and counts as success", () => {
    expect(run(fresh, ["UP", "DEGRADED", "UP"])).toEqual(["UP", "DEGRADED", "UP"]);
  });
  it("reports changes only on transitions", () => {
    const a = nextState(fresh, "UP", cfg);
    expect(a.changed).toBe(true);
    expect(nextState(a, "UP", cfg).changed).toBe(false);
  });
});
