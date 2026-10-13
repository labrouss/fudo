import { useCallback, useEffect, useState } from "react";
import type { PublicStatus, SetupStatusResponse, StatusPageView } from "@fudo/shared";
import { t, tmsg, uiLocale } from "../../i18n";
import { Mark } from "../../components/Brand";
import { Login } from "../Login";

const LABEL: Record<PublicStatus, string> = { operational: "status_page.operational", degraded: "status_page.degraded", outage: "status_page.outage", maintenance: "status_page.maintenance", unknown: "status_page.no_data" };
const BANNER: Record<PublicStatus, string> = { operational: "status_page.banner.operational", degraded: "status_page.banner.degraded", outage: "status_page.banner.outage", maintenance: "status_page.banner.maintenance", unknown: "status_page.banner.operational" };
const time = (iso: string) => new Date(iso).toLocaleString(uiLocale(), { dateStyle: "medium", timeStyle: "short" });
const pctText = (p: number | null) => (p === null ? "—" : `${p >= 99.995 ? "100" : p.toFixed(2)}%`);
/** One day of the 90-day bar: no data, perfect, a small dip or a real outage. */
const dayTone = (pct: number | null) => (pct === null ? "none" : pct >= 99.95 ? "up" : pct >= 99 ? "dip" : "down");

/** A status page at /status/<slug>: public ones for anyone, internal ones after signing in. */
export function StatusView({ slug }: { slug: string }) {
  const [view, setView] = useState<StatusPageView | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "signin" | "forbidden" | "error">("loading");
  const [org, setOrg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/status/${encodeURIComponent(slug)}`, { headers: { "x-fudo-lang": document.documentElement.lang } });
      if (res.status === 404) return setState("missing");
      if (res.status === 401) {
        const s = await fetch("/api/setup/status").then((r) => r.json() as Promise<SetupStatusResponse>).catch(() => null);
        setOrg(s?.orgName ?? null);
        return setState("signin");
      }
      if (res.status === 403) return setState("forbidden");
      if (!res.ok) return setState("error");
      const v = (await res.json()) as StatusPageView;
      setView(v); setState("ok");
      document.title = v.title;
    } catch { setState("error"); }
  }, [slug]);
  useEffect(() => { void load(); const id = setInterval(() => void load(), 60_000); return () => clearInterval(id); }, [load]);

  if (state === "signin") return <Login org={org} onSignedIn={() => void load()} />;
  if (state !== "ok" || !view) {
    const msg = state === "loading" ? t("common.loading") : state === "missing" ? t("status_page.not_found") : state === "forbidden" ? t("status_page.no_access") : t("status_page.unavailable");
    return <div className="sp"><main className="sp__main"><p className="sp__note" role="status">{msg}</p></main></div>;
  }

  return (
    <div className="sp">
      <header className="sp__head">
        <div className="sp__brand"><Mark size={28} /><h1>{view.title}</h1></div>
        {view.visibility === "internal" && <span className="scope-badge">{t("status_page.internal")}</span>}
      </header>
      <main className="sp__main">
        {view.description && <p className="sp__desc">{view.description}</p>}
        <div className={`sp__banner sp__banner--${view.overall}`} role="status">{t(BANNER[view.overall])}</div>

        {view.incidents.length > 0 && (
          <section className="sp__section">
            <h2>{t("status_page.current_incidents")}</h2>
            {view.incidents.map((i, n) => (
              <div key={n} className={`sp__event sp__event--${i.status}`}>
                <div className="strong">{i.labels.join(", ")} · {t(LABEL[i.status])}</div>
                {i.title && <div>{tmsg(i.titleParts, i.title)}</div>}
                <div className="small muted">{t("status_page.since", { time: time(i.since) })} · {i.acknowledged ? t("status_page.being_worked_on") : t("status_page.investigating")}</div>
              </div>
            ))}
          </section>
        )}

        {view.groups.map((g) => (
          <section key={g.name} className="sp__section">
            {g.name && <h2>{g.name}</h2>}
            <ul className="sp__items">
              {g.items.map((i, n) => (
                <li key={n} className="sp__item">
                  <div className="sp__row">
                    <span className="strong">{i.label}</span>
                    <span className={`sp__status sp__status--${i.status}`}>{t(LABEL[i.status])}</span>
                  </div>
                  {i.days && (
                    <>
                      <div className="sp__bars" role="img" aria-label={t("status_page.history_label", { pct: pctText(i.pct90) })}>
                        {i.days.map((d) => <span key={d.date} className={`sp__bar sp__bar--${dayTone(d.pct)}`} title={`${new Date(`${d.date}T12:00:00Z`).toLocaleDateString(uiLocale(), { dateStyle: "medium", timeZone: "UTC" })}: ${d.pct === null ? t("status_page.no_data") : pctText(d.pct)}`} />)}
                      </div>
                      <div className="sp__scale small muted"><span>{t("status_page.days_ago", { n: 90 })}</span><span>{t("status_page.availability", { pct: pctText(i.pct90) })}</span><span>{t("status_page.today")}</span></div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {view.maintenance.length > 0 && (
          <section className="sp__section">
            <h2>{t("status_page.maintenance_title")}</h2>
            {view.maintenance.map((m, n) => (
              <div key={n} className="sp__event sp__event--maintenance">
                <div className="strong">{m.labels.join(", ")}{m.active && <span className="sp__status sp__status--maintenance">{t("status_page.in_progress")}</span>}</div>
                {m.name && <div>{m.name}</div>}
                <div className="small muted">{time(m.startsAt)} – {time(m.endsAt)}</div>
              </div>
            ))}
          </section>
        )}
      </main>
      <footer className="sp__foot small muted">{t("status_page.updated", { time: time(view.generatedAt) })} · Fudo</footer>
    </div>
  );
}
