import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Symmetric encryption for secrets at rest (TOTP secrets, SMTP password, later the credentials vault).
 * AES-256-GCM, key derived from APP_SECRET with HKDF and a purpose label, so one purpose's
 * ciphertext cannot be decrypted as another's.
 * Format: v1.<iv b64url>.<tag b64url>.<ciphertext b64url>
 */
/** Kept from the pre-rename version (0.2.0) so existing encrypted secrets stay readable. Never change. */
const HKDF_SALT = "service-monitor";

export function deriveKey(appSecret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", appSecret, HKDF_SALT, purpose, 32));
}

export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

export function decrypt(token: string, key: Buffer): string {
  const [v, iv, tag, data] = token.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unsupported ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Random token, URL-safe. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
