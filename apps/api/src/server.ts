import Fastify from "fastify";
import type pg from "pg";
import type { Db } from "@fudo/db";
import { prettyTransport, type Env } from "@fudo/shared";
import { SessionStore } from "./lib/sessions.js";
import { TotpService } from "./lib/totp-service.js";
import { securityPlugin } from "./plugins/security.js";
import { authPlugin } from "./plugins/auth.js";
import { systemRoutes } from "./routes/system.js";
import { setupRoutes } from "./routes/setup.js";
import { authRoutes } from "./routes/auth.js";
import { settingsRoutes } from "./routes/settings.js";
import { enrollRoutes } from "./routes/enroll.js";
import { inviteRoutes } from "./routes/invites.js";
import { tenantRoutes } from "./routes/tenants.js";
import { userRoutes } from "./routes/users.js";
import { auditRoutes } from "./routes/audit.js";
import { monitorRoutes } from "./routes/monitors.js";
import { pushRoutes } from "./routes/push.js";
import { assetRoutes } from "./routes/assets.js";
import { dependencyRoutes } from "./routes/dependencies.js";
import { applicationRoutes } from "./routes/applications.js";
import { maintenanceRoutes } from "./routes/maintenance.js";
import { incidentRoutes } from "./routes/incidents.js";
import { channelRoutes } from "./routes/channels.js";
import { metricsRoutes } from "./routes/metrics.js";
import { topologyRoutes } from "./routes/topology.js";
import { liveRoutes } from "./routes/live.js";
import { LiveHub } from "./lib/live.js";
import { reportRoutes } from "./routes/reports.js";
import { tokenRoutes } from "./routes/tokens.js";
import { configRoutes } from "./routes/config.js";
import { localeRoutes } from "./routes/locales.js";
import { Locales } from "./lib/locales.js";
import { themeRoutes } from "./routes/themes.js";
import { backupRoutes } from "./routes/backups.js";
import { statusPageRoutes } from "./routes/statuspages.js";
import { profileRoutes } from "./routes/profile.js";
import { teamRoutes } from "./routes/teams.js";
import { oncallRoutes } from "./routes/oncall.js";
import { ackRoutes } from "./routes/ack.js";
import { retentionRoutes } from "./routes/retention.js";
import { kumaRoutes } from "./routes/kuma.js";
import { temperatureRoutes } from "./routes/temperature.js";
import { credentialRoutes } from "./routes/credentials.js";
import { trapRoutes } from "./routes/traps.js";
import { discoveryRoutes } from "./routes/discovery.js";
import { Themes } from "./lib/themes.js";

export interface AppDeps {
  env: Env;
  pool: pg.Pool;
  db: Db;
  sessions: SessionStore;
  totp: TotpService;
  live: LiveHub;
  locales: Locales;
  themes: Themes;
}

export async function buildServer(base: { env: Env; pool: pg.Pool; db: Db }) {
  const app = Fastify({
    logger: {
      level: base.env.LOG_LEVEL,
      redact: ["req.headers.cookie", 'res.headers["set-cookie"]'],
      ...prettyTransport(base.env.NODE_ENV),
    },
    trustProxy: true,
  });
  const deps: AppDeps = { ...base, sessions: new SessionStore(base.db, base.env), totp: new TotpService(base.db, base.env), live: new LiveHub(base.pool, app.log), locales: new Locales(app.log, process.env.LOCALES_DIR), themes: new Themes(app.log, process.env.THEMES_DIR) };
  await deps.live.start();
  app.addHook("onClose", () => deps.live.stop());

  await app.register(securityPlugin);
  await app.register(authPlugin, { sessions: deps.sessions, pool: deps.pool });
  await app.register(
    async (api) => {
      await api.register(systemRoutes(deps));
      await api.register(setupRoutes(deps));
      await api.register(authRoutes(deps));
      await api.register(settingsRoutes(deps));
      await api.register(enrollRoutes(deps));
      await api.register(inviteRoutes(deps));
      await api.register(tenantRoutes(deps));
      await api.register(userRoutes(deps));
      await api.register(auditRoutes(deps));
      await api.register(monitorRoutes(deps));
      await api.register(pushRoutes(deps));
      await api.register(assetRoutes(deps));
      await api.register(dependencyRoutes(deps));
      await api.register(applicationRoutes(deps));
      await api.register(maintenanceRoutes(deps));
      await api.register(incidentRoutes(deps));
      await api.register(channelRoutes(deps));
      await api.register(metricsRoutes(deps));
      await api.register(topologyRoutes(deps));
      await api.register(liveRoutes(deps));
      await api.register(reportRoutes(deps));
      await api.register(tokenRoutes(deps));
      await api.register(configRoutes(deps));
      await api.register(localeRoutes(deps));
      await api.register(themeRoutes(deps));
      await api.register(backupRoutes(deps));
      await api.register(statusPageRoutes(deps));
      await api.register(profileRoutes(deps));
      await api.register(teamRoutes(deps));
      await api.register(oncallRoutes(deps));
      await api.register(ackRoutes(deps));
      await api.register(retentionRoutes(deps));
      await api.register(kumaRoutes(deps));
      await api.register(temperatureRoutes(deps));
      await api.register(credentialRoutes(deps));
      await api.register(trapRoutes(deps));
      await api.register(discoveryRoutes(deps));
    },
    { prefix: "/api" },
  );
  return app;
}
