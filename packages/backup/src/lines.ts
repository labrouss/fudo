import type { Readable } from "node:stream";

/** Splits a byte stream into lines (without the newline), keeping raw bytes for COPY data. */
export async function* lines(src: Readable): AsyncGenerator<Buffer> {
  let rest = Buffer.alloc(0);
  for await (const chunk of src as AsyncIterable<Buffer>) {
    let buf = rest.length ? Buffer.concat([rest, chunk]) : chunk;
    let start = 0, nl: number;
    while ((nl = buf.indexOf(10, start)) >= 0) { yield buf.subarray(start, nl); start = nl + 1; }
    rest = Buffer.from(buf.subarray(start));
  }
  if (rest.length) yield rest;
}

export const END = "\\.";
