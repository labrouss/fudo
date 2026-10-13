import { describe, expect, it } from "vitest";
import { availability, classify } from "../src/availability.js";

const H = 3600_000, D = 24 * H;

describe("availability", () => {
  it("classifies statuses", () => {
    expect(classify("DEGRADED")).toBe("up");
    expect(classify("IMPACTED")).toBe("down");
    expect(classify("IMPACTED", true)).toBe("planned");
    expect(classify("UNKNOWN")).toBe("unknown");
  });
  it("one hour down in a day ≈ 95.83%", () => {
    const r = availability({ status: "UP" }, [{ ts: 10 * H, to: "DOWN" }, { ts: 11 * H, to: "UP" }], 0, D);
    expect(r.totals.down).toBe(H);
    expect(r.totals.pct).toBeCloseTo(95.833, 2);
  });
  it("planned maintenance and unknown time are excluded", () => {
    const r = availability({ status: "UNKNOWN" }, [{ ts: 2 * H, to: "UP" }, { ts: 10 * H, to: "MAINTENANCE" }, { ts: 12 * H, to: "IMPACTED", planned: true }, { ts: 13 * H, to: "UP" }], 0, D);
    expect(r.totals.pct).toBe(100);
    expect(r.totals.planned).toBe(3 * H);
    expect(r.totals.unknown).toBe(2 * H);
  });
  it("daily buckets split an outage across midnight", () => {
    const r = availability({ status: "UP" }, [{ ts: D - H, to: "IMPACTED" }, { ts: D + H, to: "UP" }], 0, 2 * D, D);
    expect(r.buckets).toHaveLength(2);
    expect(r.buckets[0]!.down).toBe(H);
    expect(r.buckets[1]!.down).toBe(H);
    expect(r.totals.down).toBe(2 * H);
  });
  it("no data gives null, not 100%", () => {
    expect(availability({ status: "UNKNOWN" }, [], 0, D).totals.pct).toBeNull();
  });
});

import { businessWindows, availabilityWithin, zonedTime, tzOffset } from "../src/availability.js";

describe("time zones and business hours", () => {
  it("handles DST in Athens (EET/EEST)", () => {
    expect(tzOffset(Date.UTC(2026, 0, 15, 12), "Europe/Athens")).toBe(2 * H);
    expect(tzOffset(Date.UTC(2026, 6, 15, 12), "Europe/Athens")).toBe(3 * H);
    expect(new Date(zonedTime(2026, 7, 15, 8, 0, "Europe/Athens")).toISOString()).toBe("2026-07-15T05:00:00.000Z");
  });
  it("business windows Mon–Fri 08:00–18:00 over one week", () => {
    const from = zonedTime(2026, 9, 21, 0, 0, "Europe/Athens"); // Monday
    const to = zonedTime(2026, 9, 28, 0, 0, "Europe/Athens");
    const w = businessWindows(from, to, { days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00", tz: "Europe/Athens" });
    expect(w).toHaveLength(5);
    expect(w.reduce((n, [a, b]) => n + (b - a), 0)).toBe(50 * H);
  });
  it("a night outage does not count in business hours", () => {
    const from = zonedTime(2026, 9, 21, 0, 0, "Europe/Athens");
    const to = from + D;
    const night = [{ ts: from + 2 * H, to: "DOWN" }, { ts: from + 4 * H, to: "UP" }];
    const day = [{ ts: from + 10 * H, to: "DOWN" }, { ts: from + 11 * H, to: "UP" }];
    const w = businessWindows(from, to, { days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00", tz: "Europe/Athens" });
    expect(availabilityWithin({ status: "UP" }, night, from, to, w).pct).toBe(100);
    expect(availabilityWithin({ status: "UP" }, day, from, to, w).pct).toBeCloseTo(90, 5);
  });
});
