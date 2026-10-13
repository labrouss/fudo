/**
 * Secrets in a backup: decrypted from this server's APP_SECRET keys and carried as
 * { "$secret": plain, "$purpose": … } inside the passphrase-encrypted backup; re-encrypted with the
 * target server's keys on restore. This is what makes a backup portable between servers.
 */
import { decrypt, deriveKey, encrypt } from "@fudo/shared";

/** Purposes of APP_SECRET-derived keys (labels of deriveKey; never change). */
export const PURPOSE = { totp: "totp-secret", channel: "channel-config", monitor: "monitor-secrets", smtp: "smtp-password", backup: "backup-passphrase", contact: "contact-target", telegram: "telegram-bot", credential: "credential-secrets" } as const;
const MONITOR_PREFIX = "enc:v1:";
type Marker = { $secret: string; $purpose: string; $prefix?: string };
const isMarker = (v: unknown): v is Marker => !!v && typeof v === "object" && typeof (v as Marker).$secret === "string" && typeof (v as Marker).$purpose === "string";

/** Encrypted columns of whole-value secrets. */
const COLUMNS: Record<string, Record<string, string>> = {
  users: { totp_secret_enc: PURPOSE.totp, pending_totp_secret_enc: PURPOSE.totp },
  user_contact_methods: { target_enc: PURPOSE.contact },
  notification_channels: { config_enc: PURPOSE.channel },
  credentials: { secrets_enc: PURPOSE.credential },
};
/** Encrypted fields inside settings values: settings.key → field → purpose. */
const SETTING_FIELDS: Record<string, Record<string, string>> = {
  smtp: { passwordEnc: PURPOSE.smtp },
  "backup.schedule": { passphraseEnc: PURPOSE.backup },
  telegram: { botTokenEnc: PURPOSE.telegram },
};
/** Tables whose rows go through re-keying (exported as JSON rows instead of COPY). */
export const SECRET_TABLES = new Set(["users", "user_contact_methods", "notification_channels", "monitors", "settings", "credentials"]);

type Row = Record<string, unknown>;
type KeyFn = (purpose: string) => Buffer;
const keys = (appSecret: string): KeyFn => { const cache = new Map<string, Buffer>(); return (p) => { let k = cache.get(p); if (!k) { k = deriveKey(appSecret, p); cache.set(p, k); } return k; }; };

function where(table: string, row: Row) { return `${table} ${String(row.id ?? row.key ?? "")}`.trim(); }

/** For the backup: APP_SECRET ciphertexts → markers with the plain value. */
export function openRow(table: string, row: Row, appSecret: string): Row {
  const key = keys(appSecret);
  const out: Row = { ...row };
  const open = (v: string, purpose: string) => {
    try { return decrypt(v, key(purpose)); } catch { throw new Error(`Cannot read the encrypted secret of ${where(table, row)}. Was APP_SECRET changed?`); }
  };
  for (const [col, purpose] of Object.entries(COLUMNS[table] ?? {})) {
    const v = out[col];
    if (typeof v === "string" && v) out[col] = { $secret: open(v, purpose), $purpose: purpose } satisfies Marker;
  }
  if (table === "monitors" && out.config && typeof out.config === "object") {
    const cfg: Row = { ...(out.config as Row) };
    for (const [k, v] of Object.entries(cfg)) {
      if (typeof v === "string" && v.startsWith(MONITOR_PREFIX)) cfg[k] = { $secret: open(v.slice(MONITOR_PREFIX.length), PURPOSE.monitor), $purpose: PURPOSE.monitor, $prefix: MONITOR_PREFIX } satisfies Marker;
    }
    out.config = cfg;
  }
  if (table === "settings" && typeof out.key === "string" && SETTING_FIELDS[out.key] && out.value && typeof out.value === "object") {
    const value: Row = { ...(out.value as Row) };
    for (const [field, purpose] of Object.entries(SETTING_FIELDS[out.key]!)) {
      const v = value[field];
      if (typeof v === "string" && v) value[field] = { $secret: open(v, purpose), $purpose: purpose } satisfies Marker;
    }
    out.value = value;
  }
  return out;
}

/** For the restore: markers → ciphertexts with the target server's keys. */
export function sealRow(row: Row, appSecret: string): Row {
  const key = keys(appSecret);
  const seal = (v: unknown): unknown => {
    if (isMarker(v)) return (v.$prefix ?? "") + encrypt(v.$secret, key(v.$purpose));
    if (Array.isArray(v)) return v.map(seal);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Row).map(([k, x]) => [k, seal(x)]));
    return v;
  };
  return seal(row) as Row;
}
