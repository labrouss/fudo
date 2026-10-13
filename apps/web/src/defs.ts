/**
 * Translated views of the shared definitions (English originals stay the fallback).
 * Imported by screens only, so they are built after the interface language is loaded.
 */
import { ASSET_KINDS } from "@fudo/shared";
import { MONITOR_TYPES as RAW_TYPES, type FieldDef, type MonitorTypeDef } from "@fudo/monitors/definitions";
import { MONITOR_TEMPLATES as RAW_TEMPLATES, type MonitorTemplate } from "@fudo/monitors/templates";
import { CHANNEL_TYPES as RAW_CHANNELS, NOTIFY_EVENTS as RAW_EVENTS, KUMA_PREFIX, type ChannelField, type ChannelTypeDef } from "@fudo/notify/definitions";
import { CREDENTIAL_KIND_DEFS as RAW_CRED_KINDS, type CredentialKindDef } from "@fudo/monitors/credentials";
import { t, td } from "./i18n";

const trField = <F extends FieldDef | ChannelField>(prefix: string, f: F): F => ({
  ...f,
  label: td(`${prefix}.${f.key}.label`, f.label)!,
  hint: td(`${prefix}.${f.key}.hint`, f.hint),
  placeholder: td(`${prefix}.${f.key}.placeholder`, f.placeholder),
  options: f.options?.map((o) => ({ ...o, label: td(`${prefix}.${f.key}.option.${o.value}`, o.label)! })),
});

export const MONITOR_TYPES: MonitorTypeDef[] = RAW_TYPES.map((m) => ({
  ...m,
  label: td(`def.monitor.${m.id}.label`, m.label)!,
  description: td(`def.monitor.${m.id}.description`, m.description)!,
  category: td(`def.monitor_category.${m.category}`, m.category) as MonitorTypeDef["category"],
  fields: m.fields.map((f) => trField(`def.monitor.${m.id}.field`, f)),
}));
export const getMonitorType = (id: string) => MONITOR_TYPES.find((m) => m.id === id);

export const MONITOR_TEMPLATES: MonitorTemplate[] = RAW_TEMPLATES.map((x) => ({ ...x, label: td(`def.template.${x.id}.label`, x.label)!, description: td(`def.template.${x.id}.description`, x.description)! }));

/** Kuma provider fields carry Kuma's own translation keys (labelKey, hintKey, option keys). */
type KumaOption = { value: string; label: string; labelKey?: string };
type KumaField = Omit<ChannelField, "options"> & { labelKey?: string; hintKey?: string; options?: KumaOption[] };
export const CHANNEL_TYPES: ChannelTypeDef[] = RAW_CHANNELS.map((c) => {
  const group = td(`def.channel_group.${c.group}`, c.group)!;
  if (c.id.startsWith(KUMA_PREFIX)) {
    return {
      ...c, group, description: t("def.kuma_description", { category: group }),
      fields: (c.fields as unknown as KumaField[]).map((f): ChannelField => ({
        ...f,
        label: f.labelKey ? td(`kuma.${f.labelKey}`, f.label)! : f.label,
        hint: f.hintKey ? td(`kuma.${f.hintKey}`, f.hint) : f.hint,
        options: f.options?.map((o) => ({ ...o, label: o.labelKey ? td(`kuma.${o.labelKey}`, o.label)! : o.label })),
      })),
    };
  }
  return { ...c, group, label: td(`def.channel.${c.id}.label`, c.label)!, description: td(`def.channel.${c.id}.description`, c.description)!, fields: c.fields.map((f) => trField(`def.channel.${c.id}.field`, f)) };
});
export const CHANNEL_GROUPS = [...new Set(CHANNEL_TYPES.map((c) => c.group))];
export const getChannelType = (id: string) => CHANNEL_TYPES.find((c) => c.id === id);
export const NOTIFY_EVENTS = RAW_EVENTS.map((e) => ({ ...e, label: td(`def.event.${e.id}`, e.label)! }));

export const CREDENTIAL_KINDS: CredentialKindDef[] = RAW_CRED_KINDS.map((k) => ({
  ...k,
  label: td(`def.credential.${k.id}.label`, k.label)!,
  fields: k.fields.map((f) => trField(`def.credential.${k.id}.field`, f)),
}));
export const getCredentialKindDef = (id: string) => CREDENTIAL_KINDS.find((k) => k.id === id);

export const ASSET_KIND_LABELS: Record<string, string> = Object.fromEntries(Object.entries(ASSET_KINDS).map(([k, v]) => [k, td(`def.asset_kind.${k}`, v as string)!]));

export const STATUS_LABEL: Record<string, string> = Object.fromEntries(["UP", "DEGRADED", "DOWN", "IMPACTED", "MAINTENANCE", "UNKNOWN", "PAUSED"].map((s) => [s, t(`status.${s}`)]));
export const severityLabel = (s: string) => t(`severity.${s}`);
