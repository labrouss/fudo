import { useEffect, useState } from "react";
import type { MeResponse, ThemeInfo } from "@fudo/shared";
import { availableLanguages, currentLanguage, setLanguage, t } from "../../i18n";
import { listThemes, setTheme, SYSTEM, themePreference } from "../../theme";
import { PageHeader } from "../../components/AppShell";
import { SmtpForm } from "../../components/SmtpForm";
import { BackupsSection, size } from "./Backups";
import { LanguageSelect } from "../../components/LanguageSelect";
import { api, errorFields } from "../../api";
import { Field } from "../../components/Field";
import { Tabs, type TabDef } from "../../components/Tabs";

type TabId = "preferences" | "notify-language" | "email" | "connection" | "retention" | "telegram" | "backups";

/** Everyone: language and theme. Superadmins: system settings, one tab per card (the tab is kept in the URL: /settings#retention). */
export function SettingsPage({ me }: { me: MeResponse }) {
  const sys = t("settings.system");
  const tabs: TabDef<TabId>[] = [
    { id: "preferences", label: t("settings.preferences") },
    ...(me.isSuperadmin ? [
      { id: "notify-language" as const, label: t("settings.notify_language"), group: sys },
      { id: "email" as const, label: t("admin.email_smtp"), group: sys },
      { id: "connection" as const, label: t("connection.title"), group: sys },
      { id: "retention" as const, label: t("retention.title"), group: sys },
      { id: "telegram" as const, label: t("telegram.title"), group: sys },
      { id: "backups" as const, label: t("backups.title"), group: sys },
    ] : []),
  ];
  return (
    <>
      <PageHeader help="settings" title={t("common.settings")} />
      <div className="content">
        <Tabs tabs={tabs} prefix="settings" label={t("common.settings")}>{(tab) => (
          <>
            {tab === "preferences" && (
              <section className="card card--form settings">
                <h2>{t("settings.preferences")}</h2>
                <p className="lead">{t("settings.preferences_lead")}</p>
                <LanguageSetting />
                <ThemeSetting />
              </section>
            )}
            {tab === "notify-language" && <NotifyLanguage />}
            {tab === "email" && (
              <section className="card card--form">
                <h2>{t("admin.email_smtp")}</h2>
                <p className="lead">{t("admin.used_for_invitations_alerts_and_scheduled")}</p>
                <SmtpForm defaultTo={me.email} />
              </section>
            )}
            {tab === "connection" && <ConnectionCard />}
            {tab === "retention" && <RetentionCard />}
            {tab === "telegram" && <TelegramBot />}
            {tab === "backups" && <BackupsSection organization={me.orgName ?? "Fudo"} />}
          </>
        )}</Tabs>
      </div>
    </>
  );
}

function LanguageSetting() {
  const langs = availableLanguages();
  return (
    <label className="field settings__row">
      <span className="strong">{t("settings.interface_language")}</span>
      <select value={currentLanguage()} onChange={(e) => void setLanguage(e.target.value, true)}>
        {langs.map((l) => <option key={l.code} value={l.code}>{l.name}{l.name !== l.englishName ? ` · ${l.englishName}` : ""}{l.complete < 100 ? ` (${l.complete}%)` : ""}</option>)}
      </select>
    </label>
  );
}

function ThemeSetting() {
  const [themes, setThemes] = useState<ThemeInfo[] | null>(null);
  const [pref, setPref] = useState(themePreference());
  useEffect(() => { void listThemes().then(setThemes); }, []);
  const choose = (id: string) => { setPref(id); void setTheme(id, true); };
  const light = themes?.find((x) => x.id === "light");
  const dark = themes?.find((x) => x.id === "dark");
  return (
    <fieldset className="settings__row theme-set">
      <legend className="strong">{t("settings.theme")}</legend>
      {!themes ? <span className="muted small">{t("common.loading")}</span> : (
        <div className="theme-grid" role="radiogroup" aria-label={t("settings.theme")}>
          {light && dark && (
            <ThemeCard id={SYSTEM} name={t("settings.theme_system")} description={t("settings.theme_system_hint")} selected={pref === SYSTEM} onChoose={choose}
              preview={<div className="theme-prev theme-prev--split"><Preview swatches={light.swatches} /><Preview swatches={dark.swatches} /></div>} />
          )}
          {themes.map((th) => (
            <ThemeCard key={th.id} id={th.id} name={t(`theme.${th.id}.name`, undefined, th.name)} description={t(`theme.${th.id}.description`, undefined, th.description)} selected={pref === th.id} onChoose={choose}
              preview={<div className="theme-prev"><Preview swatches={th.swatches} /></div>} />
          ))}
        </div>
      )}
      <p className="field__hint">{t("settings.theme_hint")}</p>
    </fieldset>
  );
}

