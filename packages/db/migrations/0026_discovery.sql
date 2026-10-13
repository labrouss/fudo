-- 0026: discovery. A run scans a source (a subnet, vCenter, switch neighbours, OneView) from the
-- worker and keeps what it found for review; nothing is created until someone chooses to.
-- Global infrastructure scope only (tenant_id stays NULL): scanning networks is for infra admins.
CREATE TABLE discovery_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid REFERENCES tenants(id) ON DELETE CASCADE,
  source       text NOT NULL CHECK (source IN ('subnet', 'vcenter', 'lldp', 'oneview')),
  name         text NOT NULL DEFAULT '',
  params       jsonb NOT NULL DEFAULT '{}',          -- never secrets: shared credentials by id
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelling', 'cancelled')),
  total        integer NOT NULL DEFAULT 0,
  done         integer NOT NULL DEFAULT 0,
  found        integer NOT NULL DEFAULT 0,
  error        text,
  started_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
CREATE INDEX discovery_runs_created ON discovery_runs (created_at DESC);
ALTER TABLE discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON discovery_runs USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id));

CREATE TABLE discovery_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
  tenant_id    uuid REFERENCES tenants(id) ON DELETE CASCADE,
  key          text NOT NULL,                          -- unique per run: address, or the source's id
  address      text NOT NULL DEFAULT '',
  name         text NOT NULL DEFAULT '',
  category     text NOT NULL DEFAULT 'other',          -- what it looks like: bmc, esxi, vcenter, switch, …
  vendor       text NOT NULL DEFAULT '',
  model        text NOT NULL DEFAULT '',
  os           text NOT NULL DEFAULT '',
  template     text NOT NULL DEFAULT '',               -- suggested monitor template ('' = ping only)
  asset_kind   text NOT NULL DEFAULT 'other',
  parent_key   text,                                   -- e.g. a VM's host, a blade's frame
  depends_on   text[] NOT NULL DEFAULT '{}',           -- keys of results it depends on
  details      jsonb NOT NULL DEFAULT '{}',            -- open ports, SNMP sysDescr, neighbours, …
  UNIQUE (run_id, key)
);
ALTER TABLE discovery_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_results FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON discovery_results USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id));
