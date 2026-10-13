-- 0012: route notifications per application.
-- routing = 'all'      the channel receives every incident of its scope (as before)
-- routing = 'selected' the channel receives only incidents of the applications linked to it
ALTER TABLE notification_channels
  ADD COLUMN routing text NOT NULL DEFAULT 'all' CHECK (routing IN ('all', 'selected'));

CREATE TABLE application_channels (
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  channel_id     uuid NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (application_id, channel_id)
);
CREATE INDEX application_channels_channel_idx ON application_channels (channel_id);

ALTER TABLE application_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_channels FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON application_channels USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id));
