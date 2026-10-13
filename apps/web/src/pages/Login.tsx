import { t } from "../i18n";
import { useState, type FormEvent } from "react";
import { api, errorFields } from "../api";
import { Field, FormError } from "../components/Field";
import { AuthLayout } from "../components/AuthLayout";

export function Login({ org, onSignedIn }: { org: string | null; onSignedIn: () => void }) {
  const [stage, setStage] = useState<"password" | "code">("password");
  const [useRecovery, setUseRecovery] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setFields({});
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      const r = errorFields(err);
      setFields(r.fields);
      setMessage(r.fields.code || r.fields.recoveryCode ? null : r.message);
    } finally {
      setBusy(false);
    }
  }

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.post("/auth/login", { email, password });
      setPassword("");
      setStage("code");
    });
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.post("/auth/mfa", useRecovery ? { recoveryCode: code } : { code });
      onSignedIn();
    });
  };

  return (
    <AuthLayout org={org}>
        {stage === "password" ? (
          <form className="stack" onSubmit={submitPassword} noValidate>
            <h1>{t("login.sign_in")}</h1>
            <FormError message={message} />
            <Field label={t("common.email")} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} required />
            <Field label={t("common.password")} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} required />
            <button className="btn btn--primary" disabled={busy}>{busy ? t("common.checking") : t("common.continue")}</button>
          </form>
        ) : (
          <form className="stack" onSubmit={submitCode} noValidate>
            <h1>{t("login.two_factor_check")}</h1>
            <p className="lead">{useRecovery ? t("login.enter_one_of_your_recovery_codes_each_code") : t("login.enter_the_6_digit_code_from_your")}</p>
            <FormError message={message} />
            {useRecovery ? (
              <Field key="rc" label={t("login.recovery_code")} autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} error={fields.recoveryCode} placeholder={t("login.xxxx_xxxx_xxxx")} required />
            ) : (
              <Field key="otp" label={t("login.code")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} error={fields.code} required />
            )}
            <button className="btn btn--primary" disabled={busy || (!useRecovery && code.length !== 6)}>{busy ? t("common.verifying") : t("login.sign_in")}</button>
            <button type="button" className="btn btn--link" onClick={() => { setUseRecovery(!useRecovery); setCode(""); setFields({}); }}>
              {useRecovery ? t("login.use_the_authenticator_app_instead") : t("login.use_a_recovery_code")}
            </button>
          </form>
        )}
    </AuthLayout>
  );
}
