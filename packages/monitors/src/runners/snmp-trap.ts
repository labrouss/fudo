import type { MsgPart } from "@fudo/shared";
import { result, type Runner } from "./types.js";

/**
 * SNMP trap monitor: passive. Its status comes from the problems traps opened (the worker's trap
 * receiver records them and asks for a check at once); this check also lets auto-cleared ones go.
 */
export const snmpTrapRunner: Runner = async (cfg, ctx) => {
  const open = [...(ctx.traps?.problems ?? [])].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  const last = ctx.traps?.last ?? null;
  if (!open.length) return result("UP", null, [last ? ["trap.okLast", { trap: last.label, source: last.source }] : ["trap.none"]], { openTraps: 0 });
  const p = open[0]!;
  const parts: MsgPart[] = [p.detail ? ["trap.open", { trap: p.label, source: p.source, detail: p.detail }] : ["trap.openFrom", { trap: p.label, source: p.source }]];
  if (p.count > 1) parts.push(["trap.repeated", { count: p.count }]);
  if (open.length > 1) parts.push(["trap.more", { count: open.length - 1 }]);
  return result(cfg.effect === "DEGRADED" ? "DEGRADED" : "DOWN", null, parts, { openTraps: open.length });
};
