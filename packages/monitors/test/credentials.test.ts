import { describe, expect, it } from "vitest";
import { applyCredential, canUseCredential, credentialHiddenKeys, credentialOf, credentialView, missingSecrets, openCredentialSecrets, sealCredentialSecrets, stripCredential } from "../src/credentials.js";

const SECRET = "A".repeat(40);
const pw = { kind: "password", fields: { username: "fudo-ro" }, secrets: { password: "s3cret" } };

describe("shared credentials", () => {
  it("seals and opens secrets; the stored form does not contain them", () => {
    const enc = sealCredentialSecrets({ password: "s3cret" }, SECRET);
    expect(enc).not.toContain("s3cret");
    expect(openCredentialSecrets(enc, SECRET)).toEqual({ password: "s3cret" });
    expect(() => openCredentialSecrets(enc, "B".repeat(40))).toThrow();
  });

  it("knows which monitor types use which kinds", () => {
    expect(canUseCredential("redfish-temperature", "password")).toBe(true);
    expect(canUseCredential("snmp", "password")).toBe(false);
    expect(canUseCredential("ssh", "ssh-key")).toBe(true);
    expect(canUseCredential("http", "password")).toBe(false);
  });

  it("fills a monitor's config and strips it again for storage", () => {
    const cfg = { host: "ilo01", warnC: 27 };
    expect(applyCredential("redfish", cfg, pw)).toEqual({ host: "ilo01", warnC: 27, username: "fudo-ro", password: "s3cret" });
    expect(stripCredential("redfish", "password", { ...cfg, username: "x", password: "y" })).toEqual(cfg);
  });

  it("LDAP signs in with the credential in bind mode", () => {
    expect(applyCredential("ldap", { host: "dc1", check: "rootdse" }, pw)).toMatchObject({ check: "bind", bindDn: "fudo-ro", password: "s3cret" });
    expect(credentialHiddenKeys("ldap", "password")).toEqual(expect.arrayContaining(["bindDn", "password", "check"]));
  });

  it("SNMP keeps its version with a community, and becomes v3 with an SNMPv3 user", () => {
    const comm = { kind: "snmp-community", fields: {}, secrets: { community: "public2" } };
    expect(applyCredential("snmp", { host: "sw1", version: "v1" }, comm)).toMatchObject({ version: "v1", community: "public2" });
    expect(credentialHiddenKeys("snmp", "snmp-community")).toEqual(["community"]);
    expect(stripCredential("snmp", "snmp-community", { version: "v1", community: "x" })).toEqual({ version: "v1" });
    const v3 = { kind: "snmpv3", fields: { user: "mon", level: "authPriv", authProtocol: "sha", privProtocol: "aes" }, secrets: { authKey: "a", privKey: "p" } };
    expect(applyCredential("snmp", { host: "sw1", version: "v2c" }, v3)).toMatchObject({ version: "v3", user: "mon", authKey: "a", privKey: "p" });
    expect(credentialView("snmp", "snmpv3", { version: "v2c" }).version).toBe("v3");
  });

  it("SSH with a key credential switches to key authentication", () => {
    const key = { kind: "ssh-key", fields: { username: "root" }, secrets: { privateKey: "-----BEGIN", passphrase: "" } };
    expect(applyCredential("ssh", { host: "h", authMethod: "password" }, key)).toMatchObject({ authMethod: "key", username: "root", privateKey: "-----BEGIN" });
  });

  it("finds the credential a monitor stores itself", () => {
    expect(credentialOf("redfish-temperature", { username: "fudo-ro", password: "s3cret" })).toEqual(pw);
    expect(credentialOf("redfish-temperature", { username: "fudo-ro" })).toBeNull();
    expect(credentialOf("ldap", { check: "rootdse", bindDn: "x", password: "y" })).toBeNull();
    expect(credentialOf("snmp", { version: "v2c", community: "c" })).toEqual({ kind: "snmp-community", fields: {}, secrets: { community: "c" } });
  });

  it("asks for the secrets a kind needs", () => {
    expect(missingSecrets("password", {}, {})).toEqual({ password: "Enter the password" });
    expect(missingSecrets("snmpv3", { level: "authPriv" }, { authKey: "a" })).toEqual({ privKey: "Enter the privacy password" });
    expect(missingSecrets("snmpv3", { level: "noAuthNoPriv" }, {})).toEqual({});
  });
});
