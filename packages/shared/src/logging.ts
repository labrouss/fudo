import { createRequire } from "node:module";

/**
 * Pretty console logs in development when pino-pretty is installed; plain JSON otherwise
 * (production images do not ship dev dependencies).
 */
export function prettyTransport(nodeEnv: string): { transport: { target: string } } | Record<string, never> {
  if (nodeEnv !== "development") return {};
  try {
    createRequire(import.meta.url).resolve("pino-pretty");
    return { transport: { target: "pino-pretty" } };
  } catch {
    return {};
  }
}
