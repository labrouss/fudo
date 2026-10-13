-- 0020: teams (per tenant, or global for shared infrastructure) and owner teams of applications
-- and assets. On-call rotations build on teams (next step).
CREATE TABLE teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- one name per scope (NULL = global)
CREATE UNIQUE INDEX teams_scope_name ON teams (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

CREATE TABLE team_members (
  team_id   uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'lead')),
  PRIMARY KEY (team_id, user_id)
);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['teams', 'team_members'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id))', tbl);
    EXECUTE format('CREATE POLICY global_read ON %I FOR SELECT USING (fudo_global_readable(tenant_id))', tbl);
  END LOOP;
END $$;

ALTER TABLE applications ADD COLUMN owner_team_id uuid REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE assets ADD COLUMN owner_team_id uuid REFERENCES teams(id) ON DELETE SET NULL;
