import { loadEnv } from "@fudo/shared";
import { openDatabase } from "@fudo/db";
import { buildServer } from "./server.js";

const env = loadEnv();
const bootLog: string[] = [];
const { pool, db } = await openDatabase(env.DATABASE_URL, { log: (m) => bootLog.push(m) });
const app = await buildServer({ env, pool, db });
for (const m of bootLog) app.log.info(m);

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: "0.0.0.0", port: env.API_PORT });
