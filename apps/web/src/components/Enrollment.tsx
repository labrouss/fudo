import { t } from "../i18n";
import { useEffect, useState, type FormEvent } from "react";
import type { TotpEnrollment } from "@fudo/shared";
import { api, errorFields } from "../api";
import { Field, FormError } from "./Field";

export function TwoFactorEnroll({ onDone }: { onDone: (codes: string[]) => void }) {
  const [enroll, setEnroll] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<TotpEnrollment>("/enroll/totp").then(setEnroll).catch((err) => setMessage(errorFields(err).message));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const r = await api.post<{ recoveryCodes: string[] }>("/enroll/totp", { code });
      onDone(r.recoveryCodes);
    } catch (err) {
      const r = errorFields(err);
      setError(r.fields.code ?? r.message ?? undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <p className="lead">{t("ui.two_factor_authentication_is_required_for")}</p>
      <FormError message={message} />
      {enroll && (
        <div className="totp">
          <img src={enroll.qrDataUrl} width={168} height={168} alt={t("ui.qr_code_for_your_authenticator_app")} />
          <div className="stack stack--tight">
            <span className="field__hint">{t("ui.can_t_scan_enter_this_key_manually")}</span>
            <code className="secret">{enroll.secret.match(/.{1,4}/g)?.join(" ")}</code>
          </div>
        </div>
      )}
      <Field label={t("ui.6_digit_code_from_the_app")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} error={error} required />
      <button className="btn btn--primary" disabled={busy || code.length !== 6}>{busy ? t("common.verifying") : t("ui.verify_and_enable")}</button>
    </form>
  );
}

export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = `${t("ui.recovery_file")}\n\n${codes.join("\n")}\n`;
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "fudo-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="stack">
      <p className="lead">{t("ui.store_these_codes_somewhere_safe_each_one")}</p>
      <ul className="codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
      <div className="row-actions">
        <button type="button" className="btn" onClick={download}>{t("ui.download_txt")}</button>
        <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>{t("common.copy")}</button>
      </div>
      <label className="check"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />{t("ui.i_have_saved_my_recovery_codes")}</label>
      <button className="btn btn--primary" disabled={!saved} onClick={onDone}>{t("common.continue")}</button>
    </div>
  );
}
