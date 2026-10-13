/**
 * Fingerprints for translated help pages. A translation's first line names the English page and
 * the fingerprint of the version it was translated from:
 *
 *   <!-- translation-of: getting-started.md#3f9a1c2e -->
 *
 * When the English page changes, the fingerprints differ and the translation is shown as possibly
 * outdated. FNV-1a (32 bit) is enough: it only has to notice a change, not resist tampering.
 */
export function docHash(text: string): string {
  const s = text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim(); // line endings and trailing spaces do not count
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export interface DocStamp { source: string; hash: string }
const STAMP = /^\uFEFF?\s*<!--\s*translation-of:\s*([a-z0-9-]+\.md)#([0-9a-f]{8})\s*-->/;

/** The stamp on a translated page, or null when it has none. */
export const docStamp = (markdown: string): DocStamp | null => {
  const m = STAMP.exec(markdown);
  return m ? { source: m[1]!, hash: m[2]! } : null;
};
/** The stamp line for a translation of `page` made from `englishMarkdown`. */
export const docStampLine = (page: string, englishMarkdown: string) => `<!-- translation-of: ${page}#${docHash(englishMarkdown)} -->`;
