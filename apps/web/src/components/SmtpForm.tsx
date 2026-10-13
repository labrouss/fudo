import { t } from "../i18n";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorFields } from "../api";
import { Field, FormError } from "./Field";

interface SmtpState { configured: boolean; host?: string; port?: number; secure?: boolean; allowUntrusted?: boolean; username?: string; from?: string; hasPassword?: boolean }

export function SmtpForm({ defaultTo, onSaved, onSkip, saveLabel = t("common.save") }: { defaultTo: string; onSaved?: () => void; onSkip?: () => void; saveLabel?: string }) {
  const [form, setForm] = useState({ host: "", port: "587", secure: false, allowUntrusted: false, username: "", password: "", from: "" });
  const [hasPassword, setHasPassword] = useState(false);
  const [testTo, setTestTo] = useState(defaultTo);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const set = (k: "host" | "port" | "username" | "password" | "from") => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    api.get<SmtpState>("/settings/smtp").then((s) => {
      if (!s.configured) return;
      setForm((f) => ({ ...f, host: s.host ?? "", port: String(s.port ?? 587), secure: Boolean(s.secure), allowUntrusted: Boolean(s.allowUntrusted), username: s.username ?? "", from: s.from ?? "" }));
      setHasPassword(Boolean(s.hasPassword));
    }).catch(() => {});
  }, []);

  async function save(): Promise<boolean> {
    setFields({});
    setMessage(null);
    try {
      await api.put("/settings/smtp", { ...form, port: Number(form.port), password: form.password || undefined });
      return true;
    } catch (err) {
      const r = errorFields(err);
      setFields(r.fields);
      setMessage(Object.keys(r.fields).length ? null : r.message);
      return false;
    }
  }

  async function sendTest() {
    setBusy("test");
    setNotice(null);
    if (await save()) {
      try {
        await api.post("/settings/smtp/test", { to: testTo });
        setNotice(t("ui.test_email_sent_to_testto", { testTo }));
      } catch (err) {
        setMessage(errorFields(err).message);
      }
    }
    setBusy(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy("save");
    setNotice(null);
    if (await save()) {
      setNotice(t("ui.email_settings_saved"));
      onSaved?.();
    }
    setBusy(null);
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      {notice && <div className="form-ok" role="status">{notice}</div>}
      <div className="grid-2">
        <Field label={t("ui.smtp_host")} value={form.host} onChange={set("host")} error={fields.host} placeholder="smtp.example.local" />
        <Field label={t("ui.port")} inputMode="numeric" value={form.port} onChange={set("port")} error={fields.port} />
      </div>
      <label className="check"><input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} />{t("ui.use_tls_from_the_start_usually_port_465")}</label>
      <label className="check"><input type="checkbox" checked={form.allowUntrusted} onChange={(e) => setForm({ ...form, allowUntrusted: e.target.checked })} />
        <span>{t("ui.smtp_allow_untrusted")}<span className="field__hint" style={{ display: "block" }}>{t("ui.smtp_allow_untrusted_hint")}</span></span></label>
      <div className="grid-2">
        <Field label={t("ui.username_optional")} value={form.username} onChange={set("username")} error={fields.username} autoComplete="off" />
        <Field label={t("ui.password_optional")} type="password" value={form.password} onChange={set("password")} error={fields.password} autoComplete="new-password" placeholder={hasPassword ? t("ui.unchanged") : ""} />
      </div>
      <Field label={t("ui.sender_address")} value={form.from} onChange={set("from")} error={fields.from} placeholder={t("ui.fudo_fudo_example_local")} />
      <div className="grid-2 grid-2--end">
        <Field label={t("ui.send_a_test_to")} type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
        <button type="button" className="btn" onClick={sendTest} disabled={busy !== null}>{busy === "test" ? t("ui.sending") : t("ui.send_test_email")}</button>
      </div>
      <div className="row-actions row-actions--end">
        {onSkip && <button type="button" className="btn btn--ghost" onClick={onSkip}>{t("ui.skip_for_now")}</button>}
        <button className="btn btn--primary" disabled={busy !== null}>{busy === "save" ? t("common.saving") : saveLabel}</button>
      </div>
    </form>
  );
}
