import type { ApiError } from "@fudo/shared";

export class ApiRequestError extends Error {
  constructor(public status: number, public body: ApiError) {
    super(body.message);
  }
  get fields(): Record<string, string> {
    return this.body.fields ?? {};
  }
}

/** Tenant selected in the sidebar; sent with every request so tenant-scoped APIs know the context. */
let currentTenant: string | null = null;
export const setApiTenant = (id: string | null) => { currentTenant = id; };
/** The tenant the interface is showing (for requests made outside `api`, e.g. file downloads). */
export const apiTenant = () => currentTenant;

async function request<T>(method: string, url: string, body?: unknown, tenant?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["content-type"] = "application/json";
  const scope = tenant ?? currentTenant;
  if (scope) headers["x-fudo-tenant"] = scope;
  // error messages come back in the interface language (the <html lang> set by i18n)
  const lang = typeof document !== "undefined" ? document.documentElement.lang : "";
  if (lang) headers["x-fudo-lang"] = lang;
  const res = await fetch(`/api${url}`, {
    method,
    credentials: "same-origin",
    headers,
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(res.status, data ?? { error: "network", message: `Request failed (${res.status})` });
  }
  return data as T;
}

export const api = {
  get: <T,>(url: string) => request<T>("GET", url),
  post: <T,>(url: string, body?: unknown) => request<T>("POST", url, body),
  put: <T,>(url: string, body?: unknown) => request<T>("PUT", url, body),
  del: <T,>(url: string) => request<T>("DELETE", url, {}),
  /** a request in another scope than the one shown (e.g. creating discovered devices in a tenant) */
  in: (tenant: string) => ({ post: <T,>(url: string, body?: unknown) => request<T>("POST", url, body, tenant) }),
};

export function errorFields(err: unknown): { message: string | null; fields: Record<string, string> } {
  if (err instanceof ApiRequestError) return { message: err.message, fields: err.fields };
  if (err instanceof Error) return { message: err.message, fields: {} };
  return { message: "Something went wrong", fields: {} };
}
