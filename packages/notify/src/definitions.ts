/**
 * Notification channel types. Browser-safe: the UI renders forms from `fields`, the API validates
 * with `schema`. Secret fields are stored encrypted and never returned to the browser.
 * v0.7.0 adds the Uptime Kuma providers to this same registry.
 */
import { z } from "zod";
import kumaCatalog from "@fudo/kuma-notifications/providers.json" with { type: "json" };

export interface ChannelField {
  key: string;
  label: string;
  kind: "text" | "textarea" | "secret" | "select" | "checkbox" | "number";
  placeholder?: string;
  hint?: string;
  options?: Array<{ value: string; label: string }>;
  mono?: boolean;
  required?: boolean;
  /** only shown (and required) when another field has this value */
  showIf?: { key: string; equals: string | boolean };
  default?: string | number | boolean;
}

export interface ChannelTypeDef {
  id: string;
  label: string;
  /** "Built-in" for Fudo's own channels, the Kuma category otherwise */
  group: string;
  description: string;
  fields: ChannelField[];
  schema: z.ZodType<Record<string, unknown>>;
  /** short, non-secret text shown in lists */
  summary: (cfg: Record<string, unknown>) => string;
}

const httpsUrl = z.string().trim().url("Enter the full URL").refine((u) => /^https?:\/\//i.test(u), "Only http:// and https:// URLs");
const host = (u: unknown) => { try { return new URL(String(u)).host; } catch { return ""; } };

const NATIVE_TYPES: ChannelTypeDef[] = [
  {
    id: "email",
    group: "Built-in",
    label: "Email",
    description: "Sends through the SMTP server configured in Settings",
    fields: [{ key: "to", label: "Recipients", kind: "text", placeholder: "noc@example.com, erp-oncall@example.com", hint: "Comma-separated" }],
    schema: z.object({
      to: z.string().trim().min(3, "Enter at least one address").refine(
        (v) => v.split(",").map((x) => x.trim()).filter(Boolean).every((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)),
        "One of the addresses is not valid",
      ),
    }),
    summary: (c) => String(c.to ?? ""),
  },
  {
    id: "teams",
    group: "Built-in",
    label: "Microsoft Teams",
    description: "Posts an Adaptive Card to a Teams channel via a Workflows (Power Automate) webhook",
    fields: [{ key: "url", label: "Webhook URL", kind: "secret", placeholder: "https://…/workflows/…/triggers/manual/paths/invoke?…", hint: "In Teams: channel ⋯ › Workflows › \"Post to a channel when a webhook request is received\"", mono: true }],
    schema: z.object({ url: httpsUrl }),
    summary: (c) => host(c.url),
  },
  {
    id: "slack",
    group: "Built-in",
    label: "Slack",
    description: "Posts to a Slack channel via an incoming webhook",
    fields: [{ key: "url", label: "Webhook URL", kind: "secret", placeholder: "https://hooks.slack.com/services/…", mono: true }],
    schema: z.object({ url: httpsUrl }),
    summary: (c) => host(c.url),
  },
  {
    id: "webhook",
    group: "Built-in",
    label: "Webhook (JSON)",
    description: "POSTs a JSON document to any URL: ITSM tools, automation, scripts",
    fields: [
      { key: "url", label: "URL", kind: "secret", placeholder: "https://itsm.example.com/api/fudo", mono: true },
      { key: "headers", label: "Extra headers", kind: "textarea", placeholder: "Authorization: Bearer …", hint: "One per line, Name: value. Stored encrypted.", mono: true },
      { key: "signingSecret", label: "Signing secret", kind: "secret", hint: "Optional. Adds X-Fudo-Signature: sha256=<HMAC of the body>" },
    ],
    schema: z.object({ url: httpsUrl, headers: z.string().max(4000).optional().default(""), signingSecret: z.string().max(200).optional().default("") }),
    summary: (c) => host(c.url),
  },
];

/** Is a field visible for the given values? */
export function fieldVisible(f: ChannelField, cfg: Record<string, unknown>): boolean {
  if (!f.showIf) return true;
  const v = cfg[f.showIf.key];
  return f.showIf.equals === true ? Boolean(v) : f.showIf.equals === false ? !v : v === f.showIf.equals;
}

/** Generic schema for generated forms: required visible fields must be filled, values are normalized. */
function kumaSchema(fields: ChannelField[]): z.ZodType<Record<string, unknown>> {
  return z.record(z.string(), z.unknown()).transform((raw, ctx) => {
    const out: Record<string, unknown> = {};
    const withDefaults = { ...Object.fromEntries(fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default])), ...raw };
    for (const f of fields) {
      let v = withDefaults[f.key];
      if (f.kind === "checkbox") v = v === true || v === "true";
      else if (f.kind === "number") v = v === "" || v === undefined || v === null ? undefined : Number(v);
      else if (v !== undefined && v !== null) v = String(v).trim();
      if (f.kind === "number" && v !== undefined && Number.isNaN(v)) { ctx.addIssue({ code: "custom", path: [f.key], message: "Enter a number" }); continue; }
      const empty = v === undefined || v === "";
      if (f.required && empty && fieldVisible(f, withDefaults)) ctx.addIssue({ code: "custom", path: [f.key], message: `Enter ${f.label.replace(/^\(Optional\)\s*/, "")}` });
      if (!empty) out[f.key] = v;
    }
    return out;
  });
}

