import { t, uiLocale } from "../../i18n";
import { NoMatch, SortTh, TableFilter, time, useTable } from "../../components/Table";
import { useCallback, useEffect, useState } from "react";
import type { AuditEntryDto, AuditPage, UserDto } from "@fudo/shared";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { FormError } from "../../components/Field";

const CATEGORIES = [
  { value: "", label: t("admin.all_events") },
  { value: "auth.", label: t("admin.sign_in") },
  { value: "setup.", label: t("admin.setup") },
  { value: "user.", label: t("common.users") },
  { value: "invite.", label: t("admin.invitations") },
  { value: "tenant.", label: t("common.tenants") },
  { value: "settings.", label: t("common.settings") },
];

function details(e: AuditEntryDto): string {
  if (!e.diff) return "";
  return Object.entries(e.diff)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export function AuditPageView() {
  const [entries, setEntries] = useState<AuditEntryDto[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [action, setAction] = useState("");
  const [userId, setUserId] = useState("");
  const [users, setUsers] = useState<UserDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const query = useCallback((before?: number) => {
    const q = new URLSearchParams({ limit: "50" });
    if (action) q.set("action", action);
    if (userId) q.set("userId", userId);
    if (before) q.set("before", String(before));
    return `/audit?${q.toString()}`;
  }, [action, userId]);

  useEffect(() => {
    setLoading(true);
    api.get<AuditPage>(query())
      .then((p) => { setEntries(p.entries); setNext(p.nextBefore); setError(null); })
      .catch((e) => setError(errorFields(e).message))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => { api.get<UserDto[]>("/users").then(setUsers).catch(() => {}); }, []);

  async function more() {
    if (!next) return;
    setLoading(true);
    try {
      const p = await api.get<AuditPage>(query(next));
      setEntries((e) => [...e, ...p.entries]);
      setNext(p.nextBefore);
    } catch (e) {
      setError(errorFields(e).message);
    } finally {
      setLoading(false);
    }
  }

  const table = useTable("audit", entries, {
    time: { value: (e) => time(e.ts), desc: true },
    user: { value: (e) => e.userEmail ?? e.formerEmail ?? null },
    event: { value: (e) => e.action },
    tenant: { value: (e) => e.tenantName },
    details: { value: (e) => details(e) },
  }, { initial: { key: "time", dir: "desc" } });

  return (
    <>
      <PageHeader help="users-and-access" title={t("common.audit_log")}>
        <TableFilter table={table} />
        <label className="inline-field">{t("admin.event")}
          <select value={action} onChange={(e) => setAction(e.target.value)}>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
        </label>
        <label className="inline-field">{t("admin.user")}
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">{t("admin.everyone")}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
          </select>
        </label>
      </PageHeader>
      <div className="content">
        <FormError message={error} />
        <section className="card card--flush">
          <table className="table table--dense">
            <thead><tr><SortTh table={table} col="time">{t("admin.time")}</SortTh><SortTh table={table} col="user">{t("admin.user")}</SortTh><SortTh table={table} col="event">{t("admin.event")}</SortTh><SortTh table={table} col="tenant">{t("common.tenant")}</SortTh><SortTh table={table} col="details">{t("admin.details")}</SortTh></tr></thead>
            <tbody>
              {table.rows.map((e) => (
                <tr key={e.id}>
                  <td className="mono nowrap">{new Date(e.ts).toLocaleString(uiLocale())}</td>
                  <td>{e.userEmail ?? (e.userDeleted ? <span className="muted">{e.formerEmail ? t("admin.deleted_user_email", { email: e.formerEmail }) : t("admin.deleted_user")}</span> : <span className="muted">{t("admin.system")}</span>)}</td>
                  <td className="mono">{e.action}</td>
                  <td>{e.tenantName ?? <span className="muted">—</span>}</td>
                  <td className="details">{details(e)}</td>
                </tr>
              ))}
              <NoMatch table={table} colSpan={5} />
              {!loading && entries.length === 0 && <tr><td colSpan={5} className="muted">{t("admin.no_events_match_these_filters")}</td></tr>}
            </tbody>
          </table>
        </section>
        {next && <div className="list-tools"><button className="btn" onClick={more} disabled={loading}>{loading ? t("common.loading") : t("admin.load_older_events")}</button>
          {(table.filtering || table.sort?.key !== "time" || table.sort.dir !== "desc") && <span className="muted small">{t("table.loaded_only", { count: entries.length })}</span>}</div>}
      </div>
    </>
  );
}
