import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../src/env.js";

const base = { DATABASE_URL: "postgres://fudo:secret@db:5432/fudo", APP_SECRET: "0123456789abcdef0123456789abcdef" };

describe("loadEnv", () => {
  it.each([
    ["http://fudo.hpehellas-demo.com", "http://fudo.hpehellas-demo.com"],
    ['"http://fudo.hpehellas-demo.com"', "http://fudo.hpehellas-demo.com"],
    ["'https://fudo.corp.local:8443/'\r", "https://fudo.corp.local:8443"],
    ["  http://10.0.0.5:8080/ ", "http://10.0.0.5:8080"],
    ["", undefined],
  ])("PUBLIC_URL %j", (input, expected) => {
    expect(loadEnv({ ...base, PUBLIC_URL: input }).PUBLIC_URL).toBe(expected);
  });

  it("rejects a host without scheme and shows what it received", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => { throw new Error("exit"); }) as never);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => loadEnv({ ...base, PUBLIC_URL: "fudo.example.com\u2010x" })).toThrow("exit");
    expect(String(err.mock.calls[0]![0])).toContain("received: fudo.example.com\\u{2010}x");
    exit.mockRestore(); err.mockRestore();
  });

  it("never prints the database password or the app secret", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => { throw new Error("exit"); }) as never);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => loadEnv({ DATABASE_URL: "mysql://u:topsecret@h/d", APP_SECRET: "short" })).toThrow("exit");
    const out = String(err.mock.calls[0]![0]);
    expect(out).not.toContain("topsecret");
    expect(out).not.toContain("short");
    expect(out).toContain("5 characters");
    exit.mockRestore(); err.mockRestore();
  });
});
