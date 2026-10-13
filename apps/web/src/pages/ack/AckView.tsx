import { useEffect, useState } from "react";
import type { MsgPart } from "@fudo/shared";
import { t, tmsg, uiLocale } from "../../i18n";
import { Mark } from "../../components/Brand";
import { FormError } from "../../components/Field";

interface AckInfo {
  state: "ok" | "expired" | "used" | "acknowledged" | "resolved";
  person: string;
  acknowledgedBy: string | null;
  incident: { id: string; key: string; title: string; titleParts: MsgPart[] | null; severity: string; entityName: string; openedAt: string };
}

/**
 * /ack/<token> from an on-call message. Opening it only shows the incident (link previews and email
 * scanners open links on their own); the button acknowledges it, as the person who was paged.
 */
export function AckView({ token: initial }: { token: string }) {
  // keep the token in memory only: out of the address bar and the browser history
  const [token] = useState(initial);
  useEffect(() => { history.replaceState(null, "", "/ack"); }, []);
  const [info, setInfo] = useState<AckInfo | null>(null);
  const [state, setState] = useState<"loading" | "invalid" | "ready" | "done">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headers = { "content-type": "application/json", "x-fudo-lang": document.documentElement.lang };

  useEffect(() => {
    void fetch(`/api/ack/${encodeURIComponent(token)}`, { headers }).then(async (r) => {
      if (!r.ok) return setState("invalid");
      setInfo(await r.json()); setState("ready");
    }).catch(() => setState("invalid"));
  }, [token]);

  const ack = async () => {
    setBusy(true); setError(null);
    const r = await fetch(`/api/ack/${encodeURIComponent(token)}`, { method: "POST", headers, body: "{}" }).catch(() => null);
    setBusy(false);
    if (r?.ok) { setState("done"); return; }
    setError(r ? ((await r.json().catch(() => ({}))) as { message?: string }).message ?? t("ack.failed") : t("ack.failed"));
  };

  const i = info?.incident;
  return (
    <div className="sp ack">
      <main className="sp__main ack__main">
        <div className="sp__brand"><Mark size={28} /><h1>{t("ack.title")}</h1></div>
        {state === "loading" && <p className="sp__note" role="status">{t("common.loading")}</p>}
        {state === "invalid" && <p className="sp__note">{t("ack.invalid")}</p>}
        {i && state !== "invalid" && (
          <section className="ack__card">
            <div className="strong">{i.key} · {tmsg(i.titleParts, i.title)}</div>
            <dl className="facts">
              <dt>{t("pm.f.item")}</dt><dd>{i.entityName}</dd>
              <dt>{t("pm.f.severity")}</dt><dd>{t(`severity.${i.severity}`)}</dd>
              <dt>{t("pm.f.opened")}</dt><dd>{new Date(i.openedAt).toLocaleString(uiLocale(), { dateStyle: "medium", timeStyle: "short" })}</dd>
            </dl>
            <FormError message={error} />
            {state === "done" ? (
              <p className="ack__done" role="status">{t("ack.done")}</p>
            ) : info!.state === "ok" ? (
              <>
                <p className="small muted">{t("ack.as", { name: info!.person })}</p>
                <button className="btn btn--primary ack__button" onClick={() => void ack()} disabled={busy}>{t("notify.oncall.ack_action")}</button>
              </>
            ) : (
              <p role="status">{info!.state === "acknowledged" ? t("ack.already", { name: info!.acknowledgedBy ?? "—" }) : info!.state === "resolved" ? t("ack.resolved") : info!.state === "used" ? t("ack.used") : t("ack.expired")}</p>
            )}
            <p className="small"><a href={`/incidents/${i.id}`}>{t("notify.oncall.open_action")}</a></p>
          </section>
        )}
      </main>
    </div>
  );
}
