import { describe, expect, it } from "vitest";
import { isBackupName, lastSlot, newBackupName, nextSlot } from "../src/store.js";

describe("backup names", () => {
  it("only Fudo's own names are accepted (no paths)", () => {
    const n = newBackupName("manual", true, new Date(Date.UTC(2026, 9, 3, 7, 5, 9)));
    expect(n).toBe("fudo-manual-20261003-070509-history.fudobackup");
    expect(isBackupName(n)).toBe(true);
    for (const bad of ["../etc/passwd", "fudo-manual-20261003-070509.fudobackup/../x", "x.fudobackup", "fudo-evil-20261003-070509.fudobackup"]) expect(isBackupName(bad)).toBe(false);
  });
});

describe("backup schedule", () => {
  const daily = { frequency: "daily" as const, weekday: 0, time: "02:30", timezone: "Europe/Athens" };
  it("daily at 02:30 Athens time", () => {
    // 3 Oct 2026 10:00 UTC = 13:00 in Athens (UTC+3): the last slot was today 02:30 local = 23:30 UTC on the 2nd
    expect(lastSlot(daily, new Date(Date.UTC(2026, 9, 3, 10))).toISOString()).toBe("2026-10-02T23:30:00.000Z");
    expect(nextSlot(daily, new Date(Date.UTC(2026, 9, 3, 10))).toISOString()).toBe("2026-10-03T23:30:00.000Z");
  });
  it("weekly on Sundays", () => {
    const weekly = { ...daily, frequency: "weekly" as const, weekday: 0 };
    // Saturday 3 Oct 2026: last Sunday was 27 Sep
    expect(lastSlot(weekly, new Date(Date.UTC(2026, 9, 3, 10))).toISOString()).toBe("2026-09-26T23:30:00.000Z");
  });
  it("across the switch from summer to winter time (25 Oct 2026 in Athens)", () => {
    // after the switch Athens is UTC+2: 02:30 local on the 26th = 00:30 UTC
    expect(lastSlot(daily, new Date(Date.UTC(2026, 9, 26, 6))).toISOString()).toBe("2026-10-26T00:30:00.000Z");
  });
});
