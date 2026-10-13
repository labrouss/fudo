import { describe, expect, it } from "vitest";
import { roomVerdict } from "../src/runners/room.js";
import { riseOf } from "../src/runners/temperature.js";
import type { Peer } from "../src/context.js";

const p = (name: string, celsius: number | null, o: Partial<Peer> = {}): Peer => ({ name, rack: null, status: "UP", celsius, riseC: 0, ageS: 60, warnC: 27, criticalC: 32, ...o });
const cfg = { room: "DC1", hotCount: 3, risingCount: 2, riseC: 3, staleMin: 10 };

describe("room temperature", () => {
  it("UP: average and the warmest sensor", () => {
    const v = roomVerdict([p("A12", 22.4), p("A13", 23.9), p("B01", 21.1)], cfg);
    expect(v.status).toBe("UP");
    expect(v.parts).toEqual([["temp.room.ok", { room: "DC1", total: 3, avg: 22.5, max: 23.9, where: "A13" }]]);
  });
  it("one hot sensor: Degraded; three: Down (a cooling problem)", () => {
    expect(roomVerdict([p("A12", 27.5), p("A13", 23), p("B01", 22)], cfg).status).toBe("DEGRADED");
    expect(roomVerdict([p("A12", 27.5), p("A13", 28), p("B01", 29.1), p("B02", 22)], cfg)).toMatchObject({ status: "DOWN", parts: [["temp.room.hot", { count: 3, total: 4, max: 29.1, where: "B01" }]] });
  });
  it("each sensor's own Degraded temperature counts", () => {
    expect(roomVerdict([p("Hot aisle probe", 30, { warnC: 35 }), p("A12", 22)], cfg).status).toBe("UP");
  });
  it("several rising fast: Degraded before any threshold", () => {
    expect(roomVerdict([p("A12", 24, { riseC: 3.4 }), p("A13", 23.5, { riseC: 3.1 }), p("B01", 22, { riseC: 0.2 })], cfg)).toMatchObject({ status: "DEGRADED", parts: [["temp.room.rising", { count: 2 }]] });
  });
  it("stale readings are ignored and named; a room without recent readings is not fine", () => {
    const v = roomVerdict([p("A12", 22), p("A13", 40, { ageS: 3600 })], cfg);
    expect(v.status).toBe("UP");
    expect(v.parts.at(-1)).toEqual(["temp.room.missing", { count: 1 }]);
    expect(roomVerdict([p("A12", 22, { ageS: 3600 }), p("A13", null)], cfg)).toMatchObject({ status: "DEGRADED", parts: [["temp.room.stale", { total: 2 }]] });
    expect(roomVerdict([], cfg)).toMatchObject({ status: "DOWN", parts: [["temp.room.none", { room: "DC1" }]] });
  });
  it("rise against the lowest recent reading", () => {
    expect(riseOf(26.1, [{ value: 22.5 }, { value: 23.2 }, { value: 24.9 }])).toBe(3.6);
    expect(riseOf(22, [])).toBeNull();
    expect(riseOf(22, undefined)).toBeNull();
  });
});