interface KumaCatalog { source: { version: string; commit: string }; providers: Array<{ id: string; label: string; category: string; fields: ChannelField[] }> }
const kuma = kumaCatalog as unknown as KumaCatalog;
export const KUMA_SOURCE = kuma.source;
export const KUMA_PREFIX = "kuma:";

const KUMA_TYPES: ChannelTypeDef[] = kuma.providers.map((p) => ({
  id: `${KUMA_PREFIX}${p.id}`,
  label: p.label,
  group: p.category,
  description: `Uptime Kuma provider (${p.category})`,
  fields: p.fields.map((f) => ({ ...f, mono: f.kind === "secret" || /url|token|key|id$/i.test(f.key) })),
  schema: kumaSchema(p.fields),
  summary: (c) => {
    const f = p.fields.find((x) => x.kind !== "secret" && x.kind !== "checkbox" && c[x.key] && /url|server|host|channel|chat|room|topic|number|recipient|user|to|phone/i.test(x.key));
    if (!f) return p.label;
    const v = String(c[f.key]);
    return /^https?:\/\//.test(v) ? host(v) : v.slice(0, 40);
  },
}));

export const CHANNEL_TYPES: ChannelTypeDef[] = [...NATIVE_TYPES, ...KUMA_TYPES];
export const CHANNEL_GROUPS = [...new Set(CHANNEL_TYPES.map((t) => t.group))];
export const getChannelType = (id: string) => CHANNEL_TYPES.find((t) => t.id === id);
export const secretKeys = (id: string) => getChannelType(id)?.fields.filter((f) => f.kind === "secret").map((f) => f.key) ?? [];

export const NOTIFY_EVENTS = [
  { id: "opened", label: "Incident opened (or reopened)" },
  { id: "acknowledged", label: "Acknowledged" },
  { id: "resolved", label: "Resolved" },
] as const;

export const SEVERITIES = ["minor", "major", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const severityRank = (s: string) => SEVERITIES.indexOf(s as Severity);

export const channelInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(100),
  type: z.string().refine((t) => Boolean(getChannelType(t)), "Choose a channel type"),
  config: z.record(z.string(), z.unknown()),
  enabled: z.boolean().default(true),
  minSeverity: z.enum(SEVERITIES).default("minor"),
  events: z.array(z.enum(["opened", "acknowledged", "resolved"])).min(1, "Choose at least one event").default(["opened", "resolved"]),
  skipImpacted: z.boolean().default(false),
  allTenants: z.boolean().default(false),
  remindMinutes: z.coerce.number().int().min(0).max(1440).default(0),
  /** 0 = notify immediately; N = escalation step, only if still unacknowledged after N minutes */
  escalateAfterMinutes: z.coerce.number().int().min(0).max(10080).default(0),
  /** all = every incident of the scope; selected = only incidents of the linked applications */
  routing: z.enum(["all", "selected"]).default("all"),
  /** language of this channel's messages; null = the organisation's default */
  locale: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/).nullable().default(null),
  applicationIds: z.array(z.string().uuid()).max(500).default([]),
}).refine((c) => c.routing === "all" || c.applicationIds.length > 0, { path: ["applicationIds"], message: "Choose at least one application" });
export type ChannelInput = z.infer<typeof channelInputSchema>;
