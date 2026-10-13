import type { MonitorStatus, ResultStatus } from "./definitions.js";

export interface MonitorState {
  status: MonitorStatus;
  failStreak: number;
  successStreak: number;
}

export interface NextState extends MonitorState {
  changed: boolean;
  /** a failure was seen but the Down threshold is not reached yet */
  retrying: boolean;
}

/**
 * Flap protection. `failuresBeforeDown` consecutive failures turn a monitor Down;
 * `successesBeforeUp` consecutive successes bring it back. Degraded counts as success
 * for this purpose (the service answers, just badly) and applies immediately.
 */
export function nextState(prev: MonitorState, result: ResultStatus, cfg: { failuresBeforeDown: number; successesBeforeUp: number }): NextState {
  if (result === "DOWN") {
    const failStreak = prev.failStreak + 1;
    const status: MonitorStatus = failStreak >= cfg.failuresBeforeDown ? "DOWN" : prev.status;
    return { status, failStreak, successStreak: 0, changed: status !== prev.status, retrying: status !== "DOWN" };
  }
  const successStreak = prev.successStreak + 1;
  const status: MonitorStatus = prev.status === "DOWN" && successStreak < cfg.successesBeforeUp ? "DOWN" : result;
  return { status, failStreak: 0, successStreak, changed: status !== prev.status, retrying: false };
}
