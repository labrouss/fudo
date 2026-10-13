import { t } from "../i18n";
import type { ReactNode } from "react";
import { LanguagePicker } from "./LanguagePicker";

/** Entry screens (sign-in, setup, invitations): full-bleed logo panel + form panel. */
export function AuthLayout({ children, org }: { children: ReactNode; org?: string | null }) {
  return (
    <div className="auth">
      <aside className="auth__hero" role="img" aria-label={t("ui.fudo_distributed_application_monitoring")}>
        {org && <p className="auth__org">{org}</p>}
      </aside>
      <main className="auth__panel">
        <div className="auth-lang"><LanguagePicker signedIn={false} /></div>
        <div className="auth__content">{children}</div>
      </main>
    </div>
  );
}
