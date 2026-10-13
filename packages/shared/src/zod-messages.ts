import type { z } from "zod";

/** Default validation messages start like this; hand-written ones in the schemas are kept. */
const DEFAULT = /^(Invalid|Too (small|big)|Expected|Required$|Unrecognized)/;

/** A short, translatable message for a validation issue (keeps hand-written messages). */
export function issueMessage(issue: z.core.$ZodIssue): string {
  if (!DEFAULT.test(issue.message)) return issue.message;
  const i = issue as z.core.$ZodIssue & { input?: unknown; minimum?: number | bigint; maximum?: number | bigint; origin?: string; format?: string; expected?: string };
  switch (i.code) {
    case "invalid_type": return i.input === undefined || i.input === null ? "Required" : i.expected === "int" ? "Enter a whole number" : "Invalid value";
    case "too_small":
      if (i.origin === "string") return Number(i.minimum) <= 1 ? "Required" : `At least ${i.minimum} characters`;
      if (i.origin === "array" || i.origin === "set") return `Choose at least ${i.minimum}`;
      return `At least ${i.minimum}`;
    case "too_big":
      if (i.origin === "string") return `At most ${i.maximum} characters`;
      if (i.origin === "array" || i.origin === "set") return `At most ${i.maximum} items`;
      return `At most ${i.maximum}`;
    case "invalid_format": return i.format === "email" ? "Enter a valid email address" : i.format === "url" ? "Enter a valid URL" : "Invalid format";
    case "invalid_value": return "Choose one of the options";
    default: return "Invalid value";
  }
}
