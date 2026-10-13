import type pg from "pg";
import type { FastifyBaseLogger } from "fastify";
import type { ServerResponse } from "node:http";

interface Client { res: ServerResponse; scopeId: string; globalRead: boolean; kinds: Set<string>; timer: NodeJS.Timeout | null }

/**
 * Live updates: one LISTEN connection on "fudo_live" fanned out to Server-Sent Events clients.
 * Events are coalesced per client (1 s) and carry only what changed ("monitor", "status",
 * "incident"); the browser then refetches what it shows, through the normal permission checks.
 */
export class LiveHub {
  private clients = new Set<Client>();
  private conn: pg.PoolClient | null = null;
  private ping: NodeJS.Timeout | null = null;

  constructor(private pool: pg.Pool, private log: FastifyBaseLogger) {}

  async start() {
    try {
      this.conn = await this.pool.connect();
      await this.conn.query("LISTEN fudo_live");
      this.conn.on("notification", (n) => this.dispatch(n.payload ?? "{}"));
      this.conn.on("error", (err) => { this.log.error({ err }, "live listener failed; reconnecting"); this.conn = null; setTimeout(() => void this.start(), 5000); });
    } catch (err) {
      this.log.error({ err }, "live listener could not start; retrying");
      setTimeout(() => void this.start(), 5000);
      return;
    }
    this.ping ??= setInterval(() => { for (const c of this.clients) c.res.write(": ping\n\n"); }, 25_000);
  }

  async stop() {
    if (this.ping) clearInterval(this.ping);
    for (const c of this.clients) c.res.end();
    this.clients.clear();
    this.conn?.release();
  }

  add(res: ServerResponse, scopeId: string, globalRead: boolean) {
    const c: Client = { res, scopeId, globalRead, kinds: new Set(), timer: null };
    this.clients.add(c);
    res.write(`event: ready\ndata: {}\n\n`);
    res.on("close", () => { if (c.timer) clearTimeout(c.timer); this.clients.delete(c); });
  }

  get size() { return this.clients.size; }

  private dispatch(payload: string) {
    let e: { t: string | null; k: string };
    try { e = JSON.parse(payload); } catch { return; }
    for (const c of this.clients) {
      const relevant = c.scopeId === "global" ? e.t === null || c.globalRead : e.t === c.scopeId || e.t === null;
      if (!relevant) continue;
      c.kinds.add(e.k);
      c.timer ??= setTimeout(() => {
        c.timer = null;
        c.res.write(`event: change\ndata: ${JSON.stringify({ kinds: [...c.kinds] })}\n\n`);
        c.kinds.clear();
      }, 1000);
    }
  }
}
