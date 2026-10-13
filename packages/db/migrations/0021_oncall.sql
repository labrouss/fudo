-- 0021: on-call. One schedule per team (rotation + escalation steps), overrides, and the people
-- paged per incident (each followed through their own notification steps until acknowledged).
CREATE TABLE oncall_schedules (
  team_id        uuid PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  tenant_id      uuid REFERENCES tenants(id) ON DELETE CASCADE,
  enabled        boolean NOT NULL DEFAULT true,
  participants   uuid[] NOT NULL DEFAULT '{}',
  shift_days     int NOT NULL DEFAULT 7 CHECK (shift_days BETWEEN 1 AND 28),
  handover_time  text NOT NULL DEFAULT '09:00' CHECK (handover_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  timezone       text NOT NULL DEFAULT 'UTC',
  start_date     date NOT NULL,
  min_severity   text NOT NULL DEFAULT 'minor' CHECK (min_severity IN ('minor', 'major', 'critical')),
  -- [{ target: oncall|next|leads|team, afterMin }]
  steps          jsonb NOT NULL DEFAULT '[{"target":"oncall","afterMin":0}]',
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE oncall_overrides (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  tenant_id  uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL CHECK (ends_at > starts_at),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oncall_overrides_team ON oncall_overrides (team_id, ends_at);

CREATE TABLE oncall_pages (
  id           bigserial PRIMARY KEY,
  tenant_id    uuid REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id  uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  team_id      uuid REFERENCES teams(id) ON DELETE SET NULL,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       text NOT NULL,              -- oncall | next | leads | team
  started_at   timestamptz NOT NULL DEFAULT now(),
  next_step    int NOT NULL DEFAULT 0,     -- index into the person's notification steps
  done_at      timestamptz,
  UNIQUE (incident_id, user_id)
);
CREATE INDEX oncall_pages_active ON oncall_pages (incident_id) WHERE done_at IS NULL;

CREATE TABLE oncall_sends (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  page_id     bigint NOT NULL REFERENCES oncall_pages(id) ON DELETE CASCADE,
  channel     text NOT NULL,               -- email | teams | telegram
  sent_at     timestamptz NOT NULL DEFAULT now(),
  ok          boolean NOT NULL,
  error       text
);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['oncall_schedules', 'oncall_overrides', 'oncall_pages', 'oncall_sends'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id))', tbl);
    EXECUTE format('CREATE POLICY global_read ON %I FOR SELECT USING (fudo_global_readable(tenant_id))', tbl);
  END LOOP;
END $$;
