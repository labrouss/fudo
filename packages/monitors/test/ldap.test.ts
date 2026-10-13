import { describe, expect, it } from "vitest";
import { attr, bindFailure, rootDseResult } from "../src/runners/ldap.js";

// Result 49 texts exactly as Active Directory sends them
const ad = (sub: string) => Object.assign(new Error(`80090308: LdapErr: DSID-0C09044E, comment: AcceptSecurityContext error, data ${sub}, v4563`), { code: 49 });

describe("LDAP monitor", () => {
  it("names Active Directory's reasons for a failed sign-in", () => {
    expect(bindFailure(ad("52e"))).toEqual(["ldap.invalidCredentials"]);
    expect(bindFailure(ad("775"))).toEqual(["ldap.locked"]);
    expect(bindFailure(ad("532"))).toEqual(["ldap.passwordExpired"]);
    expect(bindFailure(ad("773"))).toEqual(["ldap.mustChangePassword"]);
    expect(bindFailure(ad("533"))).toEqual(["ldap.disabled"]);
    expect(bindFailure(ad("701"))).toEqual(["ldap.accountExpired"]);
    expect(bindFailure(Object.assign(new Error("Invalid Credentials"), { code: 49 }))).toEqual(["ldap.invalidCredentials"]); // OpenLDAP
  });
  it("reads attributes the way ldapts returns them", () => {
    expect(attr({ a: ["x", "y"] }, "a")).toBe("x");
    expect(attr({ a: [] }, "a")).toBeNull();
    expect(attr({ a: "" }, "a")).toBeNull();
    expect(attr({}, "a")).toBeNull();
    expect(attr({ a: Buffer.from("TRUE") }, "a")).toBe("TRUE");
  });
  it("Active Directory: Degraded while not synchronized; other servers never", () => {
    const cfg = { adSync: true };
    expect(rootDseResult({ dnsHostName: ["dc01.corp.local"], isSynchronized: ["FALSE"] }, "10.0.0.5", cfg, 5)).toMatchObject({ status: "DEGRADED", parts: [["ldap.notSynchronized", { server: "dc01.corp.local" }]] });
    expect(rootDseResult({ dnsHostName: ["dc01.corp.local"], isSynchronized: ["TRUE"] }, "10.0.0.5", cfg, 5)).toMatchObject({ status: "UP", parts: [["ldap.answers", { server: "dc01.corp.local" }]] });
    expect(rootDseResult({ dnsHostName: [], isSynchronized: [], vendorName: [] }, "ldap.acme.local", cfg, 5)).toMatchObject({ status: "UP", parts: [["ldap.answers", { server: "ldap.acme.local" }]] });
    expect(rootDseResult({ isSynchronized: ["FALSE"] }, "dc02", { adSync: false }, 5).status).toBe("UP");
  });
});
