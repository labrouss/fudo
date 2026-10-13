import { adoptProfileLanguage } from "./i18n";
import { adoptProfileTheme } from "./theme";
import { t } from "./i18n";
import { useCallback, useEffect, useState } from "react";
import { GLOBAL_SCOPE, tenantPermissions, type MeResponse, type SetupStatusResponse } from "@fudo/shared";
import { api, ApiRequestError } from "./api";
import { navigate, usePath } from "./router";
import { AuthLayout } from "./components/AuthLayout";
import { AppShell, useTenant } from "./components/AppShell";
import { SetupWizard } from "./pages/SetupWizard";
import { Login } from "./pages/Login";
import { StatusView } from "./pages/status/StatusView";
import { AckView } from "./pages/ack/AckView";
import { StatusPagesPage } from "./pages/statuspages/StatusPages";
import { ProfilePage } from "./pages/profile/Profile";
import { TeamsPage } from "./pages/teams/Teams";
import { TemperaturePage } from "./pages/temperature/Temperature";
import { CredentialsPage } from "./pages/credentials/Credentials";
import { TrapsPage } from "./pages/traps/Traps";
import { DiscoveryPage } from "./pages/discovery/Discovery";
import { DiscoveryRunPage } from "./pages/discovery/DiscoveryRun";
import { InviteAccept } from "./pages/InviteAccept";
import { Overview } from "./pages/Overview";
import { TenantsPage } from "./pages/admin/Tenants";
import { UsersPage } from "./pages/admin/Users";
import { AuditPageView } from "./pages/admin/Audit";
import { HelpPage } from "./pages/help/Help";
import { SettingsPage } from "./pages/admin/Settings";
import { MonitorList } from "./pages/monitors/MonitorList";
import { MonitorForm, MonitorFormLoader } from "./pages/monitors/MonitorForm";
import { MonitorDetailPage } from "./pages/monitors/MonitorDetail";
import { AssetDetailPage, AssetList } from "./pages/assets/Assets";
import { AppDetailPage, AppList } from "./pages/apps/Applications";
import { MaintenancePage } from "./pages/maintenance/Maintenance";
import { IncidentDetailPage, IncidentList } from "./pages/incidents/Incidents";
import { ChannelsPage } from "./pages/notifications/Channels";
import { TopologyPage } from "./pages/topology/Topology";
import { ReportsPage } from "./pages/reports/Reports";
import { ApiAccessPage } from "./pages/api-access/ApiAccess";
import { ConfigurationPage } from "./pages/config/Configuration";
import { LiveProvider } from "./live";

type View =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "setup" }
  | { kind: "login"; org: string | null }
  | { kind: "app"; me: MeResponse };

export function App() {
  const path = usePath();
  const [view, setView] = useState<View>({ kind: "loading" });

  const boot = useCallback(async () => {
    try {
      const status = await api.get<SetupStatusResponse>("/setup/status");
      if (status.setupRequired) return setView({ kind: "setup" });
      try {
        const me = await api.get<MeResponse>("/auth/me");
        adoptProfileLanguage(me.locale);
        adoptProfileTheme(me.theme);
        setView({ kind: "app", me });
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) setView({ kind: "login", org: status.orgName });
        else throw err;
      }
    } catch (err) {
      setView({ kind: "error", message: err instanceof Error ? err.message : t("app.api_unreachable") });
    }
  }, []);

  // status pages work without the app (and, for public ones, without signing in)
  const statusSlug = path.match(/^\/status\/([a-z0-9-]+)\/?$/)?.[1];
  // acknowledge links from on-call messages also work without signing in
  const ackToken = path.match(/^\/ack\/([A-Za-z0-9_-]{20,100})\/?$/)?.[1];
  useEffect(() => { if (!statusSlug && !ackToken) void boot(); }, [boot, statusSlug, ackToken]);
  if (statusSlug) return <StatusView slug={statusSlug} />;
  if (ackToken) return <AckView token={ackToken} />;

  const invite = path.match(/^\/invite\/([^/]+)$/);
  if (invite) return <InviteAccept token={decodeURIComponent(invite[1]!)} onFinished={() => void boot()} />;

  switch (view.kind) {
    case "loading":
      return <AuthLayout><p className="lead">{t("common.loading")}</p></AuthLayout>;
    case "error":
      return (
        <AuthLayout>
          <div className="stack">
            <h1>{t("app.cannot_reach_the_api")}</h1>
            <p className="lead">{t("app.api_error", { message: view.message })}</p>
            <button className="btn btn--primary" onClick={() => void boot()}>{t("app.retry")}</button>
          </div>
        </AuthLayout>
      );
    case "setup":
      return <SetupWizard onFinished={() => { navigate("/", { replace: true }); void boot(); }} />;
    case "login":
      return <Login org={view.org} onSignedIn={() => void boot()} />;
    case "app":
      return <SignedIn me={view.me} path={path} reload={boot} />;
  }
}

