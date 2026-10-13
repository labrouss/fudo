-- 0005: shared infrastructure (global scope), applications, dependencies, maintenance windows

-- Tenant context may now also be 'global' (infrastructure scope, rows with tenant_id NULL).
CREATE OR REPLACE FUNCTION fudo_tenant_ok(t uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN current_setting('fudo.all_tenants', true) = 'on' THEN true
    WHEN t IS NULL THEN coalesce(current_setting('fudo.tenant_id', true), '') = 'global'
    WHEN coalesce(current_setting('fudo.tenant_id', true), '') ~ '^[0-9a-fA-F-]{36}$' THEN t = current_setting('fudo.tenant_id', true)::uuid
    ELSE false
  END
$$;
-- Any request with a tenant context may READ global rows (tenants see shared infrastructure, never edit it).
CREATE FUNCTION fudo_global_readable(t uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT t IS NULL AND coalesce(current_setting('fudo.tenant_id', true), '') <> ''
$$;

CREATE TABLE assets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = global/shared
  name              text NOT NULL,
  kind              text NOT NULL DEFAULT 'other',
  description       text NOT NULL DEFAULT '',
  location          text NOT NULL DEFAULT '',
  address           text NOT NULL DEFAULT '',
  tags              text[] NOT NULL DEFAULT '{}',
  status            text NOT NULL DEFAULT 'UNKNOWN',
  status_changed_at timestamptz,
  cause             jsonb,
  at_risk           jsonb,
  summary           text NOT NULL DEFAULT '',
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX assets_name_uq ON assets (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

ALTER TABLE monitors ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE monitors
  ADD COLUMN asset_id         uuid REFERENCES assets(id) ON DELETE SET NULL,
  ADD COLUMN effective_status text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN cause            jsonb,
  ADD COLUMN at_risk          jsonb;
CREATE INDEX monitors_asset_idx ON monitors (asset_id);

ALTER TABLE check_results ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE check_results ADD COLUMN in_maintenance boolean NOT NULL DEFAULT false;
ALTER TABLE state_changes ADD COLUMN cause jsonb;

CREATE TABLE applications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              text NOT NULL,
  description       text NOT NULL DEFAULT '',
  owner             text NOT NULL DEFAULT '',
  criticality       text NOT NULL DEFAULT 'medium' CHECK (criticality IN ('low','medium','high','critical')),
  aggregation       text NOT NULL DEFAULT 'all' CHECK (aggregation IN ('all','any','n_of_m')),
  min_up            integer NOT NULL DEFAULT 1 CHECK (min_up >= 1),
  sla_target        numeric(6,3) NOT NULL DEFAULT 99.9 CHECK (sla_target > 0 AND sla_target <= 100),
  status            text NOT NULL DEFAULT 'UNKNOWN',
  status_changed_at timestamptz,
  cause             jsonb,
  at_risk           jsonb,
  summary           text NOT NULL DEFAULT '',
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX applications_name_uq ON applications (tenant_id, lower(name));

CREATE TABLE application_members (
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  monitor_id     uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  tenant_id      uuid NOT NULL,
  required       boolean NOT NULL DEFAULT true,
  PRIMARY KEY (application_id, monitor_id)
);

-- "from" depends on the asset "to". Owner scope = the from-entity's tenant (NULL for global).
CREATE TABLE dependencies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid,
  from_type   text NOT NULL CHECK (from_type IN ('asset','monitor','application')),
  from_id     uuid NOT NULL,
  to_asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_type, from_id, to_asset_id)
);
CREATE INDEX dependencies_to_idx ON dependencies (to_asset_id);

CREATE TABLE maintenance_windows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX maintenance_windows_time_idx ON maintenance_windows (starts_at, ends_at);

CREATE TABLE maintenance_targets (
  window_id   uuid NOT NULL REFERENCES maintenance_windows(id) ON DELETE CASCADE,
  tenant_id   uuid,
  entity_type text NOT NULL CHECK (entity_type IN ('asset','monitor','application')),
  entity_id   uuid NOT NULL,
  PRIMARY KEY (window_id, entity_type, entity_id)
);

-- Row-level security: own scope read/write, global rows readable from any tenant context.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['assets','applications','application_members','dependencies','maintenance_windows','maintenance_targets'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id))', tbl);
  END LOOP;
  FOREACH tbl IN ARRAY ARRAY['assets','monitors','state_changes','dependencies','maintenance_windows','maintenance_targets'] LOOP
    EXECUTE format('CREATE POLICY global_read ON %I FOR SELECT USING (fudo_global_readable(tenant_id))', tbl);
  END LOOP;
END $$;
