/// <reference path="../../../packages/monitors/src/net-snmp.d.ts" />
/**
 * SNMP trap receiver (v1, v2c). Listens on UDP (TRAP_LISTEN_PORT, default 1162; docker-compose
 * publishes it as 162), finds the trap monitors whose sources include the sender, and records the
 * trap and what each monitor did with it (opened or cleared a problem). A monitor that changed is
 * checked at once, so its status, incidents and notifications follow within a second.
 * Traps no monitor claims are kept too, under the asset with that address or without a tenant.
 */
import dns from "node:dns/promises";
import type pg from "pg";
import type { Logger } from "pino";
import snmp from "net-snmp";
import { openConfig } from "@fudo/monitors/secrets";
import { applyCredential, openCredentialSecrets } from "@fudo/monitors/credentials";
import { clearedKeys, decide, ipMatches, isHostName, readTrap, sourceEntries, trapDetail, trapLabel, type Trap } from "@fudo/monitors/traps";

interface TrapMonitor { id: string; tenantId: string | null; assetId: string | null; cfg: Record<string, unknown>; entries: string[] }
interface Asset { id: string; tenantId: string | null; entries: string[] }
export interface ReceiverOptions { port: number; publishedPort: number; appSecret: string; ratePerSecond?: number; burst?: number }

const DNS_TTL_MS = 5 * 60_000, REFRESH_MS = 30_000, QUEUE_MAX = 5000;

export class TrapReceiver {
  private receiver: { close: (cb?: () => void) => void } | null = null;
  private monitors: TrapMonitor[] = [];
  private assets: Asset[] = [];
  private dnsCache = new Map<string, { ips: string[]; at: number }>();
  private buckets = new Map<string, { tokens: number; at: number }>();
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private timers: NodeJS.Timeout[] = [];
  private listener: pg.PoolClient | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private stats = { listening: false, error: null as string | null, startedAt: new Date().toISOString(), received: 0, stored: 0, dropped: 0, lastAt: null as string | null, droppedBySource: {} as Record<string, number> };

  constructor(private pool: pg.Pool, private log: Logger, private opts: ReceiverOptions) {}