function ThemeCard({ id, name, description, selected, onChoose, preview }: { id: string; name: string; description: string; selected: boolean; onChoose: (id: string) => void; preview: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} className={selected ? "theme-card theme-card--on" : "theme-card"} onClick={() => onChoose(id)}>
      {preview}
      <span className="theme-card__name">{name}</span>
      {description && <span className="theme-card__desc">{description}</span>}
    </button>
  );
}

/** A miniature of the interface in the theme's own colours: sidebar, page, card, text, status colours. */
function Preview({ swatches }: { swatches: string[] }) {
  const [ground, surface, night, ink, accent, brand, up, down] = swatches;
  return (
    <svg viewBox="0 0 120 72" className="theme-prev__svg" aria-hidden="true">
      <rect width="120" height="72" fill={ground} />
      <rect width="30" height="72" fill={night} />
      <rect x="5" y="10" width="20" height="4" rx="2" fill={brand} />
      {[20, 28, 36].map((y) => <rect key={y} x="5" y={y} width="18" height="3" rx="1.5" fill={ink} opacity=".35" />)}
      <rect x="38" y="10" width="74" height="26" rx="4" fill={surface} />
      <rect x="44" y="16" width="36" height="4" rx="2" fill={ink} />
      <rect x="44" y="25" width="22" height="3" rx="1.5" fill={accent} />
      <rect x="38" y="42" width="35" height="22" rx="4" fill={surface} />
      <rect x="77" y="42" width="35" height="22" rx="4" fill={surface} />
      <circle cx="46" cy="53" r="3.5" fill={up} />
      <circle cx="85" cy="53" r="3.5" fill={down} />
      <rect x="53" y="51.5" width="14" height="3" rx="1.5" fill={ink} opacity=".5" />
      <rect x="92" y="51.5" width="14" height="3" rx="1.5" fill={ink} opacity=".5" />
    </svg>
  );
}

/** Default language of notifications, emails and reports (superadmins). */
function NotifyLanguage() {
  const [locale, setLocale] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { void api.get<{ locale: string }>("/settings/notify-locale").then((r) => setLocale(r.locale)); }, []);
  if (locale === null) return null;
  const change = async (v: string) => { setLocale(v); setSaved(false); await api.put("/settings/notify-locale", { locale: v }); setSaved(true); };
  return (
    <section className="card card--form">
      <h2>{t("settings.notify_language")}</h2>
      <p className="lead">{t("settings.notify_language_lead")}</p>
      <label className="field settings__row">
        <span className="strong">{t("settings.default_language")}</span>
        <LanguageSelect value={locale} onChange={(v) => void change(v)} />
        <span className="field__hint">{t("settings.default_language_hint")}</span>
        {saved && <span className="field__hint" role="status">{t("admin.changes_saved")}</span>}
      </label>
    </section>
  );
}

/** The organisation's Telegram bot: people receive on-call messages in their own chat with it. */
function TelegramBot() {
  const [state, setState] = useState<{ configured: boolean; botName: string | null } | null>(null);
  const [token, setToken] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const load = () => api.get<{ configured: boolean; botName: string | null }>("/settings/telegram").then(setState).catch(() => {});
  useEffect(() => { void load(); }, []);
  const save = async (botToken: string) => {
    setBusy(true); setFields({});
    try { setState(await api.put<{ configured: boolean; botName: string | null }>("/settings/telegram", { botToken })); setToken(""); }
    catch (err) { setFields(errorFields(err).fields); }
    finally { setBusy(false); }
  };
  return (
    <section className="card card--form">
      <h2>{t("telegram.title")}</h2>
      <p className="lead">{t("telegram.lead")}</p>
      {state?.configured && <p role="status"><span className="strong">{t("telegram.connected", { bot: `@${state.botName}` })}</span></p>}
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void save(token); }} noValidate>
        <Field label={t("telegram.token")} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} error={fields.botToken} hint={t("telegram.token_hint")} />
        <div className="form__actions">
          <button className="btn btn--primary" disabled={busy || !token.trim()}>{state?.configured ? t("telegram.replace") : t("telegram.connect")}</button>
          {state?.configured && <button type="button" className="btn btn--danger" disabled={busy} onClick={() => { if (confirm(t("telegram.confirm_remove"))) void save(""); }}>{t("status_pages.remove")}</button>}
        </div>
      </form>
    </section>
  );
}

