import { t, currentLanguage } from "../../i18n";
import { NoMatch, SortTh, TableFilter, time, useTable } from "../../components/Table";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { GLOBAL_ROLES, ROLE_LABELS, TENANT_ROLES, type InviteLinkResponse, type Membership, type MeResponse, type TenantDto, type UserDto } from "@fudo/shared";
import { api, errorFields } from "../../api";
import { LanguageSelect } from "../../components/LanguageSelect";
import { PageHeader } from "../../components/AppShell";
import { Dialog } from "../../components/Dialog";
import { Field, FormError } from "../../components/Field";
import { UserStatusPill, formatDateTime } from "../../components/Status";

type Assign = { tenantId: string | null; role: string };

function roleText(m: Membership) {
  return `${m.tenantId ? m.tenantName : t("admin.all_tenants")} · ${t(`role.${m.role}`)}`;
}

export function UsersPage({ me }: { me: MeResponse }) {
  const [users, setUsers] = useState<UserDto[] | null>(null);
  const [tenants, setTenants] = useState<TenantDto[]>([]);
  const [dialog, setDialog] = useState<{ kind: "new" } | { kind: "manage"; user: UserDto } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, item] = await Promise.all([api.get<UserDto[]>("/users"), api.get<TenantDto[]>("/tenants")]);
      setUsers(u);
      setTenants(item);
      setDialog((d) => (d?.kind === "manage" ? { kind: "manage", user: u.find((x) => x.id === d.user.id) ?? d.user } : d));
    } catch (e) {
      setError(errorFields(e).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const USER_RANK: Record<string, number> = { active: 0, invited: 1, disabled: 2 };
  const table = useTable("users", users, {
    user: { value: (u) => u.displayName },
    status: { value: (u) => USER_RANK[u.status] ?? 9 },
    access: { value: (u) => (u.isSuperadmin ? `0 ${t("common.superadmin")}` : u.roles.length ? `1 ${u.roles.map(roleText).join(", ")}` : null) },
    login: { value: (u) => time(u.lastLoginAt), desc: true },
  }, { text: (u) => u.email });

  return (
    <>
      <PageHeader help="users-and-access" title={t("common.users")}>
        <TableFilter table={table} />
        <button className="btn btn--primary" onClick={() => setDialog({ kind: "new" })}>{t("admin.invite_user")}</button>
      </PageHeader>
      <div className="content">
        <FormError message={error} />
        <section className="card card--flush">
          <table className="table">
            <thead><tr><SortTh table={table} col="user">{t("admin.user")}</SortTh><SortTh table={table} col="status">{t("common.status")}</SortTh><SortTh table={table} col="access">{t("admin.access")}</SortTh><SortTh table={table} col="login">{t("admin.last_sign_in")}</SortTh><th><span className="sr-only">{t("common.actions")}</span></th></tr></thead>
            <tbody>
              {table.rows.map((u) => (
                <tr key={u.id}>
                  <td><div className="strong">{u.displayName}{u.id === me.id && <span className="muted">{" "}{t("admin.you")}</span>}</div><div className="muted">{u.email}</div></td>
                  <td><UserStatusPill status={u.status} /></td>
                  <td>
                    <div className="chips">
                      {u.isSuperadmin && <span className="chip chip--strong">{t("common.superadmin")}</span>}
                      {u.roles.map((r) => <span key={`${r.tenantId}`} className="chip">{roleText(r)}</span>)}
                      {!u.isSuperadmin && u.roles.length === 0 && <span className="muted">{t("admin.no_access_yet")}</span>}
                    </div>
                  </td>
                  <td className="muted">{formatDateTime(u.lastLoginAt)}</td>
                  <td className="actions"><button className="btn btn--small" onClick={() => setDialog({ kind: "manage", user: u })}>{t("admin.manage")}</button></td>
                </tr>
              ))}
              <NoMatch table={table} colSpan={5} />
            </tbody>
          </table>
        </section>
      </div>
      <Dialog wide title={dialog?.kind === "manage" ? dialog.user.displayName : t("admin.invite_user")} open={dialog !== null} onClose={() => { setDialog(null); void load(); }}>
        {dialog?.kind === "new" && <InviteForm tenants={tenants} onCreated={() => void load()} />}
        {dialog?.kind === "manage" && <ManageUser user={dialog.user} tenants={tenants} isSelf={dialog.user.id === me.id} onChanged={() => void load()} onDeleted={() => { setDialog(null); void load(); }} />}
      </Dialog>
    </>
  );
}

/** One select per scope: global + each tenant. */
function RoleMatrix({ tenants, value, onChange }: { tenants: TenantDto[]; value: Assign[]; onChange: (v: Assign[]) => void }) {
  const get = (tenantId: string | null) => value.find((a) => a.tenantId === tenantId)?.role ?? "";
  const set = (tenantId: string | null, role: string) => onChange([...value.filter((a) => a.tenantId !== tenantId), ...(role ? [{ tenantId, role }] : [])]);
  const scopes: Array<{ id: string | null; name: string; hint: string; roles: readonly string[] }> = [
    { id: null, name: t("admin.all_tenants"), hint: t("admin.global_scope_shared_infrastructure_and"), roles: GLOBAL_ROLES },
    ...tenants.filter((item) => item.isActive).map((item) => ({ id: item.id, name: item.name, hint: item.slug, roles: TENANT_ROLES })),
  ];
  return (
    <fieldset className="matrix">
      <legend>{t("admin.access")}</legend>
      {scopes.map((s) => (
        <div className="matrix__row" key={s.id ?? "global"}>
          <label htmlFor={`scope-${s.id ?? "global"}`}><span className="strong">{s.name}</span><span className="muted">{s.hint}</span></label>
          <select id={`scope-${s.id ?? "global"}`} value={get(s.id)} onChange={(e) => set(s.id, e.target.value)}>
            <option value="">{t("common.no_access")}</option>
            {s.roles.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
          </select>
        </div>
      ))}
      {tenants.length === 0 && <p className="muted">{t("admin.create_tenants_first_to_grant_tenant_level")}</p>}
    </fieldset>
  );
}

function InviteResult({ invite, email }: { invite: InviteLinkResponse; email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="invite-result" role="status">
      <p className="strong">
        {invite.emailed ? t("admin.invitation_emailed_to_email", { email }) : invite.emailError ? t("admin.the_email_could_not_be_sent_emailerror", { emailError: invite.emailError }) : t("admin.email_is_not_configured_so_share_this_link")}
      </p>
      <div className="copy-row">
        <input readOnly value={invite.link} aria-label={t("admin.invitation_link")} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn" onClick={() => { void navigator.clipboard?.writeText(invite.link); setCopied(true); }}>{copied ? t("common.copied") : t("admin.copy_link")}</button>
      </div>
      <p className="muted">{t("admin.link_works_once", { when: formatDateTime(invite.expiresAt) })}</p>
    </div>
  );
}

function InviteForm({ tenants, onCreated }: { tenants: TenantDto[]; onCreated: () => void }) {
  const [form, setForm] = useState({ email: "", displayName: "", isSuperadmin: false, sendEmail: true, locale: currentLanguage() });
  const [roles, setRoles] = useState<Assign[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InviteLinkResponse | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    setMessage(null);
    try {
      const r = await api.post<{ invite: InviteLinkResponse }>("/users", { ...form, roles });
      setResult(r.invite);
      onCreated();
    } catch (err) {
      const r = errorFields(err);
      setFields(r.fields);
      setMessage(Object.keys(r.fields).length ? null : r.message);
    } finally {
      setBusy(false);
    }
  }

  if (result) return <InviteResult invite={result} email={form.email} />;
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={message ?? (Object.keys(fields).some((k) => k.startsWith("roles")) ? t("admin.role_not_allowed") : null)} />
      <div className="grid-2">
        <Field label={t("common.name")} value={form.displayName} error={fields.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
        <Field label={t("common.email")} type="email" value={form.email} error={fields.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </div>
      <label className="check"><input type="checkbox" checked={form.isSuperadmin} onChange={(e) => setForm({ ...form, isSuperadmin: e.target.checked })} />{t("admin.superadmin_full_access_including_users_and")}</label>
      {!form.isSuperadmin && <RoleMatrix tenants={tenants} value={roles} onChange={setRoles} />}
      <label className="field">
        <span>{t("ui.language")}</span>
        <LanguageSelect value={form.locale} onChange={(v) => setForm({ ...form, locale: v })} />
        <span className="field__hint">{t("admin.invite_language_hint")}</span>
      </label>
      <label className="check"><input type="checkbox" checked={form.sendEmail} onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })} />{t("admin.email_the_invitation_link")}</label>
      <div className="row-actions row-actions--end">
        <button className="btn btn--primary" disabled={busy}>{busy ? t("admin.inviting") : t("admin.send_invitation")}</button>
      </div>
    </form>
  );
}

