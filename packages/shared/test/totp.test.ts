import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, verifyTotp, generateRecoveryCodes, normalizeRecoveryCode } from "../src/totp.js";

// RFC 6238 appendix B, SHA-1 secret "12345678901234567890" (8-digit reference values, last 6 digits)
const RFC_SECRET = Buffer.from("12345678901234567890");
const vectors: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
];

describe("totp", () => {
  it("matches RFC 6238 vectors", () => {
    for (const [t, expected] of vectors) {
      expect(hotp(RFC_SECRET, Math.floor(t / 30), 8)).toBe(expected);
    }
  });

  it("base32 round-trips", () => {
    const b = Buffer.from("hello world, totp!");
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
  });

  it("verifies within window and blocks replay", () => {
    const secret = base32Encode(RFC_SECRET);
    const nowMs = 1234567890 * 1000;
    const code = hotp(RFC_SECRET, Math.floor(1234567890 / 30));
    const step = verifyTotp(secret, code, { nowMs });
    expect(step).toBe(Math.floor(1234567890 / 30));
    expect(verifyTotp(secret, code, { nowMs, lastUsedStep: step })).toBeNull();
    expect(verifyTotp(secret, "000000", { nowMs })).toBeNull();
    expect(verifyTotp(secret, "abc", { nowMs })).toBeNull();
  });

  it("generates distinct recovery codes", () => {
    const codes = generateRecoveryCodes(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(normalizeRecoveryCode(codes[0]!.toLowerCase())).toBe(codes[0]!.replace(/-/g, ""));
  });
});
