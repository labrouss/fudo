import { describe, expect, it } from "vitest";
import { MONITOR_TEMPLATES, parseBulk } from "../src/templates.js";
import { parseMonitorConfig } from "../src/definitions.js";

describe("templates", () => {
  it("every template produces valid monitor configs", () => {
    for (const t of MONITOR_TEMPLATES) {
      for (const m of t.build({ name: "X", host: "srv01.corp.local", url: "https://app.corp.local/health" })) {
        const r = parseMonitorConfig(m.type, m.config);
        expect(r.ok, `${t.id} / ${m.name}: ${JSON.stringify(!r.ok && r.fields)}`).toBe(true);
      }
    }
  });
  it("web-app adds a certificate check only for https", () => {
    const t = MONITOR_TEMPLATES.find((x) => x.id === "web-app")!;
    expect(t.build({ name: "A", host: "", url: "https://a.local:8443/x" }).map((m) => m.type)).toEqual(["http", "tls"]);
    expect(t.build({ name: "A", host: "", url: "http://a.local/" }).map((m) => m.type)).toEqual(["http"]);
  });
});

describe("parseBulk", () => {
  it("plain hosts, name+host, name+host+port", () => {
    const r = parseBulk("10.0.0.1\nsql02, sql-prod-02.corp.local, 1433\n# comment\n\nweb;web01.corp.local", "host");
    expect(r.lines.map((l) => [l.name, l.host, l.port])).toEqual([["10.0.0.1", "10.0.0.1", undefined], ["sql02", "sql-prod-02.corp.local", 1433], ["web", "web01.corp.local", undefined]]);
    expect(r.errors).toEqual([]);
  });
  it("CSV with header in any column order", () => {
    const r = parseBulk("hostname,port,name\nesx01.corp.local,443,ESX 01", "host");
    expect(r.lines[0]).toMatchObject({ name: "ESX 01", host: "esx01.corp.local", port: 443 });
  });
  it("urls get https:// and errors carry line numbers", () => {
    const r = parseBulk("portal.corp.local/login\nbad host name!\nx, y, 99999", "url");
    expect(r.lines[0]).toMatchObject({ url: "https://portal.corp.local/login", host: "portal.corp.local" });
    expect(r.errors.map((e) => e.line)).toEqual([2, 3]);
    const h = parseBulk("-rf\nok.local", "host");
    expect(h.errors[0]).toMatchObject({ line: 1 });
  });
});
