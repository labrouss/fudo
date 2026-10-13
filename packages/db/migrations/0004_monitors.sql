-- 0004: monitors, check results, state changes, row-level security (F-106)

-- Tenant isolation predicate. Sessions set either
--   fudo.tenant_id    = '<uuid>'  (API, per transaction)  or
--   fudo.all_tenants  = 'on'      (worker, superadmin maintenance)
CREATE FUNCTION fudo_tenant_ok(t uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('fudo.all_tenants', true) = 'on'
      OR t = NULLIF(current_setting('fudo.tenant_id', true), '')::uuid
$$;

CREATE TABLE monitors (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  type                 text NOT NULL,
  config               jsonb NOT NULL DEFAULT '{}',
  interval_s           integer NOT NULL DEFAULT 60 CHECK (interval_s BETWEEN 20 AND 86400),
  retry_interval_s     integer NOT NULL DEFAULT 30 CHECK (retry_interval_s BETWEEN 10 AND 86400),
  timeout_s            integer NOT NULL DEFAULT 10 CHECK (timeout_s BETWEEN 1 AND 120),
  failures_before_down integer NOT NULL DEFAULT 3 CHECK (failures_before_down BETWEEN 1 AND 10),
  successes_before_up  integer NOT NULL DEFAULT 1 CHECK (successes_before_up BETWEEN 1 AND 10),
  paused               boolean NOT NULL DEFAULT false,
  tags                 text[] NOT NULL DEFAULT '{}',
  description          text NOT NULL DEFAULT '',
  push_token           text UNIQUE,
  -- live state, maintained by the scheduler
  status               text NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN ('UNKNOWN','UP','DEGRADED','DOWN')),
  fail_streak          integer NOT NULL DEFAULT 0,
  success_streak       integer NOT NULL DEFAULT 0,
  status_changed_at    timestamptz,
  last_check_at        timestamptz,
  last_latency_ms      real,
  last_message         text,
  last_push_at         timestamptz,
  next_run_at          timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX monitors_tenant_idx ON monitors (tenant_id, name);
CREATE INDEX monitors_due_idx ON monitors (next_run_at) WHERE NOT paused;

-- Raw result of every check. No primary key: TimescaleDB hypertables need the time column in unique indexes.
CREATE TABLE check_results (
  ts          timestamptz NOT NULL DEFAULT now(),
  monitor_id  uuid NOT NULL,
  tenant_id   uuid NOT NULL,
  status      text NOT NULL,
  latency_ms  real,
  message     text,
  data        jsonb
);
CREATE INDEX check_results_monitor_ts_idx ON check_results (monitor_id, ts DESC);

-- Status transitions of any entity (monitors now; applications/assets in Phase 3). Feeds incidents in Phase 4.
CREATE TABLE state_changes (
  id           bigserial PRIMARY KEY,
  ts           timestamptz NOT NULL DEFAULT now(),
  tenant_id    uuid,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  from_status  text NOT NULL,
  to_status    text NOT NULL,
  message      text,
  cause_entity_id uuid
);
CREATE INDEX state_changes_entity_idx ON state_changes (entity_type, entity_id, ts DESC);
CREATE INDEX state_changes_tenant_idx ON state_changes (tenant_id, ts DESC);

-- Row-level security. FORCE makes it apply to the table owner (the application role) as well.
ALTER TABLE monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitors FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON monitors USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id));

ALTER TABLE state_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE state_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON state_changes USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id));

-- check_results becomes a hypertable with 30-day retention when TimescaleDB is present.
-- It is read only through monitor ids that already passed RLS on monitors.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('check_results', 'ts', chunk_time_interval => INTERVAL '1 day');
    PERFORM add_retention_policy('check_results', INTERVAL '30 days');
  END IF;
END $$;
