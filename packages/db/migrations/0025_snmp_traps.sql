-- 0025: SNMP traps. Every trap received (kept per Settings › Data retention), and the problems trap
-- monitors have open. A trap belongs to the scope of the monitor (or asset) it matched; traps nobody
-- claims are kept without a tenant (Global infrastructure scope) so admins can create a monitor.
CREATE TABLE snmp_traps (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  ts          timestamptz NOT NULL DEFAULT now(),
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  monitor_id  uuid REFERENCES monitors(id) ON DELETE SET NULL,
  asset_id    uuid REFERENCES assets(id) ON DELETE SET NULL,
  source      text NOT NULL,
  version     text NOT NULL,
  trap_oid    text NOT NULL,
  trap_name   text,
  fields      jsonb NOT NULL DEFAULT '[]',
  action      text,                    -- what the monitor did: problem, clear, ignored (NULL: no monitor)
  PRIMARY KEY (id)
);
CREATE INDEX snmp_traps_ts ON snmp_traps (ts);
CREATE INDEX snmp_traps_tenant_ts ON snmp_traps (tenant_id, ts DESC);
CREATE INDEX snmp_traps_monitor_ts ON snmp_traps (monitor_id, ts DESC) WHERE monitor_id IS NOT NULL;
ALTER TABLE snmp_traps ENABLE ROW LEVEL SECURITY;
ALTER TABLE snmp_traps FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON snmp_traps USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id));

CREATE TABLE snmp_trap_problems (
  monitor_id  uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  key         text NOT NULL,           -- trap and interface: linkDown#12
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  label       text NOT NULL,           -- trap name or OID
  source      text NOT NULL,
  detail      text NOT NULL DEFAULT '',
  first_at    timestamptz NOT NULL DEFAULT now(),
  last_at     timestamptz NOT NULL DEFAULT now(),
  count       integer NOT NULL DEFAULT 1,
  PRIMARY KEY (monitor_id, key)
);
ALTER TABLE snmp_trap_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE snmp_trap_problems FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON snmp_trap_problems USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id));