function SignedIn({ me, path, reload }: { me: MeResponse; path: string; reload: () => Promise<void> }) {
  const [tenant, setTenant] = useTenant(me);
  const admin = me.isSuperadmin;

  const perms = tenantPermissions(me, tenant);
  const mon = path.match(/^\/monitors(?:\/([0-9a-f-]{36}|new))?(?:\/(edit|clone))?$/);

  const isGlobal = tenant === GLOBAL_SCOPE;
  const ID = "([0-9a-f-]{36})";
  const assetM = path.match(new RegExp(`^/assets(?:/${ID})?$`));
  const appM = path.match(new RegExp(`^/applications(?:/${ID})?$`));
  const incM = path.match(new RegExp(`^/incidents(?:/${ID})?$`));
  const discM = path.match(new RegExp(`^/discovery(?:/${ID})?$`));
  const scoped = mon || assetM || appM || incM || path === "/maintenance" || path === "/notifications" || path === "/topology" || path === "/reports" || path === "/access" || path === "/configuration" || path === "/status-pages" || path === "/teams" || path === "/temperature" || path === "/credentials" || path === "/traps" || discM;

  let page;
  if (scoped && !tenant) page = <NoTenant me={me} />;
  else if (appM && isGlobal) page = <GlobalNoApps />;
  else if (appM?.[1]) page = <AppDetailPage key={`${tenant}${appM[1]}`} id={appM[1]} perms={perms} />;
  else if (appM) page = <AppList key={tenant} perms={perms} />;
  else if (assetM?.[1]) page = <AssetDetailPage key={`${tenant}${assetM[1]}`} id={assetM[1]} perms={perms} scopeIsGlobal={isGlobal} />;
  else if (assetM) page = <AssetList key={tenant} perms={perms} isGlobal={isGlobal} />;
  else if (incM?.[1]) page = <IncidentDetailPage key={`${tenant}${incM[1]}`} id={incM[1]} perms={perms} scopeIsGlobal={isGlobal} />;
  else if (incM) page = <IncidentList key={tenant} />;
  else if (path === "/reports") page = <ReportsPage key={tenant} perms={perms} isGlobal={isGlobal} />;
  else if (path === "/configuration") page = <ConfigurationPage key={tenant} perms={perms} isGlobal={isGlobal} />;
  else if (path === "/access") page = <ApiAccessPage key={tenant} perms={perms} />;
  else if (path === "/topology") page = <TopologyPage key={tenant} isGlobal={isGlobal} />;
  else if (path === "/notifications") page = <ChannelsPage key={tenant} perms={perms} isGlobal={isGlobal} />;
  else if (path === "/maintenance") page = <MaintenancePage key={tenant} perms={perms} isGlobal={isGlobal} />;
  else if (path === "/status-pages") page = <StatusPagesPage key={tenant} perms={perms} isGlobal={isGlobal} />;
  else if (path === "/teams") page = <TeamsPage key={tenant} perms={perms} isGlobal={isGlobal} />;
  else if (discM?.[1]) page = <DiscoveryRunPage key={discM[1]} id={discM[1]} me={me} perms={perms} isGlobal={isGlobal} />;
  else if (discM) page = <DiscoveryPage key={tenant} perms={perms} isGlobal={isGlobal} />;
  else if (path === "/traps") page = <TrapsPage key={tenant} perms={perms} isGlobal={isGlobal} />;
  else if (path === "/credentials") page = <CredentialsPage key={tenant} perms={perms} isGlobal={isGlobal} />;
  else if (path === "/temperature") page = <TemperaturePage key={tenant} perms={perms} isGlobal={isGlobal} />;
  else if (mon && mon[1] === "new" && perms.manage) page = <MonitorForm mode="new" />;
  else if (mon && mon[1] && mon[1] !== "new" && mon[2] && perms.manage) page = <MonitorFormLoader key={path} id={mon[1]} mode={mon[2] as "edit" | "clone"} />;
  else if (mon && mon[1] && mon[1] !== "new") page = <MonitorDetailPage key={`${tenant}${mon[1]}`} id={mon[1]} perms={perms} scopeIsGlobal={isGlobal} />;
  else if (mon) page = <MonitorList key={tenant} perms={perms} isGlobal={isGlobal} />;
  else if (path === "/admin/tenants" && admin) page = <TenantsPage onChanged={() => void reload()} />;
  else if (path === "/admin/users" && admin) page = <UsersPage me={me} />;
  else if (path === "/admin/audit" && admin) page = <AuditPageView />;
  else if (path === "/settings" || path === "/admin/settings") page = <SettingsPage me={me} />;
  else if (path === "/profile") page = <ProfilePage onChanged={() => void reload()} />;
  else if (path === "/help" || path.startsWith("/help/")) page = <HelpPage topicId={path.split("/")[2] ?? null} />;
  else page = <Overview key={tenant} me={me} tenant={tenant} />;

  return (
    <LiveProvider scope={tenant}>
    <AppShell me={me} tenant={tenant} onTenant={(id) => { setTenant(id); const m = path.match(/^\/(monitors|assets|applications|incidents)\/.+/); if (m) navigate(`/${m[1]}`); }} onSignedOut={() => { navigate("/", { replace: true }); void reload(); }}>
      {page}
    </AppShell>
    </LiveProvider>
  );
}

function NoTenant({ me }: { me: MeResponse }) {
  return (
    <div className="content">
      <section className="card">
        <h2>{t("app.no_tenant_available")}</h2>
        <p className="lead">{me.isSuperadmin ? t("app.create_a_tenant_under_administration") : t("app.ask_an_administrator_to_give_you_access_to")}</p>
      </section>
    </div>
  );
}

function GlobalNoApps() {
  return (
    <div className="content">
      <section className="card">
        <h2>{t("app.applications_belong_to_tenants")}</h2>
        <p className="lead">{t("app.the_global_infrastructure_scope_holds")}</p>
      </section>
    </div>
  );
}