type RetentionKey = "checkResultsDays" | "hourlyDays" | "dailyDays" | "statusHistoryDays" | "incidentsDays" | "deliveriesDays" | "auditDays" | "maintenanceDays" | "trapsDays";
const FOREVER_ALLOWED: RetentionKey[] = ["dailyDays", "statusHistoryDays", "incidentsDays", "deliveriesDays", "auditDays", "maintenanceDays", "trapsDays"];
const RETENTION_ORDER: RetentionKey[] = ["checkResultsDays", "hourlyDays", "dailyDays", "statusHistoryDays", "incidentsDays", "deliveriesDays", "auditDays", "maintenanceDays", "trapsDays"];

/** How long each kind of data is kept, and how much space it takes. */
function RetentionCard() {
  const [data, setData] = useState<{ settings: Record<RetentionKey, number>; defaults: Record<RetentionKey, number>; sizes: Record<RetentionKey, { bytes: number; rows: number }>; lastCleanup: { at: string; deleted: Record<string, number> } | null } | null>(null);
  const [f, setF] = useState<Record<RetentionKey, number> | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const load = () => api.get<NonNullable<typeof data>>("/settings/retention").then((d) => { setData(d); setF(d.settings); }).catch(() => {});
  useEffect(() => { void load(); }, []);
  if (!data || !f) return null;
  const save = async () => {
    setFields({}); setSaved(false);
    try { await api.put("/settings/retention", f); setSaved(true); void load(); }
    catch (e) { setFields(errorFields(e).fields); }
  };
  const total = Object.values(data.sizes).reduce((a, b) => a + b.bytes, 0);
  return (
    <section className="card retention">
      <h2>{t("retention.title")}</h2>
      <p className="lead">{t("retention.lead", { size: size(total) })}</p>
      <table className="table">
        <thead><tr><th>{t("retention.data")}</th><th>{t("retention.keep")}</th><th className="num">{t("backups.col.size")}</th></tr></thead>
        <tbody>{RETENTION_ORDER.map((k) => {
          const forever = f[k] === 0;
          return (
            <tr key={k}>
              <td><span className="strong">{t(`retention.cat.${k}`)}</span><div className="small muted">{t(`retention.hint.${k}`)}</div>{fields[k] && <div className="field__error">{fields[k]}</div>}</td>
              <td className="nowrap">
                {FOREVER_ALLOWED.includes(k) && <label className="check small"><input type="checkbox" checked={forever} onChange={(e) => setF({ ...f, [k]: e.target.checked ? 0 : (data.defaults[k] || 365) })} />{t("retention.forever")}</label>}
                {!forever && <label className="small"><input type="number" min={1} max={3650} className="input--narrow" value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} aria-label={t(`retention.cat.${k}`)} /> {t("retention.days")}</label>}
              </td>
              <td className="num small">{size(data.sizes[k]?.bytes ?? 0)}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <div className="form__actions"><button className="btn btn--primary" onClick={() => void save()}>{t("common.save")}</button>{saved && <span className="field__hint" role="status">{t("admin.changes_saved")}</span>}</div>
      <p className="small muted">{data.lastCleanup ? t("retention.last_run", { date: new Date(data.lastCleanup.at).toLocaleString(), count: Object.values(data.lastCleanup.deleted).reduce((a, b) => a + b, 0) }) : t("retention.never_run")}</p>
    </section>
  );
}

/** How this browser reaches Fudo: HTTPS and HTTP/2, or a warning. */
function ConnectionCard() {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const proto = nav?.nextHopProtocol ?? "";
  const https = location.protocol === "https:";
  const modern = proto === "h2" || proto === "h3";
  const [tone, text] = !https ? ["banner--warn", t("connection.plain")]
    : modern ? ["", t("connection.good", { protocol: proto === "h3" ? "HTTP/3" : "HTTP/2" })]
    : ["banner--warn", t("connection.http1")];
  return (
    <section className="card card--form">
      <h2>{t("connection.title")}</h2>
      <p className={tone ? `banner ${tone}` : "lead"} role="note">{text}</p>
      {(!https || !modern) && <p className="small muted">{t("connection.how")}</p>}
    </section>
  );
}
