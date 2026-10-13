import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { TeamDto, TenantPermissions } from "@fudo/shared";
import { t } from "../../i18n";
import { api, errorFields } from "../../api";
import { PageHeader } from "../../components/AppShell";
import { Link } from "../../router";
import { Dialog } from "../../components/Dialog";
import { Field, FormError } from "../../components/Field";
import { Pill } from "../../components/Status";
import { OncallEditor } from "./Oncall";

export function TeamsPage({ perms, isGlobal }: { perms: TenantPermissions; isGlobal: boolean }) {
  const [teams, setTeams] = useState<TeamDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TeamDto | "new" | null>(null);
  const [oncall, setOncall] = useState<TeamDto | null>(null);
  const load = useCallback(() => api.get<TeamDto[]>("/teams").then(setTeams).catch((e) => setError(errorFields(e).message)), []);
  useEffect(() => { void load(); }, [load]);
  const own = (x: TeamDto) => (x.scope === "global") === isGlobal;
  return (
    <>
      <PageHeader help="users-and-access" title={t("teams.title")}>{perms.manage && <button className="btn btn--primary" onClick={() => setEditing("new")}>{t("teams.new")}</button>}</PageHeader>
      <div className="content">
        <FormError message={error} />
        <p className="muted small">{t("teams.lead")}</p>
        {teams && teams.length === 0 && <section className="card empty"><p>{t("teams.none")}</p></section>}
        <div className="team-grid">
          {teams?.map((x) => (
            <section key={x.id} className="card team">
              <div className="team__head">
                <h2>{x.name}{x.scope === "global" && !isGlobal && <span className="scope-badge">{t("common.global")}</span>}</h2>
                {own(x) && perms.manage && <div className="row-actions"><button className="btn btn--small" onClick={() => setEditing(x)}>{t("common.edit")}</button>
                  <button className="btn btn--small btn--danger" onClick={async () => { if (confirm(t("teams.confirm_delete", { name: x.name }))) { try { await api.del(`/teams/${x.id}`); void load(); } catch (e) { setError(errorFields(e).message); } } }}>{t("common.delete")}</button></div>}
              </div>
              {x.description && <p className="muted small">{x.description}</p>}
              <ul className="team__people">
                {x.members.map((m) => <li key={m.userId}><span>{m.name}</span>{m.role === "lead" && <Pill tone="info">{t("teams.role_lead")}</Pill>}</li>)}
                {x.members.length === 0 && <li className="muted">{t("teams.no_members")}</li>}
              </ul>
              <p className="small oncall-line">{x.onCall ? <><span className="muted">{t("oncall.now")}:</span> <span className="strong">{x.onCall.name}</span></> : <span className="muted">{t("oncall.not_set")}</span>}
                {" "}<button className="btn btn--small" onClick={() => setOncall(x)}>{t("oncall.title")}</button></p>
              {x.owns.length > 0 && <div className="small"><span className="muted">{t("teams.owns")}: </span>{x.owns.map((o, n) => <span key={o.id}>{n > 0 && ", "}<Link href={`/${o.type === "application" ? "applications" : "assets"}/${o.id}`}>{o.name}</Link></span>)}</div>}
            </section>
          ))}
        </div>
      </div>
      <Dialog wide title={oncall ? t("oncall.title_team", { team: oncall.name }) : ""} open={oncall !== null} onClose={() => { setOncall(null); void load(); }}>
        {oncall && <OncallEditor teamId={oncall.id} canManage={perms.manage && own(oncall)} />}
      </Dialog>
      <Dialog title={editing === "new" ? t("teams.new") : t("teams.edit")} open={editing !== null} onClose={() => setEditing(null)}>
        {editing && <TeamForm team={editing === "new" ? undefined : editing} onSaved={() => { setEditing(null); void load(); }} />}
      </Dialog>
    </>
  );
}

function TeamForm({ team, onSaved }: { team?: TeamDto; onSaved: () => void }) {
  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [members, setMembers] = useState(team?.members.map((m) => ({ userId: m.userId, role: m.role })) ?? []);
  const [people, setPeople] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { void api.get<Array<{ id: string; name: string; email: string }>>("/teams/candidates").then(setPeople).catch(() => {}); }, []);
  const who = (id: string) => people.find((p) => p.id === id);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setFields({}); setMessage(null);
    try { if (team) await api.put(`/teams/${team.id}`, { name, description, members }); else await api.post("/teams", { name, description, members }); onSaved(); }
    catch (err) { const x = errorFields(err); setFields(x.fields); if (!Object.keys(x.fields).length) setMessage(x.message); }
  };
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <Field label={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} error={fields.name} placeholder={t("teams.name_placeholder")} />
      <Field label={t("status_pages.description")} value={description} onChange={(e) => setDescription(e.target.value)} />
      <fieldset className="matrix"><legend>{t("teams.members_n", { count: members.length })}</legend>
        {members.map((m, n) => (
          <div key={m.userId} className="step-row">
            <span className="team-member">{who(m.userId)?.name ?? "…"} <span className="muted small">{who(m.userId)?.email}</span></span>
            <select value={m.role} onChange={(e) => setMembers(members.map((x, j) => (j === n ? { ...x, role: e.target.value as "lead" } : x)))} aria-label={t("teams.role")}>
              <option value="member">{t("teams.role_member")}</option><option value="lead">{t("teams.role_lead")}</option>
            </select>
            <button type="button" className="btn btn--small" onClick={() => setMembers(members.filter((_, j) => j !== n))}>{t("status_pages.remove")}</button>
          </div>
        ))}
        <select className="input" value="" onChange={(e) => e.target.value && setMembers([...members, { userId: e.target.value, role: "member" }])} aria-label={t("teams.add_member")}>
          <option value="">{t("teams.add_member")}</option>
          {people.filter((p) => !members.some((m) => m.userId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
        </select>
        <p className="field__hint">{t("teams.members_hint")}</p>
      </fieldset>
      <div className="row-actions row-actions--end"><button className="btn btn--primary">{team ? t("common.save_changes") : t("teams.create")}</button></div>
    </form>
  );
}
