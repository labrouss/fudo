/**
 * Shared credentials: one account (or SNMP community, SSH key…) used by many monitors. A credential
 * has a kind; each monitor type says which kinds it can use and which of its config fields the
 * credential fills. Checks read the credential when they run, so changing it applies everywhere.
 */
import { z } from "zod";
import { decrypt, deriveKey, encrypt } from "@fudo/shared";
import type { FieldDef } from "./definitions.js";

/** Secret fields of a credential, as one encrypted JSON value (key purpose: "credential-secrets"). */
const keyFor = (appSecret: string) => deriveKey(appSecret, "credential-secrets");
export const sealCredentialSecrets = (secrets: Record<string, string>, appSecret: string) => encrypt(JSON.stringify(secrets), keyFor(appSecret));
export const openCredentialSecrets = (enc: string, appSecret: string): Record<string, string> => JSON.parse(decrypt(enc, keyFor(appSecret)));

export const CREDENTIAL_KINDS = ["password", "ssh-key", "snmp-community", "snmpv3"] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export interface CredentialKindDef {
  id: CredentialKind;
  label: string;
  /** form fields; kind "secret" ones are stored encrypted and never sent back */
  fields: FieldDef[];
  schema: z.ZodType<Record<string, unknown>>;
  /** the account shown in lists (never a secret) */
  account: (fields: Record<string, unknown>) => string;
}

const text = (max: number) => z.string().trim().max(max).optional().default("");
const secretField = (max: number) => z.string().max(max).optional().default("");

export const CREDENTIAL_KIND_DEFS: CredentialKindDef[] = [
  {
    id: "password", label: "Account and password",
    fields: [
      { key: "username", label: "User", kind: "text", hint: "e.g. fudo-ro, svc-fudo@corp.local or CN=svc-fudo,OU=Service,DC=corp,DC=local" },
      { key: "password", label: "Password", kind: "secret" },
    ],
    schema: z.object({ username: z.string().trim().min(1, "Enter the user").max(500), password: secretField(500) }),
    account: (f) => String(f.username ?? ""),
  },
  {
    id: "ssh-key", label: "SSH key",
    fields: [
      { key: "username", label: "User", kind: "text" },
      { key: "privateKey", label: "Private key (OpenSSH/PEM)", kind: "secret", multiline: true, span: 2 },
      { key: "passphrase", label: "Key passphrase", kind: "secret" },
    ],
    schema: z.object({ username: z.string().trim().min(1, "Enter the user").max(128), privateKey: secretField(16000), passphrase: secretField(500) }),
    account: (f) => String(f.username ?? ""),
  },
  {
    id: "snmp-community", label: "SNMP community (v1, v2c)",
    fields: [{ key: "community", label: "Community", kind: "secret" }],
    schema: z.object({ community: secretField(255) }),
    account: () => "",
  },
  {
    id: "snmpv3", label: "SNMPv3 user",
    fields: [
      { key: "user", label: "User", kind: "text" },
      { key: "level", label: "Security level", kind: "select", options: [{ value: "noAuthNoPriv", label: "No auth, no privacy" }, { value: "authNoPriv", label: "Auth, no privacy" }, { value: "authPriv", label: "Auth and privacy" }] },
      { key: "authProtocol", label: "Auth protocol", kind: "select", showIf: { key: "level", values: ["authNoPriv", "authPriv"] }, options: ["md5", "sha", "sha224", "sha256", "sha384", "sha512"].map((v) => ({ value: v, label: v.toUpperCase() })) },
      { key: "authKey", label: "Auth password", kind: "secret", showIf: { key: "level", values: ["authNoPriv", "authPriv"] } },
      { key: "privProtocol", label: "Privacy protocol", kind: "select", showIf: { key: "level", values: ["authPriv"] }, options: [{ value: "aes", label: "AES-128" }, { value: "aes256b", label: "AES-256 (Blumenthal)" }, { value: "aes256r", label: "AES-256 (Reeder)" }, { value: "des", label: "DES" }] },
      { key: "privKey", label: "Privacy password", kind: "secret", showIf: { key: "level", values: ["authPriv"] } },
    ],
    schema: z.object({
      user: z.string().trim().min(1, "Enter the SNMPv3 user").max(128),
      level: z.enum(["noAuthNoPriv", "authNoPriv", "authPriv"]).default("authPriv"),
      authProtocol: z.enum(["md5", "sha", "sha224", "sha256", "sha384", "sha512"]).default("sha"),
      authKey: secretField(255), privProtocol: z.enum(["des", "aes", "aes256b", "aes256r"]).default("aes"), privKey: secretField(255),
    }),
    account: (f) => String(f.user ?? ""),
  },
];
export const getCredentialKind = (id: string) => CREDENTIAL_KIND_DEFS.find((k) => k.id === id);
export const credentialSecretKeys = (kind: string) => getCredentialKind(kind)?.fields.filter((f) => f.kind === "secret").map((f) => f.key) ?? [];

