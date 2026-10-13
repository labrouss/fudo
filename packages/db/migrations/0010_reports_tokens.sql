-- 0010: scheduled reports (F-601) and API tokens (F-603)

CREATE TABLE report_schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,   -- NULL = global (shared infrastructure) report
  name            text NOT NULL,
  period          text NOT NULL CHECK (period IN ('weekly','monthly')),
  send_hour       integer NOT NULL DEFAULT 7 CHECK (send_hour BETWEEN 0 AND 23),
  timezone        text NOT NULL DEFAULT 'UTC',
  recipients      text[] NOT NULL,
  formats         text[] NOT NULL DEFAULT '{pdf,csv}',
  business_hours  jsonb,                 -- { days: [1..7], start: "08:00", end: "18:00" } or NULL
  enabled         boolean NOT NULL DEFAULT true,
  next_run_at     timestamptz NOT NULL,
  last_run_at     timestamptz,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_schedules_due_idx ON report_schedules (next_run_at) WHERE enabled;

CREATE TABLE report_runs (
  id           bigserial PRIMARY KEY,
  schedule_id  uuid REFERENCES report_schedules(id) ON DELETE CASCADE,
  tenant_id    uuid,
  period_from  timestamptz NOT NULL,
  period_to    timestamptz NOT NULL,
  status       text NOT NULL CHECK (status IN ('sent','failed')),
  detail       text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_runs_schedule_idx ON report_runs (schedule_id, created_at DESC);

-- Bearer tokens for scripts and integrations; only a SHA-256 of the token is stored.
CREATE TABLE api_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = global scope
  name          text NOT NULL,
  prefix        text NOT NULL,           -- first characters, to recognise a token in lists and logs
  token_hash    text NOT NULL UNIQUE,
  permission    text NOT NULL CHECK (permission IN ('read','operate','manage')),
  expires_at    timestamptz,
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['report_schedules','report_runs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id))', tbl);
  END LOOP;
END $$;
-- api_tokens has no RLS: tokens are looked up by hash before any tenant context exists;
-- the API filters by scope explicitly when listing and managing them.