function ManageUser({ user, tenants, isSelf, onChanged, onDeleted }: { user: UserDto; tenants: TenantDto[]; isSelf: boolean; onChanged: () => void; onDeleted: () => void }) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [isSuperadmin, setIsSuperadmin] = useState(user.isSuperadmin);
  const [roles, setRoles] = useState<Assign[]>(user.roles.map((r) => ({ tenantId: r.tenantId, role: r.role })));
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteLinkResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setMessage(null);
    setNotice(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setMessage(errorFields(err).message);
    } finally {
      setBusy(null);
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run("save", async () => {
      await api.put(`/users/${user.id}`, { displayName, isSuperadmin, roles: isSuperadmin ? [] : roles });
      setNotice(t("admin.changes_saved"));
    });
  };
  const linkAction = (path: string, confirmText?: string) => () => {
    if (confirmText && !confirm(confirmText)) return;
    void run(path, async () => setInvite(await api.post<InviteLinkResponse>(`/users/${user.id}/${path}`)));
  };
  const remove = () => {
    if (!confirm(t("admin.confirm_delete_user", { name: user.displayName, email: user.email }))) return;
    void run("delete", async () => { await api.del(`/users/${user.id}`); onDeleted(); });
  };
  const toggleActive = () => {
    if (user.isActive && !confirm(t("admin.deactivate_displayname_they_are_signed_out", { displayName: user.displayName }))) return;
    void run("active", async () => { await api.post(`/users/${user.id}/${user.isActive ? "deactivate" : "activate"}`); });
  };

  return (
    <div className="stack">
      <div className="user-head"><span className="muted">{user.email}</span><UserStatusPill status={user.status} /></div>
      <FormError message={message} />
      {notice && <div className="form-ok" role="status">{notice}</div>}
      {invite && <InviteResult invite={invite} email={user.email} />}
      <form className="stack" onSubmit={save} noValidate>
        <Field label={t("common.name")} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <label className="check"><input type="checkbox" checked={isSuperadmin} disabled={isSelf} onChange={(e) => setIsSuperadmin(e.target.checked)} />{t("admin.superadmin_full_access_including_users_and")}</label>
        {!isSuperadmin && <RoleMatrix tenants={tenants} value={roles} onChange={setRoles} />}
        <div className="row-actions row-actions--end"><button className="btn btn--primary" disabled={busy !== null}>{busy === "save" ? t("common.saving") : t("common.save_changes")}</button></div>
      </form>
      {!isSelf && (
        <section className="danger-zone">
          <h3>{t("admin.sign_in")}</h3>
          <div className="row-actions row-actions--wrap">
            {(user.status === "invited" || user.status === "reset_pending") && <button className="btn" disabled={busy !== null} onClick={linkAction("invite")}>{t("admin.create_a_new_link")}</button>}
            {user.status === "active" && <button className="btn" disabled={busy !== null} onClick={linkAction("reset-2fa", t("admin.confirm_reset_2fa", { name: user.displayName }))}>{t("admin.reset_2fa")}</button>}
            {user.isActive && user.status !== "invited" && <button className="btn" disabled={busy !== null} onClick={linkAction("reset-signin", t("admin.confirm_reset_signin", { name: user.displayName }))}>{t("admin.reset_password_and_2fa")}</button>}
            <button className={user.isActive ? "btn btn--danger" : "btn"} disabled={busy !== null} onClick={toggleActive}>{user.isActive ? t("admin.deactivate") : t("admin.activate")}</button>
            <button className="btn btn--danger" disabled={busy !== null} onClick={remove}>{t("admin.delete_user")}</button>
          </div>
        </section>
      )}
    </div>
  );
}
