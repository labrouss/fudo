/**
 * Room temperature: the inlet sensors tagged room:<name> together. Down when several are hot (each
 * by its own Degraded temperature): a cooling problem rather than one hot server. Degraded when one
 * is hot or several rise fast. Readings older than a few minutes are ignored, so an unreachable
 * BMC cannot hide a hot room; with no recent readings at all, the room is not reported as fine.
 */
import type { MsgPart } from "@fudo/shared";
import type { Peer } from "../context.js";
import { result, type Runner } from "./types.js";

export function roomVerdict(peers: Peer[], cfg: Record<string, unknown>) {
  const room = String(cfg.room ?? "").trim() || "—";
  const hotCount = Number(cfg.hotCount ?? 3), risingCount = Number(cfg.risingCount ?? 2), riseC = Number(cfg.riseC ?? 3), staleS = Number(cfg.staleMin ?? 10) * 60;
  if (!peers.length) return { status: "DOWN" as const, parts: [["temp.room.none", { room }]] as MsgPart[], data: undefined };
  const fresh = peers.filter((p) => p.celsius !== null && p.ageS !== null && p.ageS <= staleS);
  if (!fresh.length) return { status: "DEGRADED" as const, parts: [["temp.room.stale", { room, total: peers.length }]] as MsgPart[], data: undefined };
  const warmest = fresh.reduce((a, b) => (b.celsius! > a.celsius! ? b : a));
  const avg = Math.round((fresh.reduce((n, p) => n + p.celsius!, 0) / fresh.length) * 10) / 10;
  const hot = fresh.filter((p) => p.celsius! >= p.warnC);
  const rising = fresh.filter((p) => p.riseC !== null && p.riseC >= riseC);
  const where = { max: warmest.celsius!, where: warmest.name };
  const data = { avgC: avg, maxC: warmest.celsius!, hot: hot.length, rising: rising.length, sensors: fresh.length };
  const missing: MsgPart[] = fresh.length < peers.length ? [["temp.room.missing", { count: peers.length - fresh.length }]] : [];
  if (hot.length >= hotCount) return { status: "DOWN" as const, parts: [["temp.room.hot", { room, count: hot.length, total: fresh.length, ...where }], ...missing] as MsgPart[], data };
  if (hot.length > 0) return { status: "DEGRADED" as const, parts: [["temp.room.hot", { room, count: hot.length, total: fresh.length, ...where }], ...missing] as MsgPart[], data };
  if (risingCount > 0 && rising.length >= risingCount) return { status: "DEGRADED" as const, parts: [["temp.room.rising", { room, count: rising.length, total: fresh.length, ...where }], ...missing] as MsgPart[], data };
  return { status: "UP" as const, parts: [["temp.room.ok", { room, total: fresh.length, avg, ...where }], ...missing] as MsgPart[], data };
}

export const roomRunner: Runner = async (cfg, ctx) => {
  const v = roomVerdict(ctx.peers ?? [], cfg);
  return result(v.status, null, v.parts, v.data);
};
