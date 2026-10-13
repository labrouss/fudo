import { t } from "../i18n";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorFields } from "../api";
import { Field, FormError } from "../components/Field";
import { AuthLayout } from "../components/AuthLayout";
import { RecoveryCodes, TwoFactorEnroll } from "../components/Enrollment";
import { SmtpForm } from "../components/SmtpForm";

type Step = "account" | "twofactor" | "recovery" | "email" | "done";
const STEPS: Array<{ id: Step; label: string }> = [
  { id: "account", label: t("setupwizard.administrator") },
  { id: "twofactor", label: t("setupwizard.two_factor") },
  { id: "recovery", label: t("setupwizard.recovery_codes") },
  { id: "email", label: t("common.email") },
];

export function SetupWizard({ onFinished }: { onFinished: () => void }) {
  const [step, setStep] = useState<Step>("account");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [adminEmail, setAdminEmail] = useState("");

  // Resume after a reload: a pending admin session can still fetch the enrollment.
  useEffect(() => {
    api.get("/enroll/totp").then(() => setStep("twofactor")).catch(() => {});
  }, []);

  const current = STEPS.findIndex((s) => s.id === step);

  return (
    <AuthLayout>
      <h1>{t("setupwizard.set_up_fudo")}</h1>
      {step !== "done" && (
        <ol className="steps" aria-label={t("setupwizard.setup_progress")}>
          {STEPS.map((s, i) => (
            <li key={s.id} className={i < current ? "steps__item steps__item--done" : i === current ? "steps__item steps__item--current" : "steps__item"} aria-current={i === current ? "step" : undefined}>
              <span className="steps__num">{i + 1}</span>
              {s.label}
            </li>
          ))}
        </ol>
      )}
      {step === "account" && <AccountStep onDone={(email) => { setAdminEmail(email); setStep("twofactor"); }} />}
      {step === "twofactor" && <TwoFactorEnroll onDone={(codes) => { setRecoveryCodes(codes); setStep("recovery"); }} />}
      {step === "recovery" && <RecoveryCodes codes={recoveryCodes} onDone={() => setStep("email")} />}
      {step === "email" && (
        <div className="stack">
          <p className="lead">{t("setupwizard.email_is_used_for_invitations_alerts_and")}</p>
          <SmtpForm defaultTo={adminEmail} saveLabel={t("setupwizard.save_and_finish")} onSaved={() => setStep("done")} onSkip={() => setStep("done")} />
        </div>
      )}
      {step === "done" && (
        <div className="stack">
          <p className="lead">{t("setupwizard.setup_is_complete_you_are_signed_in_as_the")}</p>
          <button className="btn btn--primary" onClick={onFinished}>{t("setupwizard.open_fudo")}</button>
        </div>
      )}
    </AuthLayout>
  );
}

function AccountStep({ onDone }: { onDone: (email: string) => void }) {
  const [form, setForm] = useState({ orgName: "", displayName: "", email: "", password: "", confirm: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) return setFields({ confirm: t("common.passwords_do_not_match") });
    setBusy(true);
    setFields({});
    setMessage(null);
    try {
      const { confirm: _c, ...body } = form;
      await api.post("/setup/admin", body);
      onDone(form.email);
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
      <p className="lead">{t("setupwizard.create_the_first_administrator_this")}</p>
      <FormError message={message} />
      <Field label={t("setupwizard.organization_name")} value={form.orgName} onChange={set("orgName")} error={fields.orgName} autoComplete="organization" required />
      <Field label={t("setupwizard.your_name")} value={form.displayName} onChange={set("displayName")} error={fields.displayName} autoComplete="name" required />
      <Field label={t("common.email")} type="email" value={form.email} onChange={set("email")} error={fields.email} autoComplete="username" required />
      <Field label={t("common.password")} type="password" value={form.password} onChange={set("password")} error={fields.password} hint={t("common.at_least_12_characters")} autoComplete="new-password" required />
      <Field label={t("common.confirm_password")} type="password" value={form.confirm} onChange={set("confirm")} error={fields.confirm} autoComplete="new-password" required />
      <button className="btn btn--primary" disabled={busy}>{busy ? t("setupwizard.creating_account") : t("setupwizard.create_administrator")}</button>
    </form>
  );
}
