import { describe, expect, it } from "vitest";
import { occurrences, type RecurrenceRule } from "../src/recurrence.js";

const base = { time: "02:00", durationMin: 120, timezone: "Europe/Athens", startDate: "2026-01-01" } as const;
const iso = (r: RecurrenceRule, from: string, to: string) => occurrences(r, new Date(from), new Date(to)).map((o) => o.start.toISOString());

describe("recurring maintenance", () => {
  it("every Sunday 02:00–04:00 Athens time", () => {
    const r: RecurrenceRule = { ...base, freq: "weekly", weekdays: [0] };
    expect(iso(r, "2026-10-01T00:00:00Z", "2026-10-20T00:00:00Z")).toEqual(["2026-10-03T23:00:00.000Z", "2026-10-10T23:00:00.000Z", "2026-10-17T23:00:00.000Z"]);
    expect(occurrences(r, new Date("2026-10-01"), new Date("2026-10-05"))[0]!.end.toISOString()).toBe("2026-10-04T01:00:00.000Z");
  });
  it("stays at 02:00 local across the end of summer time (25 Oct 2026)", () => {
    const r: RecurrenceRule = { ...base, freq: "daily" };
    // UTC+3 before, UTC+2 after: 02:00 local is 23:00 UTC, then 00:00 UTC
    expect(iso(r, "2026-10-24T00:00:00Z", "2026-10-27T00:00:00Z")).toEqual(["2026-10-24T23:00:00.000Z", "2026-10-26T00:00:00.000Z"]);
  });
  it("Patch Tuesday: the second Tuesday of each month", () => {
    const r: RecurrenceRule = { ...base, freq: "monthly", monthly: { mode: "nth", nth: 2, weekday: 2 }, time: "22:00", timezone: "UTC" };
    expect(iso(r, "2026-10-01T00:00:00Z", "2027-01-01T00:00:00Z")).toEqual(["2026-10-13T22:00:00.000Z", "2026-11-10T22:00:00.000Z", "2026-12-08T22:00:00.000Z"]);
  });
  it("the last Friday", () => {
    const r: RecurrenceRule = { ...base, freq: "monthly", monthly: { mode: "nth", nth: -1, weekday: 5 }, timezone: "UTC" };
    expect(iso(r, "2026-10-01T00:00:00Z", "2026-12-01T00:00:00Z")).toEqual(["2026-10-30T02:00:00.000Z", "2026-11-27T02:00:00.000Z"]);
  });
  it("day 31 falls on the last day of shorter months", () => {
    const r: RecurrenceRule = { ...base, freq: "monthly", monthly: { mode: "day", day: 31 }, timezone: "UTC" };
    expect(iso(r, "2027-01-15T00:00:00Z", "2027-05-01T00:00:00Z")).toEqual(["2027-01-31T02:00:00.000Z", "2027-02-28T02:00:00.000Z", "2027-03-31T02:00:00.000Z", "2027-04-30T02:00:00.000Z"]);
  });
  it("windows past midnight keep their length", () => {
    const r: RecurrenceRule = { ...base, freq: "daily", time: "22:00", durationMin: 240, timezone: "UTC" };
    const o = occurrences(r, new Date("2026-10-01T00:00:00Z"), new Date("2026-10-02T00:00:00Z"))[0]!;
    expect([o.start.toISOString(), o.end.toISOString()]).toEqual(["2026-10-01T22:00:00.000Z", "2026-10-02T02:00:00.000Z"]);
  });
  it("respects the first and last day", () => {
    const r: RecurrenceRule = { ...base, freq: "daily", timezone: "UTC", startDate: "2026-10-05", until: "2026-10-07" };
    expect(iso(r, "2026-10-01T00:00:00Z", "2026-10-20T00:00:00Z")).toEqual(["2026-10-05T02:00:00.000Z", "2026-10-06T02:00:00.000Z", "2026-10-07T02:00:00.000Z"]);
  });
});
