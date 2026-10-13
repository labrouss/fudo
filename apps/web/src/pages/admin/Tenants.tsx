import { t } from "../../i18n";
import { NoMatch, SortTh, TableFilter, time, useTable } from "../../components/Table";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { TenantDto } from "@fudo/shared";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { Dialog } from "../../components/Dialog";
import { Field, FormError } from "../../components/Field";
import { Pill, formatDateTime } from "../../components/Status";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export function TenantsPage({ onChanged }: { onChanged: () => void }) {
  const [tenants, setTenants] = useState<TenantDto[] | null>(null);
  const [editing, setEditing] = useState<TenantDto | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.get<TenantDto[]>("/tenants").then(setTenants).catch((e) => setError(errorFields(e).message)), []);
  useEffect(() => { void load(); }, [load]);

  const table = useTable("tenants", tenants, {
    name: { value: (x) => x.name },
    slug: { value: (x) => x.slug },
    description: { value: (x) => x.description },
    members: { value: (x) => x.memberCount, desc: true },
    status: { value: (x) => (x.isActive ? 0 : 1) },
    created: { value: (x) => time(x.createdAt), desc: true },
  });
  return (
    <>
      <PageHeader help="concepts" title={t("common.tenants")}>
        <TableFilter table={table} />
        <button className="btn btn--primary" onClick={() => setEditing("new")}>{t("admin.new_tenant")}</button>
      </PageHeader>
      <div className="content">
        <FormError message={error} />
        <section className="card card--flush">
          {tenants && tenants.length === 0 ? (
            <div className="empty">
              <p>{t("admin.no_tenants_yet_create_one_per_business")}</p>
              <button className="btn btn--primary" onClick={() => setEditing("new")}>{t("admin.create_the_first_tenant")}</button>
            </div>
          ) : (
            <table className="table">
              <thead><tr><SortTh table={table} col="name">{t("common.name")}</SortTh><SortTh table={table} col="slug">{t("admin.short_name")}</SortTh><SortTh table={table} col="description">{t("common.description")}</SortTh><SortTh table={table} col="members" className="num">{t("common.members")}</SortTh><SortTh table={table} col="status">{t("common.status")}</SortTh><SortTh table={table} col="created">{t("common.created")}</SortTh><th><span className="sr-only">{t("common.actions")}</span></th></tr></thead>
              <tbody>
                {table.rows.map((item) => (
                  <tr key={item.id}>
                    <td className="strong">{item.name}</td>
                    <td className="mono">{item.slug}</td>
                    <td className="muted">{item.description || "—"}</td>
                    <td className="num">{item.memberCount}</td>
                    <td>{item.isActive ? <Pill tone="up">{t("common.active")}</Pill> : <Pill tone="neutral">{t("admin.inactive")}</Pill>}</td>
                    <td className="muted">{formatDateTime(item.createdAt)}</td>
                    <td className="actions"><button className="btn btn--small" onClick={() => setEditing(item)}>{t("common.edit")}</button></td>
                  </tr>
                ))}
                <NoMatch table={table} colSpan={7} />
              </tbody>
            </table>
          )}
        </section>
      </div>
      <Dialog title={editing === "new" ? t("admin.new_tenant") : t("admin.edit_tenant")} open={editing !== null} onClose={() => setEditing(null)}>
        {editing !== null && <TenantForm tenant={editing === "new" ? null : editing} onSaved={() => { setEditing(null); void load(); onChanged(); }} />}
      </Dialog>
    </>
  );
}

function TenantForm({ tenant, onSaved }: { tenant: TenantDto | null; onSaved: () => void }) {
  const [form, setForm] = useState({ name: tenant?.name ?? "", slug: tenant?.slug ?? "", description: tenant?.description ?? "", isActive: tenant?.isActive ?? true });
  const [slugTouched, setSlugTouched] = useState(Boolean(tenant));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    setMessage(null);
    try {
      if (tenant) await api.put(`/tenants/${tenant.id}`, form);
      else await api.post("/tenants", form);
      onSaved();
    } catch (err) {
      const r = errorFields(err);
      setFields(r.fields);
      setMessage(Object.keys(r.fields).length ? null : r.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <Field label={t("common.name")} value={form.name} error={fields.name} required onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugTouched ? form.slug : slugify(e.target.value) })} />
      <Field label={t("admin.short_name")} value={form.slug} error={fields.slug} hint={t("admin.lowercase_letters_digits_and_dashes_used")} onChange={(e) => { setSlugTouched(true); setForm({ ...form, slug: e.target.value }); }} />
      <Field label={t("admin.description_optional")} value={form.description} error={fields.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      {tenant && <label className="check"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />{t("admin.active_inactive_tenants_are_hidden_from")}</label>}
      <div className="row-actions row-actions--end">
        <button className="btn btn--primary" disabled={busy}>{busy ? t("common.saving") : tenant ? t("common.save_changes") : t("admin.create_tenant")}</button>
      </div>
    </form>
  );
}
