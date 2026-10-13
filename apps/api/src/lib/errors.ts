import type { z } from "zod";
import { issueMessage } from "./api-texts.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const unauthorized = (message = "Sign in to continue") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You do not have permission to do this") => new HttpError(403, "forbidden", message);
export const conflict = (message: string) => new HttpError(409, "conflict", message);

/** Parses input with a Zod schema; on failure throws a 400 with per-field messages. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input ?? {});
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issueMessage(issue);
  }
  throw new HttpError(400, "validation_failed", "Check the highlighted fields", fields);
}
