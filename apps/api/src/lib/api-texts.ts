/**
 * API error texts that are not literal arguments in the code (the sync script finds those itself):
 * generic messages of the error handler and helpers, and short replacements for the validation
 * library's default messages. `pnpm i18n:sync` writes all of them to locales/en.json as api.* keys.
 */

export const API_TEXTS = [
  "Sign in to continue",
  "You do not have permission to do this",
  "Check the highlighted fields",
  "Not found",
  "Something went wrong on the server. Check the API logs.",
  "Too many requests. Wait a moment and try again.",
  // notSelf(actor, target, active ? "activate" : "deactivate"): not expandable by the scan
  "You cannot activate your own account here",
  "You cannot deactivate your own account here",
  // replacements for validation defaults
  "Required",
  "Invalid value",
  "Invalid format",
  "Enter a valid email address",
  "Enter a valid URL",
  "Choose one of the options",
  "At least {min} characters",
  "At most {max} characters",
  "At least {min}",
  "Keep forever (0) or {min} to {max} days",
  "At most {max}",
  "Choose at least {min}",
  "At most {max} items",
  "Enter a whole number",
] as const;

export { issueMessage } from "@fudo/shared";
