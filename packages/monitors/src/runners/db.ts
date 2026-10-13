import mysql from "mysql2/promise";
import pg from "pg";
import mssql from "mssql";
import { createClient } from "redis";
import { MongoClient } from "mongodb";
import type { MsgPart } from "@fudo/shared";
import { down, elapsed, errorPart, result, withDegraded, type CheckResult, type Runner } from "./types.js";

type Cfg = Record<string, any>;

/** First scalar of a result, as text. */
export function firstValue(v: unknown): string {
  if (Array.isArray(v)) return v.length ? firstValue(v[0]) : "";
  if (v && typeof v === "object" && !(v instanceof Date) && !Buffer.isBuffer(v)) { const vals = Object.values(v); return vals.length ? firstValue(vals[0]) : ""; }
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return v.toString("utf8");
  return v === null || v === undefined ? "" : String(v);
}

function verdict(cfg: Cfg, start: bigint, value: string, what: MsgPart): CheckResult {
  const ms = elapsed(start);
  const exp = String(cfg.expected ?? "");
  if (exp) {
    const ok = cfg.matchMode === "contains" ? value.includes(exp) : value.trim() === exp.trim();
    if (!ok) return down([[cfg.matchMode === "contains" ? "db.notContains" : "db.notEquals", { result: value.slice(0, 120), expected: exp }]], ms);
  }
  return result(withDegraded(ms, cfg.degradedLatencyMs) ? "DEGRADED" : "UP", ms, [what, ["latency", { ms }], ...(value ? [["db.result", { result: value.slice(0, 80) }] as MsgPart] : [])]);
}
const fail = (err: unknown, timeoutMs: number): CheckResult => {
  // drivers wrap socket errors differently (tedious: originalError, mongodb: cause/message)
  const e = err as { code?: string; message?: string; originalError?: { errors?: unknown[]; code?: string; message?: string } };
  const inner = (e.originalError?.errors?.[0] ?? e.originalError ?? err) as { message?: string; code?: string };
  const msg = String(inner.message ?? e.message ?? err);
  const clip = (t: string) => (t.length > 140 ? `${t.slice(0, 140)}…` : t);
  if (/access denied|authentication|password|login failed|NOAUTH|WRONGPASS|auth failed/i.test(msg)) return down([["auth.failed"], clip(msg.split(/[.,]\s/)[0]!)]);
  if (/ECONNREFUSED|Could not connect \(sequence\)/.test(msg)) return down([["net.refused"]]);
  if (/ENOTFOUND|getaddrinfo/.test(msg)) return down([["net.notFound"]]);
  { const part = errorPart(inner.code ? inner : err, timeoutMs); return down([typeof part === "string" ? clip(part) : part]); }
};

export const mysqlRunner: Runner = async (cfg, ctx) => {
  const start = process.hrtime.bigint();
  let conn: mysql.Connection | undefined;
  try {
    conn = await mysql.createConnection({ host: cfg.host as string, port: cfg.port as number, user: cfg.username as string, password: cfg.password as string, database: (cfg.database as string) || undefined,
      connectTimeout: ctx.timeoutMs, ssl: cfg.tls ? { rejectUnauthorized: !cfg.ignoreTls } : undefined });
    const q = String(cfg.query || "");
    const [rows] = q ? await conn.query({ sql: q, timeout: ctx.timeoutMs }) : [[]];
    if (!q) await conn.ping();
    return verdict(cfg, start, q ? firstValue(rows) : "", ["db.connectedTo", { server: (conn as unknown as { serverVersion?: string }).serverVersion ?? "MySQL" }]);
  } catch (err) { return fail(err, ctx.timeoutMs); } finally { await conn?.end().catch(() => {}); }
};

