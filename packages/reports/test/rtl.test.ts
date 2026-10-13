import { describe, expect, it } from "vitest";
import { visualOrder } from "../src/pdf.js";

// visualOrder returns words left to right as they are drawn on the page
const v = (s: string) => visualOrder(s.split(" ")).join(" ");

describe("right-to-left word order in PDF reports", () => {
  it("reverses Arabic words", () => {
    expect(v("تقرير التوفر الشهري")).toBe("الشهري التوفر تقرير");
  });
  it("keeps a Latin name in its own order", () => {
    // "ERP Production is down": the name stays "ERP Production", placed where Arabic reading puts it
    expect(v("ERP Production متوقف")).toBe("متوقف ERP Production");
  });
  it("joins neutrals between Latin words; others follow the page direction", () => {
    expect(v("تقرير التوفر · Finance")).toBe("Finance · التوفر تقرير");
    expect(v("Acme · أغسطس 2026 · Europe/Athens")).toBe("Europe/Athens · 2026 أغسطس · Acme");
  });
  it("numbers and percentages are left-to-right runs", () => {
    expect(v("التوفر: 99.41%")).toBe("99.41% التوفر:");
  });
  it("left-to-right text is untouched", () => {
    expect(v("Port 3000 open")).toBe("Port 3000 open");
  });
});
