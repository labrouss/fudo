import { availableLanguages, currentLanguage, setLanguage, t } from "../i18n";

/** Lists every language found in locales/ (names in their own language, completion when partial). */
export function LanguagePicker({ dark = false, signedIn = true }: { dark?: boolean; signedIn?: boolean }) {
  const langs = availableLanguages();
  if (langs.length < 2) return null;
  return (
    <label className={dark ? "lang lang--dark" : "lang"}>
      <span className="sr-only">{t("ui.language")}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" /></svg>
      <select value={currentLanguage()} onChange={(e) => void setLanguage(e.target.value, signedIn)} aria-label={t("ui.language")}>
        {langs.map((l) => <option key={l.code} value={l.code}>{l.name}{l.complete < 100 ? ` (${l.complete}%)` : ""}</option>)}
      </select>
    </label>
  );
}
