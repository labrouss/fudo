import { z } from "zod";

/** Trim whitespace/CR and one pair of surrounding quotes: values often arrive as "…" or with Windows line endings. */
function clean(v: unknown): unknown {
  if (typeof v !== "string") return v;
  let s = v.replace(/^\uFEFF/, "").trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) s = s.slice(1, -1).trim();
  return s;
}
const str = () => z.preprocess(clean, z.string());
const optional = <T extends z.ZodType>(t: T) => z.preprocess((v) => { const c = clean(v); return c === "" ? undefined : c; }, t.optional());

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && Boolean(u.hostname) && !u.search && !u.hash;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  NODE_ENV: z.preprocess(clean, z.enum(["development", "production", "test"])).default("development"),
  LOG_LEVEL: z.preprocess(clean, z.enum(["fatal", "error", "warn", "info", "debug", "trace"])).default("info"),
  DATABASE_URL: str().refine((s) => /^postgres(ql)?:\/\/.+/.test(s) && URL.canParse(s), "must look like postgres://user:password@host:5432/dbname (URL-encode special characters in the password)"),
  API_PORT: z.preprocess(clean, z.coerce.number().int().positive()).default(3000),
  APP_SECRET: str().refine((s) => s.length >= 32, "must be at least 32 characters (generate one with: openssl rand -base64 48)"),
  SESSION_TTL_HOURS: z.preprocess(clean, z.coerce.number().int().min(1).max(720)).default(12),
  /** "auto" = Secure cookie when the request arrived over HTTPS (X-Forwarded-Proto aware) */
  COOKIE_SECURE: z.preprocess(clean, z.enum(["auto", "true", "false"])).default("auto"),
  /** Base URL users reach Fudo at, e.g. https://fudo.corp.local. Used in invitation and push links. */
  PUBLIC_URL: optional(
    z.string()
      .refine(isHttpUrl, "must be a full http:// or https:// address, e.g. https://fudo.example.com or http://fudo.example.com:8080")
      .transform((u) => u.replace(/\/+$/, "")),
  ),
});

export type Env = z.infer<typeof envSchema>;

const SECRET_KEYS = new Set(["APP_SECRET"]);

/** Shows exactly what was received, with invisible and non-ASCII characters made visible. */
function describeValue(key: string, v: unknown): string {
  if (v === undefined) return "not set";
  if (SECRET_KEYS.has(key)) return `${String(v).length} characters`;
  let s = String(v);
  if (key === "DATABASE_URL") s = s.replace(/(\/\/[^:/@]+:)[^@]*@/, "$1****@");
  const visible = [...s].map((ch) => {
    const c = ch.codePointAt(0)!;
    return c < 0x20 || c === 0x7f || c > 0x7e ? `\\u{${c.toString(16).toUpperCase().padStart(4, "0")}}` : ch;
  }).join("");
  return `received: ${visible}`;
}

/** Validates process.env and aborts startup with a readable message on error. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => {
      const key = String(i.path[0] ?? "");
      return `  - ${key}: ${i.message} (${describeValue(key, source[key])})`;
    }).join("\n");
    console.error(`Invalid environment configuration:\n${issues}\nFix the value in .env (or docker-compose.yml) and restart the containers.`);
    process.exit(1);
  }
  return parsed.data;
}
