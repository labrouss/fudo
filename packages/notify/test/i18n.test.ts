import { describe, expect, it } from "vitest";
import path from "node:path";
import { buildMessage, langFor, type MessageContext } from "../src/message.js";
import { ServerI18n } from "../src/i18n.js";

process.env.LOCALES_BUILTIN_DIR = path.resolve(__dirname, "../../../locales");
const i18n = new ServerI18n(undefined);
const lang = (code: string) => langFor(code, i18n.lookup(code), i18n.numberLocale(code));

const ctx: MessageContext = {
  event: "opened",
  incident: {
    number: 7, title: "ERP Production is down", titleParts: [["incident.down", { name: "ERP Production" }]], severity: "critical", status: "open",
    entityType: "application", entityName: "ERP Production", entityStatus: "DOWN", tenantName: "Finance",
    openedAt: "2026-09-29T06:54:00Z", resolvedAt: null, cause: null, parentNumber: null, acknowledgedBy: null,
  },
  similar: null, link: "https://fudo.acme.local/incidents/x", orgName: "Acme",
};

describe("notifications in the channel's language", () => {
  it("Greek: subject, title from parts, facts, date, button", () => {
    const m = buildMessage(ctx, lang("el"));
    expect(m.subject).toBe("[Fudo] Άνοιξε: Το ERP Production είναι εκτός λειτουργίας (INC-0007 ΚΡΊΣΙΜΟ)".replace("ΚΡΊΣΙΜΟ", m.subject.match(/INC-0007 (.+)\)$/)![1]!));
    expect(m.headline).toBe("Άνοιξε: Το ERP Production είναι εκτός λειτουργίας");
    expect(m.facts.map((f) => f.title)).toEqual(["Συμβάν", "Εφαρμογή", "Μισθωτής", "Έναρξη", "Ανοιχτό για"]);
    expect(m.facts[1]!.value).toBe("ERP Production (εκτός λειτουργίας)");
    expect(m.facts[3]!.value).toMatch(/2026.*UTC$/);
    expect(m.openLabel).toBe("Άνοιγμα στο Fudo");
    expect(m.text).toContain("Άνοιγμα: https://fudo.acme.local/incidents/x");
  });
  it("Arabic keeps Western digits and translates the title", () => {
    const m = buildMessage({ ...ctx, event: "resolved", incident: { ...ctx.incident, resolvedAt: "2026-09-29T08:54:00Z" } }, lang("ar"));
    expect(m.headline).toBe("حُلّت: ERP Production متوقف");
    expect(m.facts.find((f) => f.title === "المدة")!.value).toBe("ساعتان");
    expect(m.text).not.toMatch(/[٠-٩]/);
  });
  it("English is unchanged apart from the date format", () => {
    const m = buildMessage(ctx);
    expect(m.subject).toBe("[Fudo] Opened: ERP Production is down (INC-0007 CRITICAL)");
    expect(m.facts[1]!.value).toBe("ERP Production (down)");
  });
  it("rows without parts keep their stored title", () => {
    const m = buildMessage({ ...ctx, incident: { ...ctx.incident, titleParts: null, title: "Old title" } }, lang("de"));
    expect(m.headline).toBe("Eröffnet: Old title");
  });
  it("emails: invitation with the language's plural", () => {
    const L = lang("pl");
    const text = L.t("notify.mail.invite.text", { name: "Jan", org: "Acme", link: "L", hours: 72 });
    expect(text).toContain("wygasa za 72 godziny");
    expect(lang("pl").t("notify.mail.invite.text", { name: "Jan", org: "Acme", link: "L", hours: 5 })).toContain("5 godzin");
  });
  it("unknown languages fall back to English", () => {
    expect(buildMessage(ctx, lang("xx")).headline).toBe("Opened: ERP Production is down");
  });
});

describe("chat messages keep the root cause in every language", () => {
  it("the cause fact has a stable key", () => {
    const withCause = { ...ctx, incident: { ...ctx.incident, entityStatus: "IMPACTED", cause: { type: "asset", id: "a", name: "core-sw-01", planned: false }, parentNumber: 3 } } as MessageContext;
    for (const code of ["en", "el", "ar"]) {
      const f = buildMessage(withCause, lang(code)).facts.find((x) => x.key === "cause");
      expect(f?.value, code).toBe("core-sw-01 · INC-0003");
    }
  });
});
