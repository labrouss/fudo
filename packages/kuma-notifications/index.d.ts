export interface KumaField {
  key: string;
  label: string;
  kind: "text" | "secret" | "textarea" | "checkbox" | "number" | "select";
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  hint?: string;
  showIf?: { key: string; equals: string | boolean };
  default?: string | number | boolean;
}
export interface KumaProvider { id: string; file: string; label: string; category: string; fields: KumaField[] }
export const catalog: { source: { project: string; version: string; commit: string; license: string }; providers: KumaProvider[] };
export function send(id: string, config: Record<string, unknown>, msg: string, monitorJSON: Record<string, unknown> | null, heartbeatJSON: Record<string, unknown> | null, options?: { baseURL?: string | null }): Promise<string>;
export function load(): Map<string, unknown>;
export const loadErrors: Record<string, string>;
export const UP: 1;
export const DOWN: 0;
