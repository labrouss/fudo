import { describe, expect, it } from "vitest";
import { decrypt, deriveKey, encrypt } from "../src/crypto.js";

const SECRET = "0123456789abcdef0123456789abcdef";

describe("crypto", () => {
  it("round-trips", () => {
    const k = deriveKey(SECRET, "totp");
    expect(decrypt(encrypt("JBSWY3DPEHPK3PXP", k), k)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("uses a fresh IV each time", () => {
    const k = deriveKey(SECRET, "totp");
    expect(encrypt("x", k)).not.toBe(encrypt("x", k));
  });

  it("rejects a key for another purpose and tampering", () => {
    const token = encrypt("secret", deriveKey(SECRET, "totp"));
    expect(() => decrypt(token, deriveKey(SECRET, "smtp"))).toThrow();
    const parts = token.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."), deriveKey(SECRET, "totp"))).toThrow();
  });
});
