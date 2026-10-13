import { availableLanguages, t } from "../i18n";

/** Language dropdown ("" = organisation default when `allowDefault` is set). */
export function LanguageSelect({ value, onChange, allowDefault, defaultName }: { value: string; onChange: (v: string) => void; allowDefault?: boolean; defaultName?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowDefault && <option value="">{t("settings.org_default_lang", { name: defaultName ?? "" })}</option>}
      {availableLanguages().map((l) => <option key={l.code} value={l.code}>{l.name}{l.name !== l.englishName ? ` · ${l.englishName}` : ""}</option>)}
    </select>
  );
}