/** Secrets a kind needs before it can be used (checked against stored + incoming values). */
export function missingSecrets(kind: string, fields: Record<string, unknown>, secrets: Record<string, string>): Record<string, string> {
  const need: Record<string, string> = {};
  if (kind === "password" && !secrets.password) need.password = "Enter the password";
  if (kind === "ssh-key" && !secrets.privateKey) need.privateKey = "Paste the private key";
  if (kind === "snmp-community" && !secrets.community) need.community = "Enter the community";
  if (kind === "snmpv3") {
    if (fields.level !== "noAuthNoPriv" && !secrets.authKey) need.authKey = "Enter the auth password";
    if (fields.level === "authPriv" && !secrets.privKey) need.privKey = "Enter the privacy password";
  }
  return need;
}

type Fill = (c: Record<string, unknown>, cfg: Record<string, unknown>) => Record<string, unknown>;
const account: Fill = (c) => ({ username: c.username, password: c.password });
const SNMP_USE: Partial<Record<CredentialKind, Fill>> = {
  // the monitor keeps its version (v1 or v2c); the credential gives the community
  "snmp-community": (c, cfg) => ({ community: c.community, version: cfg.version === "v1" ? "v1" : "v2c" }),
  snmpv3: (c) => ({ version: "v3", user: c.user, level: c.level, authProtocol: c.authProtocol, authKey: c.authKey, privProtocol: c.privProtocol, privKey: c.privKey }),
};

/**
 * For each monitor type: the kinds it can use and how a credential fills its config. The keys a
 * fill returns are the ones the monitor stops storing itself.
 */
export const CREDENTIAL_USE: Record<string, Partial<Record<CredentialKind, Fill>>> = {
  redfish: { password: account },
  "redfish-temperature": { password: account },
  "vcenter-vm": { password: account },
  mysql: { password: account }, postgres: { password: account }, sqlserver: { password: account }, redis: { password: account }, mongodb: { password: account },
  ldap: { password: (c) => ({ bindDn: c.username, password: c.password }) },
  ssh: {
    password: (c) => ({ username: c.username, authMethod: "password", password: c.password }),
    "ssh-key": (c) => ({ username: c.username, authMethod: "key", privateKey: c.privateKey, passphrase: c.passphrase ?? "" }),
  },
  snmp: SNMP_USE,
  "snmp-interface": SNMP_USE,
  // traps: only the community they must carry
  "snmp-trap": { "snmp-community": (c) => ({ community: c.community }) },
};
/** LDAP only signs in with an account in "bind" mode: a credential sets that mode. */
const MODE: Record<string, Record<string, unknown>> = { ldap: { check: "bind" } };

export const credentialKindsFor = (type: string): CredentialKind[] => Object.keys(CREDENTIAL_USE[type] ?? {}) as CredentialKind[];
export const canUseCredential = (type: string, kind: string) => credentialKindsFor(type).includes(kind as CredentialKind);

