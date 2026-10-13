import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Tabs, type TabDef } from "../../components/Tabs";
import type { ContactMethodDto, ProfileDto, SessionDto, TotpEnrollment } from "@fudo/shared";
import { t, uiLocale } from "../../i18n";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { Dialog } from "../../components/Dialog";
import { Field, FormError } from "../../components/Field";
import { RecoveryCodes } from "../../components/Enrollment";
import { Pill } from "../../components/Status";

const when = (iso: string) => new Date(iso).toLocaleString(uiLocale(), { dateStyle: "medium", timeStyle: "short" });
/** "Firefox on Windows" from a user agent, without a parsing library. */
function browser(ua: string | null): string {
  if (!ua) return "—";
  const b = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : ua.split(" ")[0]!;
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? t("profile.browser_on", { browser: b, os }) : b;
}
const TYPE_LABEL: Record<ContactMethodDto["type"], string> = { email: "profile.type.email", teams: "profile.type.teams", telegram: "profile.type.telegram" };

export function ProfilePage({ onChanged }: { onChanged: () => void }) {
  const [p, setP] = useState<ProfileDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.get<ProfileDto>("/profile").then(setP).catch((e) => setError(errorFields(e).message)), []);
  useEffect(() => { void load(); }, [load]);
  if (!p) return <><PageHeader title={t("profile.title")} /><div className="content"><FormError message={error} /></div></>;
  const tabs: TabDef<"details" | "password" | "two-factor" | "sessions" | "on-call">[] = [
    { id: "details", label: t("profile.details") },
    { id: "password", label: t("profile.password") },
    { id: "two-factor", label: t("profile.two_factor") },
    { id: "sessions", label: t("profile.sessions") },
    { id: "on-call", label: t("oncall.title") },
  ];
  return (
    <>
      <PageHeader title={t("profile.title")} />
      <div className="content profile">
        <Tabs tabs={tabs} prefix="profile" label={t("profile.title")}>{(tab) => (
          <>
            {tab === "details" && <Details p={p} onSaved={() => { void load(); onChanged(); }} />}
            {tab === "password" && <Password />}
            {tab === "two-factor" && <TwoFactor left={p.recoveryCodesLeft} onChanged={load} />}
            {tab === "sessions" && <Sessions />}
            {tab === "on-call" && <><MyShifts /><Contacts p={p} onChanged={load} /><Steps p={p} onSaved={load} /></>}
          </>
        )}</Tabs>
      </div>
    </>
  );
}

function Details({ p, onSaved }: { p: ProfileDto; onSaved: () => void }) {
  const [name, setName] = useState(p.displayName);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [ok, setOk] = useState(false);
  const save = async (e: FormEvent) => { e.preventDefault(); setOk(false); setFields({}); try { await api.put("/profile", { displayName: name }); setOk(true); onSaved(); } catch (err) { setFields(errorFields(err).fields); } };
  return (
    <section className="card card--form">
      <h2>{t("profile.details")}</h2>
      <form className="stack" onSubmit={save} noValidate>
        <Field label={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} error={fields.displayName} />
        <Field label={t("profile.email")} value={p.email} readOnly hint={t("profile.email_hint")} />
        <div className="form__actions"><button className="btn btn--primary">{t("common.save")}</button>{ok && <span className="field__hint" role="status">{t("admin.changes_saved")}</span>}</div>
      </form>
    </section>
  );
}

function Password() {
  const [f, setF] = useState({ currentPassword: "", newPassword: "", repeat: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [ok, setOk] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setOk(false); setFields({});
    if (f.newPassword !== f.repeat) { setFields({ repeat: t("profile.passwords_differ") }); return; }
    try { await api.post("/profile/password", { currentPassword: f.currentPassword, newPassword: f.newPassword }); setF({ currentPassword: "", newPassword: "", repeat: "" }); setOk(true); }
    catch (err) { setFields(errorFields(err).fields); }
  };
  return (
    <section className="card card--form">
      <h2>{t("profile.password")}</h2>
      <form className="stack" onSubmit={save} noValidate>
        <Field label={t("profile.current_password")} type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} error={fields.currentPassword} />
        <div className="grid-2">
          <Field label={t("profile.new_password")} type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} error={fields.newPassword} />
          <Field label={t("profile.repeat_password")} type="password" autoComplete="new-password" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} error={fields.repeat} />
        </div>
        <p className="field__hint">{t("profile.password_hint")}</p>
        <div className="form__actions"><button className="btn btn--primary">{t("profile.change_password")}</button>{ok && <span className="field__hint" role="status">{t("profile.password_changed")}</span>}</div>
      </form>
    </section>
  );
}

