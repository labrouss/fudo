import { englishMessage, type MsgPart } from "@fudo/shared";
import type { ResultStatus } from "../definitions.js";

export interface CheckResult {
  status: ResultStatus;
  latencyMs: number | null;
  /** English text (logs, API clients); `parts` is what the interface translates */
  message: string;
  parts?: MsgPart[];
  /** extra numeric values worth charting later, e.g. { certDaysLeft: 212, lossPct: 0 } */
  data?: Record<string, number | string>;
}

export interface TrapProblem { key: string; label: string; source: string; detail: string; firstAt: Date; lastAt: Date; count: number }
export interface RunContext {
  timeoutMs: number;
  /** push monitors: last time the URL was called */
  lastPushAt?: Date | null;
  intervalS: number;
  /** inlet temperature: this monitor's recent readings (rate of rise) */
  recent?: Array<{ ts: Date; value: number }>;
  /** counter-based checks (SNMP interface, SNMP rate): the data of this monitor's last result that kept a reading */
  previous?: Record<string, unknown> | null;
  /** SNMP trap monitors: open problems (expired ones left out) and the last trap received */
  traps?: { problems: TrapProblem[]; last: { label: string; source: string; at: Date } | null };
  /** room temperature: the latest readings of the room's inlet sensors */
  peers?: import("../context.js").Peer[];
}

/** A runner returns null when there is nothing to record (push monitor that is on time). */
export type Runner = (cfg: Record<string, unknown>, ctx: RunContext) => Promise<CheckResult | null>;

export const elapsed = (start: bigint) => Math.round(Number(process.hrtime.bigint() - start) / 1e6);

/** A check result from message parts (see @fudo/shared messages.ts); the English text is derived. */
export function result(status: ResultStatus, latencyMs: number | null, parts: MsgPart[], data?: CheckResult["data"]): CheckResult {
  return { status, latencyMs, message: englishMessage(parts), parts, ...(data ? { data } : {}) };
}
export const down = (parts: MsgPart[], latencyMs: number | null = null, data?: CheckResult["data"]) => result("DOWN", latencyMs, parts, data);

const ERROR_CODES: Record<string, string> = {
  ECONNREFUSED: "net.refused", ENOTFOUND: "net.notFound", EAI_AGAIN: "net.dnsTemp", EHOSTUNREACH: "net.hostUnreach",
  ENETUNREACH: "net.netUnreach", ECONNRESET: "net.reset", CERT_HAS_EXPIRED: "tls.certExpired",
  DEPTH_ZERO_SELF_SIGNED_CERT: "tls.selfSigned", SELF_SIGNED_CERT_IN_CHAIN: "tls.selfSigned",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "tls.chain", UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "tls.chain", ERR_TLS_CERT_ALTNAME_INVALID: "tls.hostMismatch",
};
/** Network and TLS errors as a message part; unknown errors keep the system's own text. */
export function errorPart(err: unknown, timeoutMs: number): MsgPart {
  const e = err as { code?: string; name?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = e.code ?? e.cause?.code;
  if (e.name === "TimeoutError" || e.name === "AbortError" || code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") return ["net.timeout", { s: timeoutMs / 1000 }];
  if (code && ERROR_CODES[code]) return [ERROR_CODES[code]!];
  return e.cause?.message ?? e.message ?? String(err);
}
/** English text of a network error (for callers that build their own messages). */
export const describeError = (err: unknown, timeoutMs: number): string => englishMessage([errorPart(err, timeoutMs)]);

export const withDegraded = (latencyMs: number, limit: unknown): boolean => typeof limit === "number" && latencyMs > limit;
