import { describe, expect, it } from "vitest";
import { nextInRotation, onCallAt, rotationShift, upcomingShifts, type OncallSchedule } from "../src/oncall.js";

const weekly: OncallSchedule = { participants: ["anna", "bob", "chris"], shiftDays: 7, handoverTime: "09:00", timezone: "Europe/Athens", startDate: "2026-10-05" }; // a Monday
const at = (iso: string) => new Date(iso);

describe("on-call rotation", () => {
  it("weekly, Mondays 09:00 Athens", () => {
    expect(onCallAt(weekly, [], at("2026-10-05T06:00:00Z"))!.userId).toBe("anna"); // Mon 09:00 local
    expect(onCallAt(weekly, [], at("2026-10-05T05:59:00Z"))!.userId).toBe("chris"); // just before: the previous shift
    expect(onCallAt(weekly, [], at("2026-10-12T05:59:00Z"))!.userId).toBe("anna");
    expect(onCallAt(weekly, [], at("2026-10-12T06:00:00Z"))!.userId).toBe("bob");
    expect(onCallAt(weekly, [], at("2026-10-19T08:00:00Z"))!.userId).toBe("chris");
    expect(onCallAt(weekly, [], at("2026-10-26T08:00:00Z"))!.userId).toBe("anna"); // round again
  });
  it("handover stays at 09:00 local across the end of summer time (25 Oct 2026)", () => {
    const sh = rotationShift(weekly, at("2026-10-20T12:00:00Z"))!;
    expect(sh.start.toISOString()).toBe("2026-10-19T06:00:00.000Z"); // 09:00 at UTC+3
    expect(sh.end.toISOString()).toBe("2026-10-26T07:00:00.000Z");   // 09:00 at UTC+2
  });
  it("overrides win, the newest first", () => {
    const o = [
      { userId: "dina", startsAt: at("2026-10-09T15:00:00Z"), endsAt: at("2026-10-12T06:00:00Z"), createdAt: at("2026-10-01T00:00:00Z") },
      { userId: "eve", startsAt: at("2026-10-10T00:00:00Z"), endsAt: at("2026-10-11T00:00:00Z"), createdAt: at("2026-10-02T00:00:00Z") },
    ];
    expect(onCallAt(weekly, o, at("2026-10-09T16:00:00Z"))!.userId).toBe("dina");
    expect(onCallAt(weekly, o, at("2026-10-10T12:00:00Z"))!).toMatchObject({ userId: "eve", source: "override" });
    expect(onCallAt(weekly, o, at("2026-10-12T06:00:00Z"))!.userId).toBe("bob"); // override ended
  });
  it("daily shifts, next person and the calendar", () => {
    const daily: OncallSchedule = { ...weekly, shiftDays: 1, handoverTime: "08:00", timezone: "UTC" };
    expect(onCallAt(daily, [], at("2026-10-06T07:59:00Z"))!.userId).toBe("anna");
    expect(onCallAt(daily, [], at("2026-10-06T08:00:00Z"))!.userId).toBe("bob");
    expect(nextInRotation(daily, at("2026-10-06T09:00:00Z"))).toBe("chris");
    expect(upcomingShifts(daily, at("2026-10-05T12:00:00Z"), 4).map((s) => s.userId)).toEqual(["anna", "bob", "chris", "anna"]);
  });
  it("before the first shift the rotation counts backwards", () => {
    expect(onCallAt(weekly, [], at("2026-10-01T12:00:00Z"))!.userId).toBe("chris");
  });
  it("no participants: nobody", () => {
    expect(onCallAt({ ...weekly, participants: [] }, [], at("2026-10-05T12:00:00Z"))).toBeNull();
  });
});