  async start() {
    await this.refresh().catch((err) => this.log.error({ err }, "trap monitors"));
    try {
      this.receiver = snmp.createReceiver({ port: this.opts.port, disableAuthorization: true, includeAuthentication: true, transport: "udp4" }, (err: Error | null, data: { pdu: Record<string, unknown>; rinfo: { address: string } } | undefined) => {
        if (err) { this.log.debug({ err: err.message }, "trap not accepted"); return; }
        if (data) this.onTrap(data.pdu, data.rinfo);
      });
      // the socket reports a failed bind asynchronously
      const sockets = (this.receiver as unknown as { listener?: { sockets?: Record<string, { on: (e: string, f: (err: Error) => void) => void }> } }).listener?.sockets;
      for (const s of Object.values(sockets ?? {})) s.on("error", (err: Error) => this.failed(err));
      this.stats.listening = true;
      this.log.info({ port: this.opts.port }, "SNMP trap receiver listening");
    } catch (err) { this.failed(err as Error); }
    this.timers.push(setInterval(() => void this.refresh().catch((err) => this.log.error({ err }, "trap monitors")), REFRESH_MS));
    // monitors and assets changed (the API notifies): reload them in a moment
    this.listener = await this.pool.connect();
    await this.listener.query("LISTEN fudo_graph");
    this.listener.on("notification", () => {
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => void this.refresh().catch((err) => this.log.error({ err }, "trap monitors")), 300);
    });
    this.timers.push(setInterval(() => void this.writeStats(), REFRESH_MS));
    this.timers.push(setInterval(() => void this.expire(), 5 * 60_000));
    await this.writeStats();
  }

  private failed(err: Error) {
    this.stats.listening = false;
    this.stats.error = (err as { code?: string }).code === "EADDRINUSE" ? `UDP port ${this.opts.port} is in use (another worker receives traps)` : err.message;
    this.log.warn({ err: err.message, port: this.opts.port }, "SNMP trap receiver not listening");
    void this.writeStats();
  }

  async stop() {
    for (const t of this.timers) clearInterval(t);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.listener) { await this.listener.query("UNLISTEN *").catch(() => {}); this.listener.release(); this.listener = null; }
    try { this.receiver?.close(); } catch { /* closed */ }
    await this.queue.catch(() => {});
  }

  /** Monitors (configs opened, shared credentials applied) and assets with an address. */
  async refresh() {
    const c = await this.pool.connect();
    try {
      const rows = (await c.query(`SELECT m.id, m.tenant_id, m.asset_id, m.type, m.config, cr.kind, cr.fields, cr.secrets_enc, cr.tenant_id AS cred_tenant
                                     FROM monitors m LEFT JOIN credentials cr ON cr.id = m.credential_id
                                    WHERE m.type = 'snmp-trap' AND NOT m.paused`)).rows;
      const monitors: TrapMonitor[] = [];
      for (const r of rows) {
        try {
          let cfg = openConfig("snmp-trap", r.config, this.opts.appSecret);
          if (r.kind && (r.cred_tenant ?? null) === (r.tenant_id ?? null)) cfg = applyCredential("snmp-trap", cfg, { kind: r.kind, fields: r.fields ?? {}, secrets: openCredentialSecrets(r.secrets_enc, this.opts.appSecret) });
          monitors.push({ id: r.id, tenantId: r.tenant_id ?? null, assetId: r.asset_id ?? null, cfg, entries: sourceEntries(cfg.source) });
        } catch (err) { this.log.error({ err, monitor: r.id }, "cannot read a trap monitor's settings (was APP_SECRET changed?)"); }
      }
      const assets = (await c.query(`SELECT id, tenant_id, address FROM assets WHERE address <> ''`)).rows
        .map((a) => ({ id: a.id as string, tenantId: (a.tenant_id as string) ?? null, entries: sourceEntries(a.address).slice(0, 4) }));
      this.monitors = monitors;
      this.assets = assets;
    } finally { c.release(); }
    // host names: resolved now and then, never while a trap waits
    const names = [...new Set([...this.monitors.flatMap((m) => m.entries), ...this.assets.flatMap((a) => a.entries)].filter(isHostName))];
    const stale = names.filter((n) => (this.dnsCache.get(n)?.at ?? 0) < Date.now() - DNS_TTL_MS).slice(0, 500);
    for (let i = 0; i < stale.length; i += 20) {
      await Promise.all(stale.slice(i, i + 20).map(async (n) => {
        const ips = await dns.lookup(n, { all: true }).then((l) => l.map((x) => x.address)).catch(() => [] as string[]);
        this.dnsCache.set(n, { ips, at: Date.now() });
      }));
    }
  }

  private matches(entries: string[], ip: string) {
    return entries.some((e) => isHostName(e) ? (this.dnsCache.get(e)?.ips ?? []).some((x) => ipMatches(ip, x)) : ipMatches(ip, e));
  }

  /** Rate limit per sender: a storm from one device cannot flood the database. */
  private allowed(ip: string): boolean {
    const rate = this.opts.ratePerSecond ?? 50, burst = this.opts.burst ?? 500, now = Date.now();
    const b = this.buckets.get(ip) ?? { tokens: burst, at: now };
    b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * rate);
    b.at = now;
    this.buckets.set(ip, b);
    if (this.buckets.size > 10_000) this.buckets.clear();
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  onTrap(pdu: Record<string, unknown>, rinfo: { address: string }) {
    this.stats.received++;
    this.stats.lastAt = new Date().toISOString();
    const sender = String(rinfo.address ?? "").replace(/^::ffff:/, "");
    if (!this.allowed(sender) || this.pending >= QUEUE_MAX) {
      this.stats.dropped++;
      this.stats.droppedBySource[sender] = (this.stats.droppedBySource[sender] ?? 0) + 1;
      return;
    }
    let trap: Trap;
    try { trap = readTrap(pdu, rinfo); } catch (err) { this.log.debug({ err }, "unreadable trap"); return; }
    this.pending++;
    // one at a time: problems of a monitor are updated in arrival order
    this.queue = this.queue.then(() => this.process(trap)).catch((err) => this.log.error({ err }, "trap not recorded")).finally(() => { this.pending--; });
  }

  async process(t: Trap) {
    const matched = this.monitors.filter((m) => this.matches(m.entries, t.source) && (!String(m.cfg.community ?? "") || m.cfg.community === t.community));
    const asset = this.assets.find((a) => this.matches(a.entries, t.source)) ?? null;
    const label = trapLabel(t), detail = trapDetail(t);
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const insert = (tenantId: string | null, monitorId: string | null, assetId: string | null, action: string | null) =>
        c.query(`INSERT INTO snmp_traps (tenant_id, monitor_id, asset_id, source, version, trap_oid, trap_name, fields, action) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [tenantId, monitorId, assetId, t.source, t.version, t.oid, t.name, JSON.stringify(t.fields), action]);
      if (!matched.length) {
        await insert(asset?.tenantId ?? null, null, asset?.id ?? null, null);
      }
      const changed: string[] = [];
      for (const m of matched) {
        const d = decide(m.cfg, t);
        await insert(m.tenantId, m.id, m.assetId ?? (asset && asset.tenantId === m.tenantId ? asset.id : null), d?.kind ?? "ignored");
        if (d?.kind === "problem") {
          const auto = m.cfg.clearMode !== "manual", minutes = Math.max(1, Number(m.cfg.clearAfterMin ?? 30));
          // a problem that had already cleared by itself starts again
          await c.query(`INSERT INTO snmp_trap_problems (monitor_id, key, tenant_id, label, source, detail) VALUES ($1, $2, $3, $4, $5, $6)
                         ON CONFLICT (monitor_id, key) DO UPDATE SET
                           first_at = CASE WHEN $7 AND snmp_trap_problems.last_at < now() - make_interval(mins => $8) THEN now() ELSE snmp_trap_problems.first_at END,
                           count = CASE WHEN $7 AND snmp_trap_problems.last_at < now() - make_interval(mins => $8) THEN 1 ELSE snmp_trap_problems.count + 1 END,
                           last_at = now(), source = EXCLUDED.source, detail = EXCLUDED.detail, label = EXCLUDED.label`,
            [m.id, d.key, m.tenantId, label, t.source, detail, auto, minutes]);
          changed.push(m.id);
        } else if (d?.kind === "clear") {
          const open = (await c.query(`SELECT key FROM snmp_trap_problems WHERE monitor_id = $1`, [m.id])).rows.map((r) => r.key as string);
          const gone = clearedKeys(d, open);
          if (gone.length) { await c.query(`DELETE FROM snmp_trap_problems WHERE monitor_id = $1 AND key = ANY($2::text[])`, [m.id, gone]); changed.push(m.id); }
        }
      }
      // a check now: status, incidents and notifications follow at once
      if (changed.length) await c.query(`UPDATE monitors SET next_run_at = now() WHERE id = ANY($1::uuid[])`, [changed]);
      await c.query("COMMIT");
      this.stats.stored += Math.max(1, matched.length);
    } catch (err) { await c.query("ROLLBACK").catch(() => {}); throw err; } finally { c.release(); }
  }

  /** Problems that cleared by themselves (no new trap for a while) are removed. */
  private async expire() {
    await this.pool.query(`DELETE FROM snmp_trap_problems p USING monitors m
                            WHERE m.id = p.monitor_id AND coalesce(m.config->>'clearMode', 'auto') = 'auto'
                              AND p.last_at < now() - make_interval(mins => greatest(1, coalesce((m.config->>'clearAfterMin')::int, 30)))`).catch((err) => this.log.warn({ err }, "trap problem expiry"));
  }

  /** What the Traps page shows about the receiver. */
  private async writeStats() {
    const top = Object.entries(this.stats.droppedBySource).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const value = { ...this.stats, droppedBySource: Object.fromEntries(top), port: this.opts.port, publishedPort: this.opts.publishedPort, monitors: this.monitors.length, updatedAt: new Date().toISOString() };
    await this.pool.query(`INSERT INTO settings (key, value) VALUES ('traps.receiver', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify(value)])
      .catch((err) => this.log.warn({ err }, "trap receiver status"));
  }
}