function TwoFactor({ left, onChanged }: { left: number; onChanged: () => void }) {
  const [mode, setMode] = useState<"device" | "codes" | null>(null);
  return (
    <section className="card card--form">
      <h2>{t("profile.two_factor")}</h2>
      <p className="lead">{t("profile.recovery_left", { n: left })}</p>
      <div className="row-actions">
        <button className="btn" onClick={() => setMode("device")}>{t("profile.new_device")}</button>
        <button className="btn" onClick={() => setMode("codes")}>{t("profile.new_codes")}</button>
      </div>
      <Dialog title={mode === "device" ? t("profile.new_device") : t("profile.new_codes")} open={mode !== null} onClose={() => { setMode(null); onChanged(); }}>
        {mode && <TwoFactorFlow mode={mode} onDone={() => { setMode(null); onChanged(); }} />}
      </Dialog>
    </section>
  );
}

function TwoFactorFlow({ mode, onDone }: { mode: "device" | "codes"; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [enroll, setEnroll] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />;
  const start = async (e: FormEvent) => {
    e.preventDefault(); setFields({}); setMessage(null);
    try {
      if (mode === "codes") setCodes((await api.post<{ recoveryCodes: string[] }>("/profile/recovery-codes", { password })).recoveryCodes);
      else setEnroll(await api.post<TotpEnrollment>("/profile/2fa/start", { password }));
    } catch (err) { const x = errorFields(err); setFields(x.fields); if (!Object.keys(x.fields).length) setMessage(x.message); }
  };
  const confirm = async (e: FormEvent) => {
    e.preventDefault(); setFields({}); setMessage(null);
    try { setCodes((await api.post<{ recoveryCodes: string[] }>("/profile/2fa/confirm", { code })).recoveryCodes); }
    catch (err) { const x = errorFields(err); setFields(x.fields); if (!Object.keys(x.fields).length) setMessage(x.message); }
  };
  if (!enroll) return (
    <form className="stack" onSubmit={start} noValidate>
      <FormError message={message} />
      <p className="lead">{mode === "device" ? t("profile.new_device_lead") : t("profile.new_codes_lead")}</p>
      <Field label={t("profile.current_password")} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} autoFocus />
      <div className="form__actions"><button className="btn btn--primary">{t("profile.continue")}</button></div>
    </form>
  );
  return (
    <form className="stack" onSubmit={confirm} noValidate>
      <FormError message={message} />
      <p className="lead">{t("profile.scan_new")}</p>
      <div className="enroll"><img src={enroll.qrDataUrl} width={168} height={168} alt={t("ui.qr_code_for_your_authenticator_app")} /><code className="secret">{enroll.secret.match(/.{1,4}/g)?.join(" ")}</code></div>
      <Field label={t("profile.code_from_new")} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} error={fields.code} />
      <p className="field__hint">{t("profile.old_device_hint")}</p>
      <div className="form__actions"><button className="btn btn--primary">{t("profile.confirm_device")}</button></div>
    </form>
  );
}

