import { loadEnv } from "@fudo/shared";
import { createDb } from "./client.js";
import { runMigrations } from "./migrate.js";

const env = loadEnv();
const { pool } = createDb(env.DATABASE_URL);
const n = await runMigrations(pool);
console.log(n === 0 ? "database is up to date" : `applied ${n} migration(s)`);
await pool.end();
