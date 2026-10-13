/**
 * Creates a backup: one consistent snapshot (REPEATABLE READ) streamed through gzip and AES-GCM to
 * a file. Memory use stays flat for any size; the file appears under its final name only when done.
 */
import { createWriteStream } from "node:fs";
import { rename, rm, stat } from "node:fs/promises";
import { once } from "node:events";
import { createGzip } from "node:zlib";
import pgCopy from "pg-copy-streams";
import type pg from "pg";
import { columnsOf, currentSchema, EXCLUDED, HISTORY_TABLES, q, tablesInOrder } from "./catalog.js";
import { dataCipher, encodePreamble, newHeader, type BackupHeader, type BackupKind, type BackupManifest } from "./format.js";
import { END } from "./lines.js";
import { openRow, SECRET_TABLES } from "./secrets.js";

export interface CreateOptions {
  appSecret: string;
  passphrase: string;
  history: boolean;
  file: string;
  fudoVersion: string;
  kind: BackupKind;
  onProgress?: (p: { table: string; index: number; total: number }) => void;
}

export async function createBackup(pool: pg.Pool, o: CreateOptions): Promise<{ header: BackupHeader; manifest: BackupManifest; size: number }> {
  if (o.passphrase.length < 12) throw new Error("The passphrase must have at least 12 characters");
  const c = await pool.connect();
  const tmp = `${o.file}.partial`;
  let out: ReturnType<typeof createWriteStream> | null = null;
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await c.query("SELECT set_config('fudo.all_tenants', 'on', true)");
    const tables = (await tablesInOrder(c)).filter((t) => !EXCLUDED.has(t) && (o.history || !HISTORY_TABLES.has(t)));
    const counts: Record<string, number> = {};
    for (const t of tables) counts[t] = Number((await c.query(`SELECT count(*)::bigint AS n FROM ${q(t)}`)).rows[0].n);
    const org = (await c.query(`SELECT value FROM settings WHERE key = 'org.name'`)).rows[0]?.value;
    const manifest: BackupManifest = { organization: typeof org === "string" ? org : null, counts };
    const { header, key } = await newHeader({ fudoVersion: o.fudoVersion, schema: await currentSchema(c), history: o.history, kind: o.kind }, o.passphrase);

    out = createWriteStream(tmp, { mode: 0o600 });
    out.write(encodePreamble(header, manifest, key));
    const { iv, cipher } = dataCipher(key);
    out.write(iv);
    const gzip = createGzip({ level: 6 });
    gzip.pipe(cipher);
    cipher.pipe(out, { end: false });
    const write = async (b: Buffer | string) => { if (!gzip.write(b)) await once(gzip, "drain"); };

    for (const [index, t] of tables.entries()) {
      o.onProgress?.({ table: t, index, total: tables.length });
      const cols = await columnsOf(c, t);
      if (SECRET_TABLES.has(t)) {
        await write(JSON.stringify({ t, cols, f: "json" }) + "\n");
        const rows = (await c.query(`SELECT to_jsonb(x) AS r FROM ${q(t)} x`)).rows;
        for (const r of rows) await write(JSON.stringify(openRow(t, r.r, o.appSecret)) + "\n");
      } else {
        await write(JSON.stringify({ t, cols, f: "copy" }) + "\n");
        const copy = c.query(pgCopy.to(`COPY (SELECT ${cols.map(q).join(", ")} FROM ${q(t)}) TO STDOUT`));
        for await (const chunk of copy as AsyncIterable<Buffer>) await write(chunk);
      }
      await write(END + "\n");
    }
    await c.query("COMMIT");

    gzip.end();
    await once(cipher, "end");
    out.write(cipher.getAuthTag());
    out.end();
    await once(out, "finish");
    await rename(tmp, o.file);
    return { header, manifest, size: (await stat(o.file)).size };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    out?.destroy();
    await rm(tmp, { force: true });
    throw e;
  } finally {
    c.release();
  }
}
