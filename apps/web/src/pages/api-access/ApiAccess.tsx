import { t, uiLocale } from "../../i18n";
import { NoMatch, SortTh, TableFilter, time, useTable } from "../../components/Table";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ApiTokenDto, TenantPermissions } from "@fudo/shared";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { Dialog } from "../../components/Dialog";
import { Field, FormError } from "../../components/Field";
import { Pill } from "../../components/Status";

const PERM = { read: t("api_access.perm.read"), operate: t("api_access.perm.operate"), manage: t("api_access.perm.manage") } as const;

export function ApiAccessPage({ perms }: { perms: TenantPermissions }) {
  const [list, setList] = useState<ApiTokenDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);
  const load = useCallback(() => api.get<ApiTokenDto[]>("/api-tokens").then(setList).catch((e) => setError(errorFields(e).message)), []);
  useEffect(() => { if (perms.manage) void load(); }, [load, perms.manage]);
  const PERM_RANK: Record<string, number> = { manage: 0, operate: 1, read: 2 };
  const table = useTable("api-tokens", list, {
    name: { value: (x) => x.name },
    permission: { value: (x) => PERM_RANK[x.permission] ?? 9 },
    created: { value: (x) => time(x.createdAt), desc: true },
    used: { value: (x) => time(x.lastUsedAt), desc: true },
    expires: { value: (x) => time(x.expiresAt) },
  }, { text: (x) => `${x.prefix} ${x.createdBy ?? ""}` });
  if (!perms.manage) return <><PageHeader help="users-and-access" title={t("common.api_access")} /><div className="content"><p className="muted">{t("api_access.tenant_admins_or_infra_admins_in_the")}</p></div></>;
  const origin = location.origin;
  return (
    <>
      <PageHeader help="users-and-access" title={t("common.api_access")}><a className="btn" href="/api/docs" target="_blank" rel="noreferrer">{t("api_access.api_documentation")}</a><button className="btn btn--primary" onClick={() => setCreating(true)}>{t("api_access.new_token")}</button></PageHeader>
      <div className="content">
        <FormError message={error} />
        {created && (
          <div className="invite-result" role="status">
            <p className="strong">{t("api_access.token_created", { name: created.name })}</p>
            <div className="copy-row"><input readOnly value={created.token} aria-label={t("api_access.api_token")} onFocus={(e) => e.target.select()} /><button className="btn" onClick={() => void navigator.clipboard?.writeText(created.token)}>{t("common.copy")}</button></div>
            <pre className="snippet">{`curl -H "Authorization: Bearer ${created.token}" ${origin}/api/incidents\n\n# PowerShell\nInvoke-RestMethod -Uri ${origin}/api/incidents -Headers @{ Authorization = "Bearer ${created.token}" }`}</pre>
          </div>
        )}
        <div className="list-tools"><p className="muted small" style={{ margin: 0, flex: 1 }}>{t("api_access.tokens_act_only_in_this_scope_with_the")}</p><TableFilter table={table} /></div>
        <section className="card card--flush">
          {list && list.length === 0 ? <div className="empty"><p>{t("api_access.no_api_tokens_yet")}</p></div> : (
            <table className="table">
              <thead><tr><SortTh table={table} col="name">{t("api_access.token_2")}</SortTh><SortTh table={table} col="permission">{t("api_access.permission")}</SortTh><SortTh table={table} col="created">{t("common.created")}</SortTh><SortTh table={table} col="used">{t("api_access.last_used")}</SortTh><SortTh table={table} col="expires">{t("api_access.expires")}</SortTh><th><span className="sr-only">{t("common.actions")}</span></th></tr></thead>
              <tbody>{table.rows.map((item) => (
                <tr key={item.id}>
                  <td><span className="strong">{item.name}</span>{item.revokedAt && <> <Pill tone="neutral">{t("api_access.revoked")}</Pill></>}<div className="mono small muted">{item.prefix}…</div></td>
                  <td><Pill tone={item.permission === "manage" ? "warn" : item.permission === "operate" ? "info" : "neutral"}>{item.permission}</Pill></td>
                  <td className="small">{new Date(item.createdAt).toLocaleDateString(uiLocale())}{item.createdBy && <div className="muted">{item.createdBy}</div>}</td>
                  <td className="small">{item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString(uiLocale()) : <span className="muted">{t("common.never")}</span>}</td>
                  <td className="small">{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString(uiLocale()) : <span className="muted">{t("common.never")}</span>}</td>
                  <td className="actions">{!item.revokedAt && <button className="btn btn--small btn--danger" onClick={async () => { if (confirm(t("api_access.revoke_name_scripts_using_it_stop_working", { name: item.name }))) { await api.del(`/api-tokens/${item.id}`); void load(); } }}>{t("api_access.revoke")}</button>}</td>
                </tr>
              ))}<NoMatch table={table} colSpan={6} /></tbody>
            </table>
          )}
        </section>
      </div>
      <Dialog title={t("api_access.new_api_token")} open={creating} onClose={() => setCreating(false)}>
        {creating && <TokenForm onCreated={(item, n) => { setCreating(false); setCreated({ token: item, name: n }); void load(); }} />}
      </Dialog>
    </>
  );
}

function TokenForm({ onCreated }: { onCreated: (token: string, name: string) => void }) {
  const [f, setF] = useState({ name: "", permission: "read", expiresInDays: "365" });
  const [fields, setFields] = useState<Record<string, string>>({});
  async function submit(e: FormEvent) {
    e.preventDefault(); setFields({});
    try { const r = await api.post<{ token: string }>("/api-tokens", { ...f, expiresInDays: Number(f.expiresInDays) }); onCreated(r.token, f.name); } catch (err) { setFields(errorFields(err).fields); }
  }
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Field label={t("common.name")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={fields.name} placeholder={t("api_access.e_g_grafana_rundeck_backup_script")} />
      <fieldset className="matrix"><legend>{t("api_access.permission")}</legend>{(Object.keys(PERM) as Array<keyof typeof PERM>).map((p) => <label key={p} className="check small" style={{ padding: "6px 0" }}><input type="radio" name="perm" checked={f.permission === p} onChange={() => setF({ ...f, permission: p })} />{PERM[p]}</label>)}</fieldset>
      <label className="field">{t("api_access.expires")}<select value={f.expiresInDays} onChange={(e) => setF({ ...f, expiresInDays: e.target.value })}><option value="30">{t("api_access.in_30_days")}</option><option value="90">{t("api_access.in_90_days")}</option><option value="365">{t("api_access.in_1_year")}</option><option value="0">{t("common.never_2")}</option></select></label>
      <div className="row-actions row-actions--end"><button className="btn btn--primary">{t("api_access.create_token")}</button></div>
    </form>
  );
}
