-- 0006: incidents, timeline, notification channels, delivery outbox

CREATE SEQUENCE incident_number_seq;

CREATE TABLE incidents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number          integer NOT NULL UNIQUE DEFAULT nextval('incident_number_seq'),
  tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,        -- NULL = global infrastructure incident
  entity_type     text NOT NULL CHECK (entity_type IN ('asset','monitor','application')),
  entity_id       uuid NOT NULL,
  entity_name     text NOT NULL,
  title           text NOT NULL,
  severity        text NOT NULL CHECK (severity IN ('minor','major','critical')),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  entity_status   text NOT NULL,                  -- DOWN / IMPACTED at last reconciliation
  cause           jsonb,                          -- root cause ref when impacted
  parent_id       uuid REFERENCES incidents(id) ON DELETE SET NULL,  -- the root incident this one is caused by
  tags            text[] NOT NULL DEFAULT '{}',
  opened_at       timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL,
  snoozed_until   timestamptz,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  last_notified_at timestamptz
);
CREATE INDEX incidents_entity_idx ON incidents (entity_type, entity_id, opened_at DESC);
CREATE INDEX incidents_open_idx ON incidents (status) WHERE status <> 'resolved';
CREATE INDEX incidents_tenant_idx ON incidents (tenant_id, opened_at DESC);
CREATE INDEX incidents_parent_idx ON incidents (parent_id);

CREATE TABLE incident_events (
  id          bigserial PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  tenant_id   uuid,
  ts          timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL,   -- opened, reopened, status, linked, acknowledged, snoozed, note, resolved, notification
  note_type   text CHECK (note_type IN ('comment','action','resolution')),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  body        text NOT NULL DEFAULT '',
  data        jsonb
);
CREATE INDEX incident_events_incident_idx ON incident_events (incident_id, ts);
-- full-text search over notes feeds "similar past incidents"
CREATE INDEX incident_events_fts_idx ON incident_events USING gin (to_tsvector('simple', body)) WHERE kind = 'note';

CREATE TABLE notification_channels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,   -- NULL = global channel
  name            text NOT NULL,
  type            text NOT NULL,
  config_enc      text NOT NULL,          -- AES-GCM encrypted JSON (webhook URLs are credentials)
  config_summary  text NOT NULL DEFAULT '',
  enabled         boolean NOT NULL DEFAULT true,
  min_severity    text NOT NULL DEFAULT 'minor' CHECK (min_severity IN ('minor','major','critical')),
  events          text[] NOT NULL DEFAULT '{opened,resolved}',
  skip_impacted   boolean NOT NULL DEFAULT false,   -- do not notify incidents caused by another incident
  all_tenants     boolean NOT NULL DEFAULT false,   -- global channels only: also every tenant's incidents
  remind_minutes  integer NOT NULL DEFAULT 0 CHECK (remind_minutes >= 0 AND remind_minutes <= 1440),
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Outbox: API and worker insert, the worker's dispatcher sends with retries.
CREATE TABLE notification_deliveries (
  id              bigserial PRIMARY KEY,
  tenant_id       uuid,
  channel_id      uuid NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  incident_id     uuid REFERENCES incidents(id) ON DELETE CASCADE,
  event           text NOT NULL,     -- opened, reopened, resolved, acknowledged, reminder, test
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','suppressed')),
  detail          text NOT NULL DEFAULT '',
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
CREATE INDEX notification_deliveries_queue_idx ON notification_deliveries (next_attempt_at) WHERE status = 'queued';
CREATE INDEX notification_deliveries_incident_idx ON notification_deliveries (incident_id);
CREATE INDEX notification_deliveries_channel_idx ON notification_deliveries (channel_id, created_at DESC);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['incidents','incident_events','notification_channels','notification_deliveries'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id))', tbl);
  END LOOP;
  -- tenants can read global (infrastructure) incidents that their incidents link to
  FOREACH tbl IN ARRAY ARRAY['incidents','incident_events'] LOOP
    EXECUTE format('CREATE POLICY global_read ON %I FOR SELECT USING (fudo_global_readable(tenant_id))', tbl);
  END LOOP;
END $$;
