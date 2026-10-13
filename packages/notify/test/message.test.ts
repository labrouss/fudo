import { describe, expect, it } from "vitest";
import { buildMessage, incNo, type MessageContext } from "../src/message.js";
import { maskConfig, mergeSecrets } from "../src/server.js";

const base: MessageContext = {
  event: "opened",
  incident: { number: 42, title: "ERP Production impacted by Core-SW-01", severity: "major", status: "open", entityType: "application", entityName: "ERP Production", entityStatus: "IMPACTED", tenantName: "Finance", openedAt: new Date(Date.now() - 600_000).toISOString(), resolvedAt: null, cause: { name: "Core-SW-01" }, parentNumber: 41, acknowledgedBy: null },
  similar: { number: 7, resolvedAt: "2026-03-12T10:00:00Z", resolution: "Forced supervisor switchover, replaced sup 1." },
  link: "https://fudo.example.com/incidents/abc",
  orgName: "Acme",
};

describe("buildMessage", () => {
  it("opened: subject, root cause with parent number, similar hint", () => {
    const m = buildMessage(base);
    expect(m.subject).toBe("[Fudo] Opened: ERP Production impacted by Core-SW-01 (INC-0042 MAJOR)");
    expect(m.facts.find((f) => f.title === "Root cause")?.value).toBe("Core-SW-01 · INC-0041");
    expect(m.hint).toContain("INC-0007");
    expect(m.text).toContain("Open: https://fudo.example.com/incidents/abc");
    expect(m.color).toBe("attention");
  });
  it("resolved: duration, no hint, green", () => {
    const m = buildMessage({ ...base, event: "resolved", incident: { ...base.incident, resolvedAt: new Date().toISOString() } });
    expect(m.hint).toBeNull();
    expect(m.color).toBe("good");
    expect(m.facts.find((f) => f.title === "Duration")?.value).toBe("10 min");
  });
  it("formats incident numbers", () => expect(incNo(7)).toBe("INC-0007"));
});

describe("secrets", () => {
  it("masks and merges", () => {
    const masked = maskConfig("webhook", { url: "https://x/y?token=1", headers: "A: b", signingSecret: "" });
    expect(masked.url).toBe("__unchanged__");
    expect(masked.headers).toBe("A: b");
    const merged = mergeSecrets("webhook", { url: "__unchanged__", headers: "A: c" }, { url: "https://x/y?token=1", headers: "A: b" });
    expect(merged).toEqual({ url: "https://x/y?token=1", headers: "A: c" });
  });
});
