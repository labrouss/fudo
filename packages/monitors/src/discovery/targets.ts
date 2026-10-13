/**
 * Scan targets: IPv4 networks (10.0.12.0/24), ranges (10.0.12.10-10.0.12.50 or 10.0.12.10-50),
 * single addresses and host names, separated by commas, spaces or new lines.
 */
export const MAX_TARGETS = 4096;

const toInt = (ip: string): number | null => {
  const p = ip.split(".");
  if (p.length !== 4 || !p.every((x) => /^\d{1,3}$/.test(x) && Number(x) <= 255)) return null;
  return p.reduce((a, x) => a * 256 + Number(x), 0);
};
const toIp = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");

export type TargetsResult = { ok: true; targets: string[] } | { ok: false; error: "invalid"; entry: string } | { ok: false; error: "tooMany"; count: number };

export function parseTargets(text: string, max = MAX_TARGETS): TargetsResult {
  const out = new Set<string>();
  let count = 0;
  for (const raw of text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const cidr = /^([\d.]+)\/(\d{1,2})$/.exec(raw);
    const range = /^([\d.]+)-([\d.]+)$/.exec(raw);
    let from: number | null = null, to: number | null = null;
    if (cidr) {
      const base = toInt(cidr[1]!), bits = Number(cidr[2]);
      if (base === null || bits < 8 || bits > 32) return { ok: false, error: "invalid", entry: raw };
      const size = 2 ** (32 - bits), net = Math.floor(base / size) * size;
      // network and broadcast addresses are not hosts (except /31 and /32)
      [from, to] = bits >= 31 ? [net, net + size - 1] : [net + 1, net + size - 2];
    } else if (range) {
      from = toInt(range[1]!);
      const end = /^\d{1,3}$/.test(range[2]!) && from !== null ? Math.floor(from / 256) * 256 + Number(range[2]) : toInt(range[2]!);
      to = end;
      if (from === null || to === null || to < from) return { ok: false, error: "invalid", entry: raw };
    } else if (toInt(raw) !== null) {
      from = to = toInt(raw);
    } else if (/^(?=.*[a-z])(?!-)[a-z0-9.-]{1,253}$/i.test(raw)) {
      out.add(raw.toLowerCase()); count++;
      continue;
    } else return { ok: false, error: "invalid", entry: raw };
    count += to! - from! + 1;
    if (count > max) return { ok: false, error: "tooMany", count };
    for (let n = from!; n <= to!; n++) out.add(toIp(n));
  }
  return { ok: true, targets: [...out] };
}
