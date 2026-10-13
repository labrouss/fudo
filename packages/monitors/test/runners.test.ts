import { describe, expect, it } from "vitest";
import http from "node:http";
import net from "node:net";
import { runCheck, statusAccepted, jsonPathGet, parseHeaders } from "../src/runner.js";
import { parseMonitorConfig, monitorInputSchema } from "../src/definitions.js";

function server(handler: http.RequestListener): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, "127.0.0.1", () => {
      const { port } = s.address() as net.AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => s.close() });
    });
  });
}
const ctx = { timeoutMs: 2000, intervalS: 60 };

describe("helpers", () => {
  it("status specs", () => {
    expect(statusAccepted(204, "200-299")).toBe(true);
    expect(statusAccepted(301, "200-299,301")).toBe(true);
    expect(statusAccepted(500, "200-299")).toBe(false);
  });
  it("json path", () => {
    expect(jsonPathGet({ a: { b: [{ c: "ok" }] } }, "$.a.b[0].c")).toBe("ok");
    expect(jsonPathGet({ a: 1 }, "$.x.y")).toBeUndefined();
  });
  it("headers", () => {
    expect(parseHeaders("Authorization: Bearer x:y\nX-A: 1\nbad")).toEqual({ Authorization: "Bearer x:y", "X-A": "1" });
  });
});

describe("config validation", () => {
  it("rejects hosts that look like options", () => {
    const r = parseMonitorConfig("ping", { host: "-f" });
    expect(r.ok).toBe(false);
  });
  it("applies defaults", () => {
    const r = parseMonitorConfig("http", { url: "https://example.org" });
    expect(r.ok && r.config.acceptedStatus).toBe("200-299");
  });
  it("timeout must be below interval", () => {
    const r = monitorInputSchema.safeParse({ name: "x y", type: "tcp", config: {}, intervalS: 20, retryIntervalS: 20, timeoutS: 30, failuresBeforeDown: 1, successesBeforeUp: 1 });
    expect(r.success).toBe(false);
  });
});

describe("http runner", () => {
  it("up, keyword, json, status and degraded", async () => {
    const s = await server((req, res) => {
      if (req.url === "/slow") return setTimeout(() => res.end("ok"), 150);
      if (req.url === "/500") { res.statusCode = 500; return res.end("boom"); }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ status: "ok", items: [{ state: "green" }] }));
    });
    try {
      expect((await runCheck("http", { url: s.url, acceptedStatus: "200-299" }, ctx))?.status).toBe("UP");
      expect((await runCheck("http", { url: s.url + "/500", acceptedStatus: "200-299" }, ctx))?.message).toMatch(/Unexpected status 500/);
      expect((await runCheck("http", { url: s.url, acceptedStatus: "200-299", keyword: "nope" }, ctx))?.status).toBe("DOWN");
      expect((await runCheck("http", { url: s.url, acceptedStatus: "200-299", jsonPath: "$.items[0].state", jsonExpected: "green" }, ctx))?.status).toBe("UP");
      expect((await runCheck("http", { url: s.url, acceptedStatus: "200-299", jsonPath: "$.status", jsonExpected: "bad" }, ctx))?.status).toBe("DOWN");
      expect((await runCheck("http", { url: s.url + "/slow", acceptedStatus: "200-299", degradedLatencyMs: 50 }, ctx))?.status).toBe("DEGRADED");
    } finally {
      s.close();
    }
  });
  it("times out", async () => {
    const s = await server(() => {});
    try {
      const r = await runCheck("http", { url: s.url, acceptedStatus: "200-299" }, { ...ctx, timeoutMs: 300 });
      expect(r?.message).toMatch(/Timed out/);
    } finally {
      s.close();
    }
  });
});

describe("tcp runner", () => {
  it("open and refused ports", async () => {
    const s = net.createServer().listen(0, "127.0.0.1");
    await new Promise((r) => s.once("listening", r));
    const port = (s.address() as net.AddressInfo).port;
    expect((await runCheck("tcp", { host: "127.0.0.1", port }, ctx))?.status).toBe("UP");
    s.close();
    await new Promise((r) => s.once("close", r));
    expect((await runCheck("tcp", { host: "127.0.0.1", port }, ctx))?.message).toBe("Connection refused");
  });
});

describe("push runner", () => {
  it("on time returns nothing, late returns Down", async () => {
    expect(await runCheck("push", { graceS: 10 }, { ...ctx, lastPushAt: new Date() })).toBeNull();
    expect((await runCheck("push", { graceS: 10 }, { ...ctx, lastPushAt: new Date(Date.now() - 120_000) }))?.status).toBe("DOWN");
    expect((await runCheck("push", { graceS: 10 }, { ...ctx, lastPushAt: null }))?.message).toBe("No push received yet");
  });
});