/** The config keys a credential of `kind` supplies for `type` (hidden in the form, not stored). */
export function credentialKeys(type: string, kind: string): string[] {
  const fill = CREDENTIAL_USE[type]?.[kind as CredentialKind];
  return fill ? Object.keys(fill({}, {})) : [];
}

/**
 * The form fields a credential of `kind` takes over for `type` (hidden in the monitor form). SNMP
 * keeps its version choice with a community; LDAP's "check" is set to bind by the credential.
 */
export function credentialHiddenKeys(type: string, kind: string): string[] {
  const keys = [...credentialKeys(type, kind), ...Object.keys(MODE[type] ?? {})];
  return kind === "snmp-community" ? keys.filter((k) => k !== "version") : keys;
}

/** The monitor's config as its form should see it with a credential (for which fields show). */
export function credentialView(type: string, kind: string, cfg: Record<string, unknown>): Record<string, unknown> {
  const fill = CREDENTIAL_USE[type]?.[kind as CredentialKind];
  return fill ? { ...cfg, ...(MODE[type] ?? {}), ...fill({}, cfg) } : cfg;
}

/** The config a check runs with: the monitor's own settings, filled from the credential. */
export function applyCredential(type: string, cfg: Record<string, unknown>, cred: { kind: string; fields: Record<string, unknown>; secrets: Record<string, string> }): Record<string, unknown> {
  const fill = CREDENTIAL_USE[type]?.[cred.kind as CredentialKind];
  if (!fill) throw new Error(`A ${cred.kind} credential cannot be used by a ${type} monitor`);
  return { ...cfg, ...(MODE[type] ?? {}), ...fill({ ...cred.fields, ...cred.secrets }, cfg) };
}

/** The monitor's config without what the credential supplies (what gets stored). */
export function stripCredential(type: string, kind: string, cfg: Record<string, unknown>): Record<string, unknown> {
  const out = { ...cfg, ...(MODE[type] ?? {}) };
  for (const k of credentialKeys(type, kind)) if (k !== "version") delete out[k];
  return out;
}

/**
 * What a monitor's own (opened) config holds as a credential, for finding monitors that share one:
 * the kind and the values a credential of that kind would carry, or null.
 */
export function credentialOf(type: string, cfg: Record<string, unknown>): { kind: CredentialKind; fields: Record<string, unknown>; secrets: Record<string, string> } | null {
  const s = (k: string) => (typeof cfg[k] === "string" ? (cfg[k] as string) : "");
  switch (type) {
    case "redfish": case "redfish-temperature": case "vcenter-vm": case "mysql": case "postgres": case "sqlserver": case "redis": case "mongodb":
      return s("username") && s("password") ? { kind: "password", fields: { username: s("username") }, secrets: { password: s("password") } } : null;
    case "ldap":
      return cfg.check === "bind" && s("bindDn") && s("password") ? { kind: "password", fields: { username: s("bindDn") }, secrets: { password: s("password") } } : null;
    case "ssh":
      if (cfg.authMethod === "key") return s("username") && s("privateKey") ? { kind: "ssh-key", fields: { username: s("username") }, secrets: { privateKey: s("privateKey"), passphrase: s("passphrase") } } : null;
      return s("username") && s("password") ? { kind: "password", fields: { username: s("username") }, secrets: { password: s("password") } } : null;
    case "snmp": case "snmp-interface":
      if (cfg.version === "v3") return s("user") ? { kind: "snmpv3", fields: { user: s("user"), level: cfg.level ?? "authPriv", authProtocol: cfg.authProtocol ?? "sha", privProtocol: cfg.privProtocol ?? "aes" }, secrets: { authKey: s("authKey"), privKey: s("privKey") } } : null;
      return s("community") ? { kind: "snmp-community", fields: {}, secrets: { community: s("community") } } : null;
    case "snmp-trap":
      return s("community") ? { kind: "snmp-community", fields: {}, secrets: { community: s("community") } } : null;
    default:
      return null;
  }
}
