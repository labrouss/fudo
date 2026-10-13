import { Fragment, type ReactNode } from "react";
import { t } from "../i18n";

/**
 * A translated sentence with elements inside, so word order stays with the translator:
 *   <T k="assets.banner.impacted" values={{ what: name, cause: <Link …>{cause.name}</Link> }} />
 * with "{what} is failing because {cause} is down."
 */
export function T({ k, values = {} }: { k: string; values?: Record<string, ReactNode> }) {
  const nodes: ReactNode[] = [];
  const plain: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(values)) plain[key] = typeof v === "string" || typeof v === "number" ? v : `\u0000${nodes.push(v) - 1}\u0000`;
  return <>{t(k, plain).split(/\u0000(\d+)\u0000/).map((part, i) => (i % 2 ? <Fragment key={i}>{nodes[Number(part)]}</Fragment> : part))}</>;
}
