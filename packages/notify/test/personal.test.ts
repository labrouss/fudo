import { describe, expect, it } from "vitest";
import { teamsUrlAllowed } from "../src/personal.js";

describe("personal Teams workflow addresses", () => {
  it("accepts Microsoft workflow hosts", () => {
    expect(teamsUrlAllowed("https://prod-12.westeurope.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=x")).toBe(true);
    expect(teamsUrlAllowed("https://default1234.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/abc")).toBe(true);
  });
  it("refuses everything else, so users cannot make the server call internal addresses", () => {
    for (const u of ["http://prod-12.westeurope.logic.azure.com/workflows/x", "https://10.0.0.5/admin", "https://localhost:3000/api", "https://evil.logic.azure.com.attacker.net/x",
      "https://user:pw@prod-1.logic.azure.com/x", "https://logic.azure.com.evil/x", "not a url", "file:///etc/passwd"]) expect(teamsUrlAllowed(u)).toBe(false);
  });
});
