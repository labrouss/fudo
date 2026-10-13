import { down, type Runner } from "./types.js";

/** Scheduled check for push monitors: Down when no call arrived within interval + grace. */
export const pushRunner: Runner = async (cfg, ctx) => {
  const allowedMs = (ctx.intervalS + Number(cfg.graceS ?? 30)) * 1000;
  const last = ctx.lastPushAt?.getTime() ?? null;
  if (last !== null && Date.now() - last <= allowedMs) return null;
  return down([last === null ? ["push.never"] : ["push.late", { s: Math.round((Date.now() - last) / 1000), allowed: allowedMs / 1000 }]]);
};