export const postgresRunner: Runner = async (cfg, ctx) => {
  const start = process.hrtime.bigint();
  const c = new pg.Client({ host: cfg.host as string, port: cfg.port as number, user: cfg.username as string, password: cfg.password as string, database: (cfg.database as string) || "postgres",
    connectionTimeoutMillis: ctx.timeoutMs, statement_timeout: ctx.timeoutMs, ssl: cfg.tls ? { rejectUnauthorized: !cfg.ignoreTls } : undefined, application_name: "fudo-monitor" });
  try {
    await c.connect();
    const r = await c.query(String(cfg.query || "SELECT 1"));
    return verdict(cfg, start, cfg.query ? firstValue(r.rows) : "", ["db.connected"]);
  } catch (err) { return fail(err, ctx.timeoutMs); } finally { await c.end().catch(() => {}); }
};

export const sqlserverRunner: Runner = async (cfg, ctx) => {
  const start = process.hrtime.bigint();
  const pool = new mssql.ConnectionPool({
    server: cfg.host as string, port: cfg.instanceName ? undefined : (cfg.port as number), user: cfg.username as string, password: cfg.password as string, database: (cfg.database as string) || undefined,
    connectionTimeout: ctx.timeoutMs, requestTimeout: ctx.timeoutMs, pool: { max: 1, min: 0 },
    options: { encrypt: Boolean(cfg.tls), trustServerCertificate: Boolean(cfg.ignoreTls), instanceName: (cfg.instanceName as string) || undefined, appName: "fudo-monitor" },
  });
  try {
    await pool.connect();
    const r = await pool.request().query(String(cfg.query || "SELECT 1 AS ok"));
    return verdict(cfg, start, cfg.query ? firstValue(r.recordset) : "", ["db.connected"]);
  } catch (err) { return fail(err, ctx.timeoutMs); } finally { await pool.close().catch(() => {}); }
};

/** Splits a Redis command line, honouring quotes: SET "a b" 1 -> ["SET", "a b", "1"] */
export const splitCommand = (s: string) => [...s.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]!);

export const redisRunner: Runner = async (cfg, ctx) => {
  const start = process.hrtime.bigint();
  const client = createClient({
    socket: { host: cfg.host as string, port: cfg.port as number, connectTimeout: ctx.timeoutMs, reconnectStrategy: false, ...(cfg.tls ? { tls: true, rejectUnauthorized: !cfg.ignoreTls } : {}) } as never,
    username: (cfg.username as string) || undefined, password: (cfg.password as string) || undefined, database: Number(cfg.dbIndex ?? 0),
  });
  client.on("error", () => { /* reported through the awaited calls */ });
  try {
    await client.connect();
    const cmd = cfg.query ? splitCommand(String(cfg.query)) : ["PING"];
    const r = await client.sendCommand(cmd);
    const out = firstValue(r);
    if (!cfg.query && !cfg.expected && out !== "PONG") return down([["db.pingReply", { reply: out }]]);
    return verdict(cfg, start, out, ["db.commandOk", { command: cmd[0]!.toUpperCase() }]);
  } catch (err) { return fail(err, ctx.timeoutMs); } finally { await client.close?.().catch?.(() => {}); try { client.destroy?.(); } catch { /* closed */ } }
};

export const mongodbRunner: Runner = async (cfg, ctx) => {
  const start = process.hrtime.bigint();
  const client = new MongoClient(`mongodb://${String(cfg.host).includes(":") ? `[${cfg.host}]` : cfg.host}:${cfg.port}/`, {
    auth: cfg.username ? { username: cfg.username as string, password: cfg.password as string } : undefined, authSource: (cfg.authSource as string) || "admin",
    tls: Boolean(cfg.tls), tlsAllowInvalidCertificates: Boolean(cfg.ignoreTls), serverSelectionTimeoutMS: ctx.timeoutMs, connectTimeoutMS: ctx.timeoutMs, directConnection: true, appName: "fudo-monitor",
  });
  try {
    await client.connect();
    let command: Record<string, unknown> = { ping: 1 };
    if (cfg.query) { try { command = JSON.parse(String(cfg.query)); } catch { return down([["db.badJson"]]); } }
    const r = await client.db((cfg.database as string) || "admin").command(command);
    return verdict(cfg, start, cfg.query ? JSON.stringify(r).slice(0, 2000) : "", ["db.connected"]);
  } catch (err) { return fail(err, ctx.timeoutMs); } finally { await client.close().catch(() => {}); }
};
