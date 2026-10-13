import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { englishMessage, isMsgParts, MESSAGES, renderMessage, type MsgPart } from "../src/messages.js";

const root = path.resolve(__dirname, "../../..");
const lang = (code: string) => {
  const d = JSON.parse(fs.readFileSync(path.join(root, "locales", `${code}.json`), "utf8")) as Record<string, string>;
  return (c: string) => d[`msg.${c}`];
};
const r = (code: string, parts: MsgPart[], numberLocale = code) => renderMessage(parts, lang(code), code, numberLocale);

describe("server messages", () => {
  it("English is derived from the catalogue", () => {
    expect(englishMessage([["tcp.open", { port: 3000 }], ["latency", { ms: 1 }]])).toBe("Port 3000 open · 1 ms");
    expect(englishMessage([["incident.down", { name: "ERP" }]])).toBe("ERP is down");
  });
  it("translates with parameters, and keeps raw device text", () => {
    expect(r("el", [["tcp.open", { port: 3000 }], ["latency", { ms: 1.5 }]])).toBe("Η θύρα 3000 είναι ανοιχτή · 1,5 ms");
    expect(r("de", [["redfish.health", { health: "@redfish.health.Warning" }], "ProLiant DL380 Gen11"])).toBe("Zustand Warnung · ProLiant DL380 Gen11");
  });
  it("ports and ids are not digit-grouped, decimals use the local separator", () => {
    expect(r("de", [["tcp.open", { port: 44300 }]])).toBe("Port 44300 offen");
    expect(r("fr", [["ping.avg", { ms: 12.25 }]])).toContain("12,25");
  });
  it("chooses plural forms per language", () => {
    const exp = (code: string, days: number) => r(code, [["domain.expires", { date: "2027-01-15", days }]]);
    expect(exp("pl", 2)).toMatch(/2 dni\)/);
    expect(exp("pl", 1)).toMatch(/1 dzień\)/);
    expect(exp("ro", 20)).toMatch(/20 de zile\)/);
    expect(exp("ar", 2)).toContain("يومان");
    expect(exp("ar", 11)).toContain("11 يومًا");
    expect(r("en", [["similar.sharedTags", { n: 1 }]])).toBe("1 shared tag");
  });
  it("translates @references (e.g. VM power states) and formats dates", () => {
    expect(r("el", [["vcenter.stateMismatch", { vm: "erp-db01", state: "@vcenter.state.POWERED_OFF", expected: "@vcenter.state.POWERED_ON" }]]))
      .toBe("Το erp-db01 είναι απενεργοποιημένο, αναμενόταν ενεργοποιημένο");
    expect(r("de", [["domain.expired", { date: "2026-03-05" }]], "de")).toMatch(/5\. März 2026/);
  });
  it("falls back to English for unknown codes in a language, and to the code itself", () => {
    expect(renderMessage([["tcp.open", { port: 1 }]], () => undefined, "el")).toBe("Port 1 open");
    expect(englishMessage([["nope.nothing"]])).toBe("nope.nothing");
  });
  it("validates stored parts", () => {
    expect(isMsgParts([["tcp.open", { port: 1 }], "raw"])).toBe(true);
    expect(isMsgParts("Connection refused")).toBe(false);
    expect(isMsgParts([[1, 2]])).toBe(false);
  });
  it("every catalogue code is translated in every language", () => {
    for (const f of fs.readdirSync(path.join(root, "locales")).filter((x) => x.endsWith(".json") && x !== "en.json")) {
      const d = JSON.parse(fs.readFileSync(path.join(root, "locales", f), "utf8")) as Record<string, string>;
      const missing = Object.keys(MESSAGES).filter((c) => !d[`msg.${c}`]);
      expect(missing, f).toEqual([]);
    }
  });
});
