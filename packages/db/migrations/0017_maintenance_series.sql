-- 0017: recurring maintenance. A series holds the rule; the API and the worker create its
-- windows ahead of time (maintenance_windows.series_id), so everything that reads windows
-- (alerts, availability, "impacted by maintenance") works unchanged.
CREATE TABLE maintenance_series (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  rule        jsonb NOT NULL,
  targets     jsonb NOT NULL,
  -- occurrences skipped or moved by hand (their original start), never created again
  skipped     timestamptz[] NOT NULL DEFAULT '{}',
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE maintenance_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_series FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON maintenance_series USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id));
CREATE POLICY global_read ON maintenance_series FOR SELECT USING (fudo_global_readable(tenant_id));

ALTER TABLE maintenance_windows ADD COLUMN series_id uuid REFERENCES maintenance_series(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX maintenance_windows_series_start ON maintenance_windows (series_id, starts_at) WHERE series_id IS NOT NULL;
