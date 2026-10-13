import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { availableLanguages, currentLanguage, t } from "../../i18n";
import { PageHeader } from "../../components/AppShell";
import { Link, navigate } from "../../router";
import { helpTopics, renderHelp, searchHelp } from "../../help";

/** In-app user guide: docs/guide in the interface language where translated, with a topic list and search. */
export function HelpPage({ topicId }: { topicId: string | null }) {
  const lang = currentLanguage();
  const topics = useMemo(() => helpTopics(lang), [lang]);
  const topic = topics.find((x) => x.id === topicId) ?? topics[0]!;
  const [query, setQuery] = useState("");
  const [showEnglish, setShowEnglish] = useState(false);
  useEffect(() => setShowEnglish(false), [topic.id]);

  const english = showEnglish || topic.state === "english";
  const html = useMemo(() => (english ? renderHelp(topic.english.markdown, "en") : renderHelp(topic.markdown, topic.lang)), [topic, english]);
  const results = useMemo(() => searchHelp(query, topics), [query, topics]);
  const rtl = !english && availableLanguages().find((l) => l.code === topic.lang)?.dir === "rtl";

  // jump to #section links, and to the top when the topic changes
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const el = id ? document.getElementById(id) : null;
    if (el) el.scrollIntoView(); else window.scrollTo(0, 0);
  }, [topic, english]);

  // links between guide pages stay inside the app
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (a?.dataset.internal) { e.preventDefault(); setQuery(""); navigate(a.getAttribute("href")!); }
  };

  return (
    <>
      <PageHeader title={t("help.title")} />
      <div className="content help">
        <aside className="help__nav" aria-label={t("help.topics")}>
          <input type="search" className="help__search" placeholder={t("help.search")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("help.search")} />
          {query ? (
            <ul className="help__results">
              {results.length === 0 && <li className="muted small">{t("help.no_results", { q: query })}</li>}
              {results.map((r) => (
                <li key={r.topic.id}><Link href={`/help/${r.topic.id}`} onClick={() => setQuery("")}><strong>{r.topic.title}</strong></Link><span className="small muted" dir="auto">{r.snippet}</span></li>
              ))}
            </ul>
          ) : (
            <ol className="help__topics">
              {topics.map((tp) => (
                <li key={tp.id}><Link href={`/help/${tp.id}`} className={tp.id === topic.id ? "help__topic help__topic--on" : "help__topic"} aria-current={tp.id === topic.id ? "page" : undefined} dir="auto">{tp.title}</Link></li>
              ))}
            </ol>
          )}
        </aside>
        <article className="card help__body">
          {lang !== "en" && topic.state === "english" && <p className="help__lang" role="note">{t("help.not_translated")}</p>}
          {topic.state === "outdated" && !showEnglish && (
            <p className="help__lang help__lang--warn" role="note">{t("help.outdated")} <button type="button" className="linklike" onClick={() => setShowEnglish(true)}>{t("help.show_english")}</button></p>
          )}
          {topic.state !== "english" && (showEnglish || topic.state === "translated") && (
            <p className="help__switch small"><button type="button" className="linklike" onClick={() => setShowEnglish(!showEnglish)}>{showEnglish ? t("help.show_translation") : t("help.show_english")}</button></p>
          )}
          <div className="markdown" dir={rtl ? "rtl" : "ltr"} lang={english ? "en" : topic.lang} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
          <p className="help__about small muted">
            Fudo {__FUDO_VERSION__} · {__FUDO_SOURCE__
              ? <><a href={`${__FUDO_SOURCE__}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">{t("help.license", { name: "AGPL-3.0-or-later" })}</a> · <a href={__FUDO_SOURCE__} target="_blank" rel="noopener noreferrer">{t("help.source_code")}</a></>
              : t("help.license", { name: "AGPL-3.0-or-later" })}
          </p>
        </article>
      </div>
    </>
  );
}
