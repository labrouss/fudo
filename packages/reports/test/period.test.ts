import { describe, expect, it } from "vitest";
import { nextRun, previousPeriod } from "../src/period.js";

const iso = (t: number) => new Date(t).toISOString();

describe("report periods", () => {
  const now = Date.UTC(2026, 8, 27, 12); // Sunday 27 Sep 2026
  it("previous week, Athens", () => {
    const r = previousPeriod("weekly", "Europe/Athens", now);
    expect(iso(r.from)).toBe("2026-09-13T21:00:00.000Z"); // Mon 14 Sep 00:00 EEST
    expect(iso(r.to)).toBe("2026-09-20T21:00:00.000Z");
    expect(r.label).toMatch(/^Week 38, 14 Sept? – 20 Sept? 2026$/);
  });
  it("previous month across DST change", () => {
    const r = previousPeriod("monthly", "Europe/Athens", Date.UTC(2026, 10, 3));
    expect(iso(r.from)).toBe("2026-09-30T21:00:00.000Z"); // 1 Oct 00:00 EEST
    expect(iso(r.to)).toBe("2026-10-31T22:00:00.000Z"); // 1 Nov 00:00 EET
    expect(r.label).toBe("October 2026");
  });
  it("next runs", () => {
    expect(iso(nextRun("weekly", 7, "Europe/Athens", now))).toBe("2026-09-28T04:00:00.000Z"); // Mon 07:00 EEST
    expect(iso(nextRun("monthly", 7, "UTC", now))).toBe("2026-10-01T07:00:00.000Z");
  });
});

import { previousPeriod as pp, rangeLabel as rl } from "../src/period.js";
describe("localised period labels", () => {
  const now = Date.UTC(2026, 8, 23, 9);
  it("month names in the report language", () => {
    expect(pp("monthly", "Europe/Athens", now, "el").label).toBe("Αύγουστος 2026");
    expect(pp("monthly", "Europe/Berlin", now, "de").label).toBe("August 2026");
    expect(pp("monthly", "Europe/Warsaw", now, "pl").label).toMatch(/^sierpień 2026$/i);
  });
  it("translated week label, Arabic with Western digits", () => {
    const w = pp("weekly", "Asia/Riyadh", now, "ar", (n, r) => `الأسبوع ${n}، ${r}`).label;
    expect(w.startsWith("الأسبوع 38")).toBe(true);
    expect(w).not.toMatch(/[٠-٩]/);
  });
  it("custom ranges", () => {
    expect(rl(Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 8), "UTC", "fr")).toBe("1 janv. 2026 – 7 janv. 2026");
  });
});
