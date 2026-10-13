-- 0018: status pages. Public ones are readable without signing in at /status/<slug>;
-- they show only the display labels chosen here, never internal names.
CREATE TABLE status_pages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
  slug            text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$'),
  title           text NOT NULL,
  description     text NOT NULL DEFAULT '',
  visibility      text NOT NULL CHECK (visibility IN ('public', 'internal')),
  show_history    boolean NOT NULL DEFAULT true,
  show_incidents  boolean NOT NULL DEFAULT true,
  show_maintenance boolean NOT NULL DEFAULT true,
  -- [{ type: application|asset|monitor, id, label, group? }] in display order
  items           jsonb NOT NULL,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE status_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_pages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON status_pages USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id));
CREATE POLICY global_read ON status_pages FOR SELECT USING (fudo_global_readable(tenant_id));
