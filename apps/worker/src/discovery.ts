/**
 * Discovery runs (queued by the API, Global infrastructure scope): the worker scans the source and
 * keeps what it finds in discovery_results for review. One run at a time; progress is written
 * every second; a run asked to stop ("cancelling") stops between hosts.
 */
import type pg from "pg";
import type { Logger } from "pino";
import { openCredentialSecrets } from "@fudo/monitors/credentials";
import { SOURCES, mergeFound, type Source, type SourceContext } from "@fudo/monitors/discovery/sources";

interface Run { id: string; source: string; params: Record<string, unknown> }

export class DiscoveryRunner {
  private listener: pg.PoolClient | null = null;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private stopped = false;
  sources: Record<string, Source> = SOURCES;

  constructor(private pool: pg.Pool, private log: Logger, private appSecret: string) {}

  async start() {
    // a run the worker was in the middle of when it stopped cannot continue
    await this.pool.query(`UPDATE discovery_runs SET status = 'failed', error = 'Interrupted: the worker restarted', finished_at = now() WHERE status IN ('running', 'cancelling')`);
    this.listener = await this.pool.connect();
    await this.listener.query("LISTEN fudo_discovery");
    this.listener.on("notification", () => void this.next());
    this.timer = setInterval(() => void this.next(), 10_000);
    void this.next();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.listener) { await this.listener.query("UNLISTEN *").catch(() => {}); this.listener.release(); this.listener = null; }
  }

  private async next() {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      for (;;) {
        const run = (await this.pool.query<Run>(`UPDATE discovery_runs SET status = 'running', started_at = now()
            WHERE id = (SELECT id FROM discovery_runs WHERE status = 'queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id, source, params`)).rows[0];
        if (!run) break;
        await this.execute(run);
      }
    } catch (err) { this.log.error({ err }, "discovery"); } finally { this.busy = false; }
  }

  private async execute(run: Run) {
    const source = this.sources[run.source];
    let done = 0, total = 0, found = 0, cancelled = false, last = 0;
    const flush = async () => {
      const r = await this.pool.query(`UPDATE discovery_runs SET done = $2, total = $3, found = $4 WHERE id = $1 RETURNING status`, [run.id, done, total, found]);
      if (r.rows[0]?.status === "cancelling") cancelled = true;
    };
    const ctx: SourceContext = {
      log: this.log,
      cancelled: () => cancelled,
      progress: (d, t) => { done = d; total = t; if (Date.now() - last > 1000) { last = Date.now(); void flush().catch(() => {}); } },
      credential: async (id) => {
        const row = (await this.pool.query(`SELECT kind, fields, secrets_enc FROM credentials WHERE id = $1::uuid AND tenant_id IS NULL`, [id])).rows[0];
        return row ? { kind: row.kind, fields: row.fields ?? {}, secrets: openCredentialSecrets(row.secrets_enc, this.appSecret) } : null;
      },
      found: async (f, opts) => {
        if (opts?.merge) {
          const old = (await this.pool.query(`SELECT key, address, name, category, vendor, model, os, template, asset_kind, parent_key, depends_on, details FROM discovery_results WHERE run_id = $1 AND key = $2`, [run.id, f.key])).rows[0];
          if (old) {
            f = mergeFound({ key: old.key, address: old.address, name: old.name, category: old.category, vendor: old.vendor, model: old.model, os: old.os, template: old.template, assetKind: old.asset_kind, parentKey: old.parent_key, dependsOn: old.depends_on, details: old.details }, f);
            found--;
          }
        }
        await this.pool.query(`INSERT INTO discovery_results (run_id, key, address, name, category, vendor, model, os, template, asset_kind, parent_key, depends_on, details)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (run_id, key) DO UPDATE SET address = EXCLUDED.address, name = EXCLUDED.name, category = EXCLUDED.category, vendor = EXCLUDED.vendor, model = EXCLUDED.model,
              os = EXCLUDED.os, template = EXCLUDED.template, asset_kind = EXCLUDED.asset_kind, parent_key = EXCLUDED.parent_key, depends_on = EXCLUDED.depends_on, details = EXCLUDED.details`,
          [run.id, f.key, f.address, f.name.slice(0, 200), f.category, f.vendor.slice(0, 200), f.model.slice(0, 300), f.os.slice(0, 200), f.template, f.assetKind, f.parentKey ?? null, f.dependsOn ?? [], JSON.stringify(f.details)]);
        found++;
      },
    };
    try {
      if (!source) throw new Error(`Unknown discovery source "${run.source}"`);
      this.log.info({ run: run.id, source: run.source }, "discovery started");
      await source(run.params, ctx);
      await flush();
      await this.pool.query(`UPDATE discovery_runs SET status = $2, done = $3, total = $4, found = $5, finished_at = now() WHERE id = $1`, [run.id, cancelled ? "cancelled" : "done", done, total, found]);
      this.log.info({ run: run.id, found, cancelled }, "discovery finished");
    } catch (err) {
      await this.pool.query(`UPDATE discovery_runs SET status = 'failed', error = $2, done = $3, total = $4, found = $5, finished_at = now() WHERE id = $1`, [run.id, (err as Error).message.slice(0, 500), done, total, found]);
      this.log.warn({ run: run.id, err: (err as Error).message }, "discovery failed");
    }
  }
}