function Sessions() {
  const [list, setList] = useState<SessionDto[]>([]);
  const load = useCallback(() => api.get<SessionDto[]>("/profile/sessions").then(setList).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const end = async (s: SessionDto) => { const r = await api.del<{ signedOut?: boolean }>(`/profile/sessions/${s.id}`); if (r?.signedOut) location.href = "/"; else void load(); };
  return (
    <section className="card card--flush">
      <h2 className="card__title">{t("profile.sessions")}</h2>
      <table className="table">
        <thead><tr><th>{t("profile.device")}</th><th>{t("profile.ip")}</th><th>{t("profile.signed_in")}</th><th>{t("profile.expires")}</th><th><span className="sr-only">{t("common.actions")}</span></th></tr></thead>
        <tbody>{list.map((s) => (
          <tr key={s.id}>
            <td>{browser(s.userAgent)} {s.current && <Pill tone="info">{t("profile.this_session")}</Pill>}</td>
            <td className="small">{s.ip ?? "—"}</td><td className="small nowrap">{when(s.createdAt)}</td><td className="small nowrap">{when(s.expiresAt)}</td>
            <td className="actions"><button className="btn btn--small" onClick={() => void end(s)}>{s.current ? t("ui.sign_out") : t("profile.end_session")}</button></td>
          </tr>))}</tbody>
      </table>
      {list.length > 1 && <div className="row-actions" style={{ padding: "10px 16px" }}><button className="btn btn--small" onClick={async () => { await api.post("/profile/sessions/end-others"); void load(); }}>{t("profile.end_others")}</button></div>}
    </section>
  );
}

function Contacts({ p, onChanged }: { p: ProfileDto; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState<ContactMethodDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tested, setTested] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => { setMessage(null); try { await fn(); onChanged(); } catch (e) { setMessage(errorFields(e).message); } };
  return (
    <section className="card card--flush">
      <h2 className="card__title">{t("profile.contacts")}</h2>
      <p className="muted small" style={{ padding: "0 16px" }}>{t("profile.contacts_lead")}</p>
      <div style={{ padding: "0 16px" }}><FormError message={message} /></div>
      {p.contacts.length > 0 && (
        <table className="table">
          <tbody>{p.contacts.map((c) => (
            <tr key={c.id}>
              <td><span className="strong">{t(TYPE_LABEL[c.type])}</span>{c.label && <span className="muted"> · {c.label}</span>}<div className="small muted">{c.target}</div></td>
              <td>{c.verified ? <Pill tone="up">{t("profile.verified")}</Pill> : <Pill tone="neutral">{t("profile.not_verified")}</Pill>}</td>
              <td className="actions">
                {c.verified
                  ? <button className="btn btn--small" onClick={() => void act(async () => { await api.post(`/profile/contacts/${c.id}/test`); setTested(c.id); })}>{tested === c.id ? t("profile.sent") : t("profile.send_test")}</button>
                  : <button className="btn btn--small btn--primary" onClick={() => setVerifying(c)}>{t("profile.enter_code")}</button>}
                <button className="btn btn--small btn--danger" onClick={() => { if (confirm(t("profile.confirm_remove_contact"))) void act(() => api.del(`/profile/contacts/${c.id}`)); }}>{t("status_pages.remove")}</button>
              </td>
            </tr>))}</tbody>
        </table>
      )}
      <div className="row-actions" style={{ padding: "10px 16px 14px" }}><button className="btn" onClick={() => setAdding(true)}>{t("profile.add_contact")}</button></div>
      <Dialog title={t("profile.add_contact")} open={adding} onClose={() => setAdding(false)}>
        {adding && <AddContact telegramBot={p.telegramBot} onAdded={(id) => { setAdding(false); onChanged(); setVerifying({ id } as ContactMethodDto); }} />}
      </Dialog>
      <Dialog title={t("profile.enter_code")} open={verifying !== null} onClose={() => setVerifying(null)}>
        {verifying && <VerifyContact id={verifying.id} onDone={() => { setVerifying(null); onChanged(); }} />}
      </Dialog>
    </section>
  );
}

function AddContact({ telegramBot, onAdded }: { telegramBot: string | null; onAdded: (id: string) => void }) {
  const [f, setF] = useState({ type: "email" as ContactMethodDto["type"], label: "", target: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setFields({}); setMessage(null);
    try { onAdded((await api.post<{ id: string }>("/profile/contacts", f)).id); }
    catch (err) { const x = errorFields(err); setFields(x.fields); if (!Object.keys(x.fields).length) setMessage(x.message); }
    finally { setBusy(false); }
  };
  const hint = f.type === "teams" ? t("profile.teams_how") : f.type === "telegram" ? t("profile.telegram_how", { bot: `@${telegramBot}` }) : null;
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <label className="field"><span>{t("profile.type")}</span>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as ContactMethodDto["type"], target: "" })}>
          <option value="email">{t("profile.type.email")}</option><option value="teams">{t("profile.type.teams")}</option>
          {telegramBot && <option value="telegram">{t("profile.type.telegram")}</option>}
        </select>
      </label>
      {hint && <p className="field__hint">{hint}</p>}
      <Field label={f.type === "email" ? t("profile.email") : f.type === "teams" ? t("profile.teams_url") : t("profile.telegram_chat")} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} error={fields.target} autoComplete="off" />
      <Field label={t("profile.label")} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder={t("profile.label_placeholder")} />
      {!telegramBot && <p className="field__hint">{t("profile.telegram_missing")}</p>}
      <div className="form__actions"><button className="btn btn--primary" disabled={busy}>{t("profile.send_code")}</button></div>
    </form>
  );
}

