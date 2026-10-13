/**
 * Secret fields of monitor configs (passwords, communities, keys): AES-256-GCM at rest with a key
 * derived from APP_SECRET, a placeholder towards browsers and exports, decrypted only to run checks.
 */
import { decrypt, deriveKey, encrypt } from "@fudo/shared";
import { SECRET_PLACEHOLDER, secretKeysOf } from "./definitions.js";

const PREFIX = "enc:v1:";
const keyFor = (appSecret: string) => deriveKey(appSecret, "monitor-secrets");

/** For storage: encrypt secret values (already-encrypted values are kept). */
export function sealConfig(type: string, cfg: Record<string, unknown>, appSecret: string): Record<string, unknown> {
  const out = { ...cfg };
  for (const k of secretKeysOf(type)) {
    const v = out[k];
    if (typeof v === "string" && v && !v.startsWith(PREFIX)) out[k] = PREFIX + encrypt(v, keyFor(appSecret));
  }
  return out;
}

/** For running a check or comparing: decrypt secret values. */
export function openConfig(type: string, cfg: Record<string, unknown>, appSecret: string): Record<string, unknown> {
  const out = { ...cfg };
  for (const k of secretKeysOf(type)) {
    const v = out[k];
    if (typeof v === "string" && v.startsWith(PREFIX)) out[k] = decrypt(v.slice(PREFIX.length), keyFor(appSecret));
  }
  return out;
}

/** For browsers and exports: saved secrets become a placeholder. */
export function maskConfig(type: string, cfg: Record<string, unknown>): Record<string, unknown> {
  const out = { ...cfg };
  for (const k of secretKeysOf(type)) if (typeof out[k] === "string" && out[k]) out[k] = SECRET_PLACEHOLDER;
  return out;
}

/** For edits: placeholders (or omitted secrets) keep the stored value. `stored` must be opened. */
export function mergeSecrets(type: string, incoming: Record<string, unknown>, stored: Record<string, unknown> | null): Record<string, unknown> {
  const out = { ...incoming };
  for (const k of secretKeysOf(type)) {
    if (out[k] === SECRET_PLACEHOLDER || out[k] === undefined) out[k] = stored?.[k] ?? "";
  }
  return out;
}
