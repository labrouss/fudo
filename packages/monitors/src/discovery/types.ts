/** What a discovery source reports, and what the worker gives it. */
export interface Found {
  key: string; address: string; name: string; category: string; vendor: string; model: string; os: string; template: string; assetKind: string;
  parentKey?: string | null;
  /** keys of other results this one depends on (a VM its host, a blade its frame) */
  dependsOn?: string[];
  details: Record<string, unknown>;
}
export interface OpenCredential { kind: string; fields: Record<string, unknown>; secrets: Record<string, string> }
export interface SourceContext {
  /** a shared credential of the Global scope, opened (null if missing) */
  credential(id: string): Promise<OpenCredential | null>;
  progress(done: number, total: number): void;
  /** merge: the same device reported again (e.g. seen by several switches) is combined, not replaced */
  found(r: Found, opts?: { merge?: boolean }): Promise<void>;
  cancelled(): boolean;
  log: { debug: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };
}
export type Source = (params: Record<string, unknown>, ctx: SourceContext) => Promise<void>;

/** Runs `fn` over `items`, `n` at a time, stopping early when cancelled. */
export async function eachLimit<T>(items: T[], n: number, ctx: Pick<SourceContext, "cancelled">, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length && !ctx.cancelled()) await fn(queue.shift()!);
  }));
}
