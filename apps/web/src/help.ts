/**
 * The user guide (docs/guide), bundled at build time: the same files GitHub shows, so the in-app
 * help never drifts from the repository documentation.
 *
 * Translations live in docs/guide/<lang>/<page>.md and start with a stamp naming the English
 * version they were made from (see @fudo/shared doc-hash). Pages without a translation are shown
 * in English; translations of an English page that changed since are marked as possibly outdated.
 */
import { Marked, type Tokens } from "marked";
import { docHash, docStamp } from "@fudo/shared";

const FILES = import.meta.glob(["../../../docs/guide/*.md", "../../../docs/guide/*/*.md"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const PREFIX = "../../../docs/guide/";

/** Reading order (docs/README.md lists the same). */
const ORDER = ["getting-started", "concepts", "monitors", "incidents", "notifications", "maintenance", "dashboards-and-reports", "configuration-as-code", "discovery", "users-and-access", "settings", "troubleshooting"];

export type HelpState = "english" | "translated" | "outdated";
export interface HelpTopic {
  id: string;
  title: string;
  /** what is shown: the translation when there is one, else English */
  markdown: string;
  /** the language of `markdown` and the folder its links are relative to */
  lang: string;
  state: HelpState;
  english: { title: string; markdown: string };
  text: string;
}

const STAMP_LINE = /^\uFEFF?\s*<!--\s*translation-of:[^>]*-->\s*/;
const titleOf = (md: string, id: string) => /^#\s+(.+)$/m.exec(md)?.[1]?.trim() ?? id;
const plain = (md: string) => md.replace(/```[\s\S]*?```/g, " ").replace(/[#*`|>[\]()_-]/g, " ").replace(/\s+/g, " ");

/** The guide in a language: translated pages where they exist, English otherwise. */
export function helpTopics(lang: string): HelpTopic[] {
  return ORDER.flatMap((id): HelpTopic[] => {
    const en = FILES[`${PREFIX}${id}.md`];
    if (!en) return [];
    const english = { title: titleOf(en, id), markdown: en };
    const tr = lang !== "en" ? FILES[`${PREFIX}${lang}/${id}.md`] : undefined;
    if (!tr) return [{ id, title: english.title, markdown: en, lang: "en", state: "english", english, text: plain(en) }];
    const stamp = docStamp(tr);
    const body = tr.replace(STAMP_LINE, "");
    const state: HelpState = stamp && stamp.source === `${id}.md` && stamp.hash === docHash(en) ? "translated" : "outdated";
    return [{ id, title: titleOf(body, id), markdown: body, lang, state, english, text: plain(body) }];
  });
}

/** Languages that have at least one translated page. */
export const helpLanguages = () => [...new Set(Object.keys(FILES).map((k) => k.slice(PREFIX.length).split("/")).filter((p) => p.length === 2).map((p) => p[0]!))];

const slug = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
type Ctx = { parser: { parseInline: (t: Tokens.Generic[]) => string } };

/** Topic HTML. `lang` is the folder the page lives in (links are relative to it). The guide is part of the build, so its content is trusted. */
export function renderHelp(markdown: string, lang = "en"): string {
  const base = `https://repo/docs/guide/${lang === "en" ? "" : `${lang}/`}`;
  const md = new Marked({ gfm: true });
  md.use({
    renderer: {
      heading(this: Ctx, h: Tokens.Heading) {
        const inner = this.parser.parseInline(h.tokens);
        return `<h${h.depth} id="${slug(inner)}">${inner}</h${h.depth}>\n`;
      },
      link(this: Ctx, l: Tokens.Link) {
        const text = this.parser.parseInline(l.tokens);
        if (/^https?:\/\//.test(l.href)) return `<a href="${esc(l.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        const url = new URL(l.href, base);
        // another guide page, in this language's folder or the English one: the app shows the right version
        const page = /^\/docs\/guide\/(?:[A-Za-z-]+\/)?([a-z0-9-]+)\.md$/.exec(url.pathname)?.[1];
        if (page && ORDER.includes(page)) return `<a href="/help/${page}${url.hash}" data-internal="1">${text}</a>`;
        // repository files that are not part of the in-app help (administration, contributor guides)
        return `<span class="help-ext">${text} <code>${esc(url.pathname.slice(1))}</code></span>`;
      },
    },
  });
  return md.parse(markdown) as string;
}

/** Topics whose text contains every word of the query, with a short snippet around the first match. */
export function searchHelp(query: string, topics: HelpTopic[]): Array<{ topic: HelpTopic; snippet: string }> {
  // the same normalisation as the indexed text, so "self-signed" finds "self signed"
  const words = query.toLowerCase().replace(/[#*`|>[\]()_-]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return topics.flatMap((topic) => {
    // a translated page is also found by its English words (people often search for the English term)
    const hay = `${topic.title} ${topic.text} ${topic.state === "english" ? "" : plain(topic.english.markdown)}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) return [];
    const at = topic.text.toLowerCase().indexOf(words[0]!);
    const start = Math.max(0, at - 60);
    return [{ topic, snippet: at < 0 ? topic.text.slice(0, 140).trim() + "…" : (start > 0 ? "…" : "") + topic.text.slice(start, at + 120).trim() + "…" }];
  });
}
