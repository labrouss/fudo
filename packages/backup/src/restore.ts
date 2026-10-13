/**
 * Restores a backup over the current data, in one transaction:
 * empty every application table (this also pauses the worker, whose queries wait for the lock),
 * load the backup, re-encrypt secrets with this server's keys, check foreign keys, move sequences
 * past the restored rows, and commit only after the file's authentication tag verified.
 */
import { createReadStream } from "node:fs";
import { finished } from "node:stream/promises";
import { once } from "node:events";
import { createGunzip } from "node:zlib";
import pgCopy from "pg-copy-streams";
import type pg from "pg";
import { columnsOf, continuousAggregates, currentSchema, EXCLUDED, q, selfForeignKeys, sequenceColumns, tablesInOrder } from "./catalog.js";
import { BackupError, dataDecipher, openBackup, type BackupHeader, type BackupManifest } from "./format.js";
import { END, lines } from "./lines.js";
import { sealRow } from "./secrets.js";

export async function inspectBackup(file: string, passphrase: string): Promise<{ header: BackupHeader; manifest: BackupManifest; size: number }> {
  const b = await openBackup(file);
  const { manifest } = await b.readManifest(passphrase);
  return { header: b.header, manifest, size: b.size };
}

export interface RestoreOptions {
  appSecret: string;
  file: string;
  passphrase: string;
  /** recorded in the audit log of the restored data */
  actor?: string;
  onProgress?: (p: { table: string; rows: number }) => void;
}

export async function restoreBackup(pool: pg.Pool, o: RestoreOptions): Promise<{ header: BackupHeader; counts: Record<string, number> }> {
  const b = await openBackup(o.file);
  const { key } = await b.readManifest(o.passphrase);
  const c = await pool.connect();
  const counts: Record<string, number> = {};
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout = '30s'");
    await c.query("SELECT set_config('fudo.all_tenants', 'on', true)");
    const here = await currentSchema(c);
    if (b.header.schema > here) throw new BackupError("newer_version", `This backup comes from a newer Fudo version (${b.header.fudoVersion}). Upgrade this server first.`);

    const tables = (await tablesInOrder(c)).filter((t) => !EXCLUDED.has(t));
    const targetCols = new Map<string, string[]>();
    for (const t of tables) targetCols.set(t, await columnsOf(c, t));
    // empty everything (and sign everyone out); TRUNCATE locks the tables until COMMIT
    await c.query(`TRUNCATE ${[...tables, "sessions"].map(q).join(", ")}`);
    const selfFks = new Map<string, Array<{ name: string; def: string }>>();
    for (const t of tables) {
      const fks = await selfForeignKeys(c, t);
      if (fks.length) { selfFks.set(t, fks); for (const f of fks) await c.query(`ALTER TABLE ${q(t)} DROP CONSTRAINT ${q(f.name)}`); }
    }

    const decipher = await dataDecipher(o.file, b, key);
    const src = createReadStream(o.file, { start: b.dataStart + 12, end: b.dataEnd - 17 });
    const gunzip = createGunzip();
    src.on("error", (e) => gunzip.destroy(e));
    decipher.on("error", () => gunzip.destroy(new BackupError("damaged", "The backup file is damaged or was changed.")));
    gunzip.on("error", () => {});
    src.pipe(decipher).pipe(gunzip);

    type Section = { t: string; cols: string[]; f: "copy" | "json" };
    let section: Section | null = null;
    let copy: ReturnType<typeof pgCopy.from> | null = null;
    let batch: string[] = [];
    let jsonRows: Record<string, unknown>[] = [];
    let skip = false;
    const flushCopy = async () => { if (copy && batch.length) { if (!copy.write(batch.join(""))) await once(copy, "drain"); batch = []; } };
    const flushJson = async () => {
      if (!section || !jsonRows.length) return;
      const cols = section.cols.filter((x) => targetCols.get(section!.t)!.includes(x));
      await c.query(`INSERT INTO ${q(section.t)} (${cols.map(q).join(", ")}) SELECT ${cols.map(q).join(", ")} FROM jsonb_populate_recordset(NULL::${q(section.t)}, $1::jsonb)`,
        [JSON.stringify(jsonRows.map((r) => sealRow(r, o.appSecret)))]);
      jsonRows = [];
    };

    for await (const line of lines(gunzip)) {
      if (!section) {
        let s: Section;
        try { s = JSON.parse(line.toString("utf8")); } catch { throw new BackupError("damaged", "The backup file is damaged."); }
        section = s; counts[s.t] = 0;
        const have = targetCols.get(s.t);
        skip = !have; // a table this version no longer has
        if (have) {
          const missing = s.cols.filter((x) => !have.includes(x));
          if (missing.length) throw new BackupError("unsupported", `This server cannot store ${s.t}.${missing.join(", ")} from the backup.`);
          if (s.f === "copy") copy = c.query(pgCopy.from(`COPY ${q(s.t)} (${s.cols.map(q).join(", ")}) FROM STDIN`));
        }
        o.onProgress?.({ table: s.t, rows: 0 });
        continue;
      }
      if (line.length === 2 && line.toString("utf8") === END) {
        if (copy) { await flushCopy(); copy.end(); await finished(copy); copy = null; }
        await flushJson();
        o.onProgress?.({ table: section.t, rows: counts[section.t]! });
        section = null;
        continue;
      }
      counts[section.t]!++;
      if (skip) continue;
      if (section.f === "copy") { batch.push(line.toString("utf8") + "\n"); if (batch.length >= 2000) await flushCopy(); }
      else { jsonRows.push(JSON.parse(line.toString("utf8"))); if (jsonRows.length >= 500) await flushJson(); }
    }
    if (section) throw new BackupError("damaged", "The backup file is incomplete.");
    await finished(decipher); // authentication tag verified here: nothing is committed before

    for (const [t, fks] of selfFks) for (const f of fks) await c.query(`ALTER TABLE ${q(t)} ADD CONSTRAINT ${q(f.name)} ${f.def}`);
    const bySeq = new Map<string, string[]>();
    for (const s of await sequenceColumns(c)) bySeq.set(s.seq, [...(bySeq.get(s.seq) ?? []), `SELECT max(${q(s.column)})::bigint AS m FROM ${q(s.table)}`]);
    for (const [seq, parts] of bySeq) {
      const m = (await c.query(`SELECT max(m) AS m FROM (${parts.join(" UNION ALL ")}) x`)).rows[0].m;
      await c.query(`SELECT setval($1, $2, $3)`, [seq, m ? Number(m) : 1, m != null]);
    }
    // deliveries waiting at backup time must not go out again
    if (tables.includes("notification_deliveries")) {
      await c.query(`UPDATE notification_deliveries SET status = 'suppressed', detail = 'Not sent: restored from a backup' WHERE status IN ('queued', 'sending')`);
    }
    await c.query(`INSERT INTO audit_log (action, diff) VALUES ('backup.restored', $1::jsonb)`,
      [JSON.stringify({ createdAt: b.header.createdAt, fudoVersion: b.header.fudoVersion, history: b.header.history, by: o.actor ?? null })]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  // summaries of check results follow the restored data (cannot run inside a transaction)
  const c2 = await pool.connect();
  try { for (const v of await continuousAggregates(c2)) await c2.query(`CALL refresh_continuous_aggregate($1, NULL, NULL)`, [v]).catch(() => {}); }
  finally { c2.release(); }
  return { header: b.header, counts };
}
