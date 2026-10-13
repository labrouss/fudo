import { isMsgParts, type MsgPart } from "@fudo/shared";
/** Message parts from a jsonb column (null for rows written before 0.15, or anything malformed). */
export const partsOf = (v: unknown): MsgPart[] | null => (isMsgParts(v) ? v : null);
