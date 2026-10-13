import { T } from "../components/T";
import { t } from "../i18n";
import { useEffect, useState, type FormEvent } from "react";
import type { InviteInfo } from "@fudo/shared";
import { api, errorFields } from "../api";
import { AuthLayout } from "../components/AuthLayout";
import { Field, FormError } from "../components/Field";
import { RecoveryCodes, TwoFactorEnroll } from "../components/Enrollment";
import { navigate } from "../router";

type Step = "loading" | "invalid" | "password" | "twofactor" | "recovery";

export function InviteAccept({ token, onFinished }: { token: string; onFinished: () => void }) {
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [invalid, setInvalid] = useState<string>("");
  const [codes, setCodes] = useState<string[]>([]);

  useEffect(() => {
    api.get<InviteInfo>(`/invites/${encodeURIComponent(token)}`)
      .then((i) => { setInfo(i); setStep("password"); })
      .catch((err) => {
        // The link is consumed once the password step succeeds; after a reload continue with 2FA.
        api.get("/enroll/totp").then(() => setStep("twofactor")).catch(() => { setInvalid(errorFields(err).message ?? ""); setStep("invalid"); });
      });
  }, [token]);

  const finish = () => { navigate("/", { replace: true }); onFinished(); };

  return (
    <AuthLayout org={info?.orgName}>
      {step === "loading" && <p className="lead">{t("inviteaccept.checking_your_link")}</p>}
      {step === "invalid" && (
        <div className="stack">
          <h1>{t("inviteaccept.link_not_valid")}</h1>
          <p className="lead">{invalid}</p>
          <button className="btn" onClick={finish}>{t("inviteaccept.go_to_sign_in")}</button>
        </div>
      )}
      {step === "password" && info && <PasswordStep token={token} info={info} onDone={() => setStep("twofactor")} />}
      {step === "twofactor" && (
        <div className="stack">
          <h1>{t("inviteaccept.set_up_two_factor_authentication")}</h1>
          <TwoFactorEnroll onDone={(c) => { setCodes(c); setStep("recovery"); }} />
        </div>
      )}
      {step === "recovery" && (
        <div className="stack">
          <h1>{t("inviteaccept.save_your_recovery_codes")}</h1>
          <RecoveryCodes codes={codes} onDone={finish} />
        </div>
      )}
    </AuthLayout>
  );
}

function PasswordStep({ token, info, onDone }: { token: string; info: InviteInfo; onDone: () => void }) {
  const isInvite = info.kind === "invite";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (isInvite && password !== confirm) return setFields({ confirm: t("common.passwords_do_not_match") });
    setBusy(true);
    setFields({});
    setMessage(null);
    try {
      await api.post(`/invites/${encodeURIComponent(token)}/accept`, { password });
      onDone();
    } catch (err) {
      const r = errorFields(err);
      setFields(r.fields);
      setMessage(Object.keys(r.fields).length ? null : r.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <h1>{isInvite ? t("inviteaccept.welcome_displayname", { displayName: info.displayName }) : t("inviteaccept.register_your_authenticator_again")}</h1>
      <p className="lead">
        {isInvite
          ? <T k="inviteaccept.intro.invite" values={{ email: <strong>{info.email}</strong> }} />
          : <T k="inviteaccept.intro.reset" values={{ email: <strong>{info.email}</strong> }} />}
      </p>
      <FormError message={message} />
      <input type="email" value={info.email} autoComplete="username" readOnly hidden />
      <Field label={isInvite ? t("inviteaccept.new_password") : t("inviteaccept.your_password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} hint={isInvite ? t("common.at_least_12_characters") : undefined} autoComplete={isInvite ? "new-password" : "current-password"} required />
      {isInvite && <Field label={t("common.confirm_password")} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={fields.confirm} autoComplete="new-password" required />}
      <button className="btn btn--primary" disabled={busy}>{busy ? t("common.saving") : t("common.continue")}</button>
    </form>
  );
}
