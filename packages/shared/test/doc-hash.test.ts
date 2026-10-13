import { describe, expect, it } from "vitest";
import { docHash, docStamp, docStampLine } from "../src/doc-hash.js";

describe("help translation fingerprints", () => {
  it("are stable and ignore line endings and trailing spaces", () => {
    expect(docHash("# Title\n\nText")).toBe(docHash("# Title  \r\n\r\nText\n"));
    expect(docHash("# Title\n\nText")).toMatch(/^[0-9a-f]{8}$/);
  });
  it("change when the text changes", () => {
    expect(docHash("# Title\n\nText")).not.toBe(docHash("# Title\n\nText."));
  });
  it("round-trip through the stamp line", () => {
    const en = "# Getting started\n\nHello";
    const line = docStampLine("getting-started.md", en);
    expect(docStamp(`${line}\n\n# Ξεκινώντας`)).toEqual({ source: "getting-started.md", hash: docHash(en) });
    expect(docStamp("# no stamp")).toBeNull();
  });
});