function VerifyContact({ id, onDone }: { id: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setFields({}); setMessage(null); try { await api.post(`/profile/contacts/${id}/verify`, { code }); onDone(); } catch (err) { const x = errorFields(err); setFields(x.fields); if (!Object.keys(x.fields).length) setMessage(x.message); } };
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <p className="lead">{t("profile.code_sent")}</p>
      <Field label={t("profile.code")} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} error={fields.code} autoFocus />
      <div className="form__actions">
        <button className="btn btn--primary">{t("profile.verify")}</button>
        <button type="button" className="btn" onClick={async () => { await api.post(`/profile/contacts/${id}/resend`); setResent(true); }}>{t("profile.resend")}</button>
        {resent && <span className="field__hint" role="status">{t("profile.code_resent")}</span>}
      </div>
    </form>
  );
}

function Steps({ p, onSaved }: { p: ProfileDto; onSaved: () => void }) {
  const verified = p.contacts.filter((c) => c.verified);
  const [steps, setSteps] = useState(p.steps);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => setSteps(p.steps), [p.steps]);
  const save = async () => { setMessage(null); setOk(false); try { await api.put("/profile/notification-steps", { steps }); setOk(true); onSaved(); } catch (e) { setMessage(errorFields(e).message); } };
  const name = (c: ContactMethodDto) => `${t(TYPE_LABEL[c.type])}${c.label ? ` · ${c.label}` : ""}`;
  return (
    <section className="card card--form">
      <h2>{t("profile.steps")}</h2>
      <p className="lead">{t("profile.steps_lead")}</p>
      <FormError message={message} />
      {verified.length === 0 ? <p className="muted">{t("profile.steps_need_contact")}</p> : (
        <div className="stack">
          {steps.map((s, i) => (
            <div key={i} className="step-row">
              <select value={s.contactId} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, contactId: e.target.value } : x)))} aria-label={t("profile.contact")}>
                {verified.map((c) => <option key={c.id} value={c.id}>{name(c)}</option>)}
              </select>
              <label className="small">{t("profile.after")}<input type="number" min={0} max={1440} value={s.delayMin} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, delayMin: Number(e.target.value) } : x)))} className="input--narrow" />{t("profile.minutes")}</label>
              <button className="btn btn--small" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>{t("status_pages.remove")}</button>
            </div>
          ))}
          <div className="row-actions">
            <button className="btn" onClick={() => setSteps([...steps, { contactId: verified[0]!.id, delayMin: steps.length ? steps[steps.length - 1]!.delayMin + 5 : 0 }])} disabled={steps.length >= 10}>{t("profile.add_step")}</button>
            <button className="btn btn--primary" onClick={() => void save()}>{t("common.save")}</button>
            {ok && <span className="field__hint" role="status">{t("admin.changes_saved")}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

function MyShifts() {
  const [list, setList] = useState<Array<{ team: string; start: string; end: string; source: "rotation" | "override"; now: boolean }> | null>(null);
  useEffect(() => { void api.get<NonNullable<typeof list>>("/profile/oncall").then(setList).catch(() => setList([])); }, []);
  if (!list || list.length === 0) return null;
  return (
    <section className="card card--flush">
      <h2 className="card__title">{t("oncall.my_shifts")}</h2>
      <table className="table"><tbody>{list.map((x, n) => (
        <tr key={n}><td className="strong">{x.team}</td><td className="small nowrap">{when(x.start)} – {when(x.end)}</td>
          <td>{x.now && <Pill tone="info">{t("oncall.now")}</Pill>}{x.source === "override" && <Pill tone="neutral">{t("oncall.override")}</Pill>}</td></tr>))}</tbody></table>
    </section>
  );
}
