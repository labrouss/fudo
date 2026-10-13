import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { convertKuma, jsonPathFrom, readKuma, readKumaJson, type ConvertOptions } from "../src/index.js";

const m = (o: Record<string, unknown>) => ({ active: true, interval: 60, retryInterval: 60, maxretries: 1, timeout: 48, method: "GET", accepted_statuscodes: ["200-299"], notificationIDList: {}, tags: [], description: "", parent: null, ...o });
const backup = {
  version: "1.23.16",
  notificationList: [
    { id: 1, name: "Ops Telegram", active: true, isDefault: true, config: JSON.stringify({ name: "Ops Telegram", type: "telegram", telegramBotToken: "123:abc", telegramChatID: "-100", isDefault: true, applyExisting: true }) },
    { id: 2, name: "ERP team mail", active: true, isDefault: false, config: JSON.stringify({ name: "ERP team mail", type: "smtp", smtpHost: "mail.acme.local", smtpPort: 25, smtpTo: "erp@acme.local" }) },
    { id: 3, name: "Pager", active: true, isDefault: false, config: JSON.stringify({ name: "Pager", type: "made-up-provider" }) },
  ],
  monitorList: [
    m({ id: 1, name: "ERP", type: "group" }),
    m({ id: 2, name: "ERP web", type: "http", url: "https://erp.acme.local/health", parent: 1, accepted_statuscodes: ["200-299", "301"], headers: JSON.stringify({ "X-Probe": "kuma" }),
        basic_auth_user: "probe", basic_auth_pass: "s3cret", authMethod: "basic", expiryNotification: true, notificationIDList: { 2: true }, tags: [{ name: "env", value: "prod" }, { name: "erp", value: "" }] }),
    m({ id: 3, name: "ERP db", type: "port", hostname: "sql01", port: 1433, parent: 1, notificationIDList: { 2: true, 1: true } }),
    m({ id: 4, name: "Login page", type: "keyword", url: "http://intranet/login", keyword: "Maintenance", invertKeyword: true }),
    m({ id: 5, name: "API status", type: "json-query", url: "http://api/status", jsonPath: "data.status", expectedValue: "ok" }),
    m({ id: 6, name: "API count", type: "json-query", url: "http://api/items", jsonPath: "$count(items) > 3", expectedValue: "true" }),
    m({ id: 7, name: "Core switch", type: "ping", hostname: "10.0.0.1", interval: 10, maxretries: 20, active: false }),
    m({ id: 8, name: "Mail MX", type: "dns", hostname: "acme.local", dns_resolve_type: "MX", dns_resolve_server: "1.1.1.1" }),
    m({ id: 9, name: "SIP SRV", type: "dns", hostname: "acme.local", dns_resolve_type: "SRV" }),
    m({ id: 10, name: "Backup job", type: "push", pushToken: "abc" }),
    m({ id: 11, name: "Redis", type: "docker", docker_container: "redis" }),
    m({ id: 12, name: "Maintenance flag", type: "http", url: "http://x/flag", upsideDown: true }),
    m({ id: 13, name: "ERP web", type: "ping", hostname: "erp" }),
    m({ id: 14, name: "Existing one", type: "ping", hostname: "x" }),
    m({ id: 15, name: "Delete call", type: "http", url: "http://x/", method: "DELETE" }),
  ],
};
const known: Record<string, string[]> = { telegram: ["telegramBotToken", "telegramChatID"], smtp: ["smtpHost", "smtpPort", "smtpTo"] };
const opts: ConvertOptions = { existingMonitors: new Set(["existing one"]), existingApplications: new Set(), existingChannels: new Set(), providerFields: (t) => known[t] ?? null, allowApplications: true };
const by = (r: ReturnType<typeof convertKuma>, name: string) => r.monitors.find((x) => x.name === name)!;
const codes = (notes: Array<{ name: string; code: string }>) => Object.fromEntries(notes.map((n) => [n.name, n.code]));

