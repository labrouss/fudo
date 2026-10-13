import { describe, expect, it } from "vitest";
import { rdapExpiry, whoisExpiry } from "../src/runners/domain.js";
import { compare } from "../src/runners/snmp.js";
import { sshVerdict } from "../src/runners/ssh.js";
import { redfishVerdict } from "../src/runners/redfish.js";
import { vmList } from "../src/runners/vcenter.js";
import { firstValue, splitCommand } from "../src/runners/db.js";
import { maskConfig, mergeSecrets, openConfig, sealConfig } from "../src/secrets.js";
import { MONITOR_TYPES, SECRET_PLACEHOLDER, fieldVisible, parseMonitorConfig, secretKeysOf } from "../src/definitions.js";

describe("domain expiry parsing", () => {
  it("RDAP expiration event", () => {
    expect(rdapExpiry({ events: [{ eventAction: "registration", eventDate: "1997-09-15T04:00:00Z" }, { eventAction: "expiration", eventDate: "2028-09-14T04:00:00Z" }] })?.toISOString()).toBe("2028-09-14T04:00:00.000Z");
    expect(rdapExpiry({ events: [] })).toBeNull();
  });
  it("WHOIS formats", () => {
    expect(whoisExpiry("Registry Expiry Date: 2027-03-01T05:00:00Z\n")?.toISOString().slice(0, 10)).toBe("2027-03-01");
    expect(whoisExpiry("paid-till:     2026.12.31\n")?.toISOString().slice(0, 10)).toBe("2026-12-31");
    expect(whoisExpiry("Expiry date:   14-06-2027\n")?.toISOString().slice(0, 10)).toBe("2027-06-14");
    expect(whoisExpiry("No match for domain")).toBeNull();
  });
});

describe("comparisons and verdicts", () => {
  it("SNMP conditions", () => {
    expect(compare("42", "gt", "40")).toBe(true);
    expect(compare("up(1)", "contains", "up")).toBe(true);
    expect(compare("2", "eq", "1")).toBe(false);
  });
  it("SSH match modes", () => {
    expect(sshVerdict("exitCode", "", "", 0).ok).toBe(true);
    expect(sshVerdict("exitCode", "", "", 3).ok).toBe(false);
    expect(sshVerdict("exact", "active", "active\n", 0).ok).toBe(true);
    expect(sshVerdict("notContains", "ERROR", "all fine", 0).ok).toBe(true);
    expect(sshVerdict("regex", "^OK", "x\nOK done", 0).ok).toBe(true);
  });
  it("Redfish health (HPE aggregate)", () => {
    const sys = { Manufacturer: "HPE", Model: "ProLiant DL380 Gen10", PowerState: "On", Status: { Health: "OK", HealthRollup: "Critical" }, Oem: { Hpe: { AggregateHealthStatus: { PowerSupplies: { Status: { Health: "Critical" } }, PowerSupplyRedundancy: "Failed", Fans: { Status: { Health: "OK" } } } } } };
    const v = redfishVerdict(sys, true);
    expect(v.status).toBe("DOWN");
    expect(v.message).toContain("Power Supplies: Critical");
    expect(redfishVerdict({ Model: "PowerEdge R750", PowerState: "On", Status: { Health: "OK" } }, true).status).toBe("UP");
  });
  it("vCenter list payloads (7+/8 vs 6.7)", () => {
    expect(vmList("api", [{ vm: "vm-1", name: "a", power_state: "POWERED_ON" }])[0]!.vm).toBe("vm-1");
    expect(vmList("rest", { value: [{ vm: "vm-6999", name: "b", power_state: "POWERED_ON" }] })[0]!.vm).toBe("vm-6999");
    // a 6.x proxy page or error object instead of a list must not throw
    expect(vmList("api", undefined)).toEqual([]);
    expect(vmList("api", { error: "Method Not Allowed" })).toEqual([]);
    expect(vmList("rest", undefined)).toEqual([]);
  });
  it("database result helpers", () => {
    expect(firstValue([{ status: "ok", n: 2 }])).toBe("ok");
    expect(firstValue([])).toBe("");
    expect(splitCommand('SET "health key" ok')).toEqual(["SET", "health key", "ok"]);
  });
});

describe("monitor secrets", () => {
  const SECRET = "0123456789abcdef0123456789abcdef";
  const cfg = { host: "db1", username: "mon", password: "S3cret!", port: 3306 };
  it("every secret field is a declared field", () => {
    for (const t of MONITOR_TYPES) for (const k of secretKeysOf(t.id)) expect(t.fields.some((f) => f.key === k)).toBe(true);
    expect(secretKeysOf("ssh")).toEqual(["password", "privateKey", "passphrase"]);
  });
  it("seal → open round-trip, mask, merge", () => {
    const sealed = sealConfig("mysql", cfg, SECRET);
    expect(String(sealed.password)).toMatch(/^enc:v1:/);
    expect(JSON.stringify(sealed)).not.toContain("S3cret!");
    expect(sealConfig("mysql", sealed, SECRET)).toEqual(sealed); // not double-encrypted
    expect(openConfig("mysql", sealed, SECRET)).toEqual(cfg);
    expect(maskConfig("mysql", sealed).password).toBe(SECRET_PLACEHOLDER);
    expect(mergeSecrets("mysql", { ...cfg, password: SECRET_PLACEHOLDER }, cfg).password).toBe("S3cret!");
    expect(mergeSecrets("mysql", { ...cfg, password: "new" }, cfg).password).toBe("new");
    expect(() => openConfig("mysql", sealed, "another-secret-another-secret-123")).toThrow();
  });
  it("conditional fields", () => {
    const f = MONITOR_TYPES.find((t) => t.id === "snmp")!.fields.find((x) => x.key === "privKey")!;
    expect(fieldVisible(f, { level: "authPriv" })).toBe(true);
    expect(fieldVisible(f, { level: "authNoPriv" })).toBe(false);
    // chained: auth/privacy fields follow the security level, which is only shown for v3
    const snmp = MONITOR_TYPES.find((t) => t.id === "snmp")!.fields;
    const shown = (cfg: Record<string, unknown>) => snmp.filter((x) => fieldVisible(x, cfg, snmp)).map((x) => x.key);
    expect(shown({ version: "v2c", level: "authPriv" })).not.toContain("authKey");
    expect(shown({ version: "v2c", level: "authPriv" })).toContain("community");
    expect(shown({ version: "v3", level: "authPriv" })).toEqual(expect.arrayContaining(["user", "level", "authProtocol", "authKey", "privProtocol", "privKey"]));
    expect(shown({ version: "v3", level: "authNoPriv" })).not.toContain("privKey");
    expect(parseMonitorConfig("snmp", { host: "a", version: "v2c", community: "c", oid: ".1.3.6.1.2.1.1.3.0" })).toMatchObject({ ok: true, config: { oid: "1.3.6.1.2.1.1.3.0" } });
  });
});
