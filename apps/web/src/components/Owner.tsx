import { useEffect, useState } from "react";
import type { OwnerDto } from "@fudo/shared";
import { t } from "../i18n";
import { api, errorFields } from "../api";
import { Link } from "../router";
import { FormError } from "./Field";

/** Owner team of an application or asset, chosen among the teams of its scope. */
export function OwnerCard({ type, id, canManage }: { type: "application" | "asset"; id: string; canManage: boolean }) {
  const [data, setData] = useState<{ owner: OwnerDto | null; options: Array<{ id: string; name: string }>; editable: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api.get<NonNullable<typeof data>>(`/ownership/${type}/${id}`).then(setData).catch((e) => setError(errorFields(e).message));
  useEffect(() => { void load(); }, [type, id]);
  if (!data) return null;
  const set = async (teamId: string) => { setError(null); try { await api.put(`/ownership/${type}/${id}`, { teamId: teamId || null }); await load(); } catch (e) { setError(errorFields(e).message); } };
  const o = data.owner;
  return (
    <section className="card">
      <h2>{t("teams.owner")}</h2>
      <FormError message={error} />
      {o ? (
        <p><span className="strong">{o.team}</span>
          {o.leads.length > 0 && <> · {t("teams.lead_names", { names: o.leads.join(", ") })}</>}
          {o.members.length > 0 && <span className="muted"> · {t("teams.member_names", { names: o.members.join(", ") })}</span>}</p>
      ) : <p className="muted">{t("teams.no_owner")}</p>}
      {canManage && data.editable && (
        data.options.length === 0
          ? <p className="small muted"><Link href="/teams">{t("teams.create_first")}</Link></p>
          : <label className="field"><span>{t("teams.owner_team")}</span>
              <select value={o?.teamId ?? ""} onChange={(e) => void set(e.target.value)}>
                <option value="">{t("teams.no_owner_option")}</option>
                {data.options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
      )}
    </section>
  );
}