describe("Uptime Kuma import", () => {
  const r = convertKuma(readKumaJson(JSON.stringify(backup)), opts);

  it("maps HTTP monitors: status codes, headers, basic auth, redirects and certificate expiry", () => {
    const web = by(r, "ERP web");
    expect(web).toMatchObject({ type: "http", intervalS: 60, failuresBeforeDown: 2, tags: ["env:prod", "erp"] });
    expect(web.config).toMatchObject({ url: "https://erp.acme.local/health", acceptedStatus: "200-299,301", followRedirects: true });
    expect((web.config as { headers: string }).headers).toBe(`X-Probe: kuma\nAuthorization: Basic ${Buffer.from("probe:s3cret").toString("base64")}`);
    expect(by(r, "ERP web (certificate)")).toMatchObject({ type: "tls", config: { host: "erp.acme.local", port: 443 } });
  });
  it("keyword (inverted), JSON path, TCP, ping, DNS and push", () => {
    expect(by(r, "Login page").config).toMatchObject({ keyword: "Maintenance", keywordMode: "absent" });
    expect(by(r, "API status").config).toMatchObject({ jsonPath: "$.data.status", jsonExpected: "ok" });
    expect(by(r, "ERP db")).toMatchObject({ type: "tcp", config: { host: "sql01", port: "1433" } });
    expect(by(r, "Mail MX")).toMatchObject({ type: "dns", config: { recordType: "MX", server: "1.1.1.1" } });
    expect(by(r, "Backup job").type).toBe("push");
  });
  it("fits Fudo's limits and says so; inactive monitors stay paused", () => {
    expect(by(r, "Core switch")).toMatchObject({ intervalS: 20, failuresBeforeDown: 10, paused: true });
    const w = r.warnings.filter((x) => x.name === "Core switch").map((x) => x.code);
    expect(w).toEqual(["interval", "retries"]);
  });
  it("skips what it cannot import faithfully, with the reason", () => {
    expect(codes(r.skipped)).toMatchObject({
      "API count": "json_query", "SIP SRV": "dns_type", Redis: "type", "Maintenance flag": "upside_down",
      "Existing one": "exists_monitor", "Delete call": "method", Pager: "provider",
    });
  });
  it("keeps duplicate Kuma names apart", () => {
    expect(r.monitors.filter((x) => String(x.name).startsWith("ERP web")).map((x) => x.name).sort()).toEqual(["ERP web", "ERP web (2)", "ERP web (certificate)"]);
  });
  it("groups become applications; channels route to them when only their members use them", () => {
    expect(r.applications).toEqual([{ name: "ERP", description: "", aggregation: "all", members: ["ERP web", "ERP db"] }]);
    const mail = r.channels.find((c) => c.name === "ERP team mail")!;
    expect(mail).toMatchObject({ type: "email", routing: "applications", applications: ["ERP"], usedBy: 2, config: { to: "erp@acme.local" } });
    expect(r.warnings.find((w) => w.name === "ERP team mail")?.code).toBe("smtp_server");
    const tg = r.channels.find((c) => c.name === "Ops Telegram")!;
    expect(tg).toMatchObject({ routing: "applications", isDefault: true, config: { telegramBotToken: "123:abc", telegramChatID: "-100" } });
    expect(Object.keys(tg.config)).not.toContain("applyExisting");
  });
  it("JSONata: only simple paths convert", () => {
    expect(jsonPathFrom("data.items[0].state")).toBe("$.data.items[0].state");
    expect(jsonPathFrom("$.status")).toBe("$.status");
    expect(jsonPathFrom("$count(items)")).toBeNull();
    expect(jsonPathFrom("a = 'b'")).toBeNull();
  });
  it("reads the same from kuma.db (SQLite) as from the JSON backup", () => {
    const dir = mkdtempSync(join(tmpdir(), "kuma-")), file = join(dir, "kuma.db");
    const db = new DatabaseSync(file);
    db.exec(`CREATE TABLE monitor (id INTEGER PRIMARY KEY, name TEXT, type TEXT, active INTEGER, parent INTEGER, url TEXT, method TEXT, hostname TEXT, port INTEGER,
               interval INTEGER, retry_interval INTEGER, maxretries INTEGER, timeout REAL, upside_down INTEGER, keyword TEXT, invert_keyword INTEGER,
               accepted_statuscodes_json TEXT, maxredirects INTEGER, ignore_tls INTEGER, headers TEXT, body TEXT, dns_resolve_type TEXT, dns_resolve_server TEXT,
               expiry_notification INTEGER, json_path TEXT, expected_value TEXT, description TEXT, auth_method TEXT, basic_auth_user TEXT, basic_auth_pass TEXT);
             CREATE TABLE notification (id INTEGER PRIMARY KEY, name TEXT, config TEXT, active INTEGER, is_default INTEGER);
             CREATE TABLE monitor_notification (id INTEGER PRIMARY KEY, monitor_id INTEGER, notification_id INTEGER);
             CREATE TABLE tag (id INTEGER PRIMARY KEY, name TEXT, color TEXT);
             CREATE TABLE monitor_tag (id INTEGER PRIMARY KEY, monitor_id INTEGER, tag_id INTEGER, value TEXT);
             CREATE TABLE heartbeat (id INTEGER PRIMARY KEY, monitor_id INTEGER, status INTEGER, msg TEXT, time TEXT);`);
    const ins = db.prepare(`INSERT INTO monitor VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const x of backup.monitorList as Array<Record<string, unknown>>) {
      ins.run(x.id as number, x.name as string, x.type as string, x.active ? 1 : 0, (x.parent as number) ?? null, (x.url as string) ?? null, x.method as string, (x.hostname as string) ?? null, (x.port as number) ?? null,
        x.interval as number, x.retryInterval as number, x.maxretries as number, x.timeout as number, x.upsideDown ? 1 : 0, (x.keyword as string) ?? null, x.invertKeyword ? 1 : 0,
        JSON.stringify(x.accepted_statuscodes), null, 0, (x.headers as string) ?? null, null, (x.dns_resolve_type as string) ?? null, (x.dns_resolve_server as string) ?? null,
        x.expiryNotification ? 1 : 0, (x.jsonPath as string) ?? null, (x.expectedValue as string) ?? null, "", (x.authMethod as string) ?? null, (x.basic_auth_user as string) ?? null, (x.basic_auth_pass as string) ?? null);
      for (const id of Object.keys(x.notificationIDList as object)) db.prepare("INSERT INTO monitor_notification (monitor_id, notification_id) VALUES (?, ?)").run(x.id as number, Number(id));
    }
    for (const n of backup.notificationList) db.prepare("INSERT INTO notification VALUES (?,?,?,?,?)").run(n.id, n.name, n.config, 1, n.isDefault ? 1 : 0);
    db.prepare("INSERT INTO tag VALUES (1, 'env', '#fff'), (2, 'erp', '#000')").run();
    db.prepare("INSERT INTO monitor_tag (monitor_id, tag_id, value) VALUES (2, 1, 'prod'), (2, 2, '')").run();
    db.close();
    const fromDb = convertKuma(readKuma(file), opts);
    expect(fromDb.monitors).toEqual(r.monitors);
    expect(fromDb.applications).toEqual(r.applications);
    expect(fromDb.channels).toEqual(r.channels);
    expect(fromDb.skipped).toEqual(r.skipped);
  });
  it("refuses files that are not from Uptime Kuma", () => {
    const dir = mkdtempSync(join(tmpdir(), "kuma-")), file = join(dir, "x.json");
    writeFileSync(file, JSON.stringify({ hello: "world" }));
    expect(() => readKuma(file)).toThrow("not an Uptime Kuma backup");
  });
});
