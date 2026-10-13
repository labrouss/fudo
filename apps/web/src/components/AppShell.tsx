import { storageGet, storageSet } from "../storage";
import { t } from "../i18n";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLiveReload, useLiveStatus } from "../live";
import { GLOBAL_SCOPE, ROLE_LABELS, tenantPermissions, type MeResponse } from "@fudo/shared";
import { api, setApiTenant } from "../api";
import { Link, usePath } from "../router";
import { Brand } from "./Brand";

const TENANT_KEY = "fudo.tenant";

/** Current tenant selection, remembered per browser. Scopes tenant data from Phase 2 on. */
export function useTenant(me: MeResponse): [string | null, (id: string) => void] {
  const [tenant, setTenant] = useState<string | null>(() => {
    const saved = storageGet(TENANT_KEY);
    const globalOk = tenantPermissions(me, GLOBAL_SCOPE).read;
    const id = me.tenants.some((item) => item.id === saved) || (saved === GLOBAL_SCOPE && globalOk) ? saved : (me.tenants[0]?.id ?? (globalOk ? GLOBAL_SCOPE : null));
    setApiTenant(id);
    return id;
  });
  setApiTenant(tenant);
  useEffect(() => {
    if (tenant) storageSet(TENANT_KEY, tenant);
  }, [tenant]);
  return [tenant, setTenant];
}

const MAIN_NAV = [
  { href: "/", label: t("common.overview") },
  { href: "/applications", label: t("common.applications") },
  { href: "/assets", label: t("common.assets") },
  { href: "/discovery", label: t("discovery.title") },
  { href: "/topology", label: t("common.topology") },
  { href: "/monitors", label: t("common.monitors") },
  { href: "/incidents", label: t("common.incidents"), badge: true },
  { href: "/maintenance", label: t("common.maintenance") },
  { href: "/traps", label: t("traps.title") },
  { href: "/temperature", label: t("temperature.title") },
  { href: "/reports", label: t("common.reports") },
  { href: "/status-pages", label: t("common.status_pages") },
  { href: "/notifications", label: t("common.notifications") },
  { href: "/teams", label: t("teams.title") },
  { href: "/credentials", label: t("credentials.title") },
  { href: "/configuration", label: t("common.configuration") },
  { href: "/access", label: t("common.api_access") },
] as Array<{ href: string; label: string; soon?: boolean; badge?: boolean }>;

/** Number of open (not yet acknowledged) incidents in the current scope, for the nav badge. */
function useOpenIncidents(tenant: string | null) {
  const [n, setN] = useState(0);
  const load = useCallback(() => (tenant ? api.get<Array<{ status: string }>>("/incidents?status=active").then((l) => setN(l.filter((i) => i.status === "open").length)).catch(() => {}) : undefined), [tenant]);
  useLiveReload(load, ["incident"]);
  return n;
}
const ADMIN_NAV = [
  { href: "/admin/tenants", label: t("common.tenants") },
  { href: "/admin/users", label: t("common.users") },
  { href: "/admin/audit", label: t("common.audit_log") },
];

export function AppShell({ me, tenant, onTenant, onSignedOut, children }: { me: MeResponse; tenant: string | null; onTenant: (id: string) => void; onSignedOut: () => void; children: ReactNode }) {
  const path = usePath();
  const openIncidents = useOpenIncidents(tenant);
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  async function signOut() {
    await api.post("/auth/logout").catch(() => {});
    onSignedOut();
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand org={me.orgName} />
        <div className="sidebar__tenant">
          <label htmlFor="tenant-switch">{t("common.tenant")}</label>
          {me.tenants.length || tenantPermissions(me, GLOBAL_SCOPE).read ? (
            <select id="tenant-switch" value={tenant ?? ""} onChange={(e) => onTenant(e.target.value)}>
              {tenantPermissions(me, GLOBAL_SCOPE).read && <option value={GLOBAL_SCOPE}>{t("common.global_infrastructure")}</option>}
              {me.tenants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          ) : (
            <span className="sidebar__empty">{me.isSuperadmin ? t("ui.no_tenants_yet") : t("ui.no_tenant_access")}</span>
          )}
        </div>
        <nav aria-label={t("ui.main")} className="nav">
          {MAIN_NAV.map((n) =>
            n.soon ? (
              <span key={n.href} className="nav__item nav__item--soon" title={t("ui.coming_in_a_later_phase")}>{n.label}<span className="nav__soon">{t("ui.soon")}</span></span>
            ) : (
              <Link key={n.href} href={n.href} className={isActive(n.href) ? "nav__item nav__item--active" : "nav__item"} aria-current={isActive(n.href) ? "page" : undefined}>
                {n.label}{n.badge && openIncidents > 0 && <span className="nav__badge" aria-label={`${openIncidents} open`}>{openIncidents}</span>}
              </Link>
            ),
          )}
        </nav>
        {me.isSuperadmin && (
          <nav aria-label={t("ui.administration")} className="nav">
            <span className="nav__heading">{t("ui.administration")}</span>
            {ADMIN_NAV.map((n) => (
              <Link key={n.href} href={n.href} className={isActive(n.href) ? "nav__item nav__item--active" : "nav__item"} aria-current={isActive(n.href) ? "page" : undefined}>{n.label}</Link>
            ))}
          </nav>
        )}
        <nav aria-label={t("common.settings")} className="nav">
          <Link href="/profile" className={isActive("/profile") ? "nav__item nav__item--active" : "nav__item"} aria-current={isActive("/profile") ? "page" : undefined}>{t("profile.title")}</Link>
          <Link href="/settings" className={isActive("/settings") ? "nav__item nav__item--active" : "nav__item"} aria-current={isActive("/settings") ? "page" : undefined}>{t("common.settings")}</Link>
          <Link href="/help" className={isActive("/help") ? "nav__item nav__item--active" : "nav__item"} aria-current={isActive("/help") ? "page" : undefined}>{t("help.title")}</Link>
        </nav>
        <LiveDot />
        <div className="sidebar__user">
          <span className="avatar" aria-hidden="true">{me.displayName.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}</span>
          <div className="sidebar__who">
            <span>{me.displayName}</span>
            <span className="sidebar__role">{me.isSuperadmin ? t("common.superadmin") : (me.memberships[0] ? t(`role.${me.memberships[0].role}`) : t("common.no_access"))}</span>
          </div>
          <button className="icon-btn icon-btn--dark" onClick={signOut} aria-label={t("ui.sign_out")} title={t("ui.sign_out")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" /></svg>
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

/** `help`: a topic of the user guide (docs/guide/<help>.md), opened by the "?" next to the title. */
export function PageHeader({ title, children, help }: { title: string; children?: ReactNode; help?: string }) {
  return (
    <header className="page-head">
      <h1>{title}{help && <Link href={`/help/${help}`} className="help-link" title={t("help.page_help")} aria-label={t("help.page_help")}>?</Link>}</h1>
      <div className="page-head__actions">{children}</div>
    </header>
  );
}

function LiveDot() {
  const live = useLiveStatus();
  return <div className={live ? "live live--on" : "live"} title={live ? t("ui.receiving_live_updates") : t("ui.reconnecting_to_live_updates")}><span className="live__dot" />{live ? t("ui.live") : t("ui.reconnecting")}</div>;
}
