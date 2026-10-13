import { t } from "../i18n";
export function Mark({ size = 30 }: { size?: number }) {
  return <img src="/fudo-mark.png" width={size} height={size} alt="" className="mark" />;
}

/** Wordmark used inside the app (on the dark sidebar). */
export function Brand({ org }: { org?: string | null }) {
  return (
    <div className="brand">
      <Mark />
      <div className="brand__text">
        <span className="brand__name">{t("ui.fudo")}<span className="brand__version" title={`Fudo ${__FUDO_VERSION__}`}>v{__FUDO_VERSION__}</span></span>
        {org && <span className="brand__org">{org}</span>}
      </div>
    </div>
  );
}
