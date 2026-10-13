import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { contrast, isThemeColor, resolveTheme, THEME_TOKENS, type ThemeFile } from "../src/theme.js";

const root = path.resolve(__dirname, "../../..");
const builtIn = () => {
  const m = new Map<string, ThemeFile>();
  for (const f of fs.readdirSync(path.join(root, "themes")).filter((x) => x.endsWith(".json"))) m.set(f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(root, "themes", f), "utf8")));
  return m;
};

describe("theme colours", () => {
  it("accepts plain colours", () => {
    for (const c of ["#fff", "#ffffff", "#ffffff80", "rgb(1, 2, 3)", "rgba(0, 0, 0, .6)", "hsl(200 80% 50%)", "hsla(200, 80%, 50%, 0.5)"]) expect(isThemeColor(c), c).toBe(true);
  });
  it("rejects anything that could load resources or inject CSS", () => {
    for (const c of ["url(https://x.example/a.png)", "#000; } body { display: none", "var(--ink)", "expression(alert(1))", "red", "#12345", "", 12]) expect(isThemeColor(c), String(c)).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("inherits through extends and falls back to the light values", () => {
    const files = new Map<string, ThemeFile>([
      ["base", { _meta: { name: "Base", mode: "dark" }, colors: { ground: "#111111", ink: "#eeeeee" } }],
      ["child", { _meta: { name: "Child", extends: "base" }, colors: { ink: "#dddddd" } }],
    ]);
    const t = resolveTheme("child", files)!;
    expect(t.mode).toBe("dark");                                  // inherited
    expect(t.colors.ground).toBe("#111111");                      // from base
    expect(t.colors.ink).toBe("#dddddd");                         // own value wins
    expect(t.colors.surface).toBe(THEME_TOKENS.find((x) => x.name === "surface")!.light); // built-in default
    expect(Object.keys(t.colors)).toHaveLength(THEME_TOKENS.length);
  });
  it("survives loops, unknown bases, unknown names and bad values", () => {
    const files = new Map<string, ThemeFile>([
      ["a", { _meta: { name: "A", extends: "b" }, colors: { inkk: "#000", ground: "url(x)" } }],
      ["b", { _meta: { name: "B", extends: "a" } }],
      ["c", { _meta: { name: "C", extends: "nope", mode: "light" } }],
    ]);
    const p: string[] = [];
    expect(resolveTheme("a", files, p)!.colors.ground).toBe("#f4f3ef");
    expect(p.join("\n")).toMatch(/loops/);
    expect(p.join("\n")).toMatch(/unknown colour "inkk"/);
    expect(p.join("\n")).toMatch(/"ground" is not a colour/);
    const q: string[] = []; resolveTheme("c", files, q);
    expect(q.join()).toMatch(/unknown theme "nope"/);
  });
  it("computes WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")!).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#777777")!).toBeCloseTo(1, 5);
  });
});

describe("built-in themes", () => {
  it("light.json, the CSS defaults and the token list agree", () => {
    const light = builtIn().get("light")!.colors!;
    const css = fs.readFileSync(path.join(root, "apps/web/src/styles.css"), "utf8");
    for (const tk of THEME_TOKENS) {
      expect(light[tk.name], tk.name).toBe(tk.light);
      expect(css, tk.name).toContain(`--${tk.name}: ${tk.light};`);
    }
  });
  it("resolve without problems", () => {
    const files = builtIn();
    for (const id of ["light", "dark", "monokai"]) { const p: string[] = []; expect(resolveTheme(id, files, p), id).not.toBeNull(); expect(p, id).toEqual([]); }
  });
});
