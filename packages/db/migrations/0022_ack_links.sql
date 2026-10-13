-- 0022: one-time acknowledge links in on-call messages. Only a hash of each token is stored;
-- a token works for 24 hours and only while its incident is still open.
CREATE TABLE oncall_ack_tokens (
  token_hash text PRIMARY KEY,
  page_id    bigint NOT NULL REFERENCES oncall_pages(id) ON DELETE CASCADE,
  tenant_id  uuid REFERENCES tenants(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
ALTER TABLE oncall_ack_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE oncall_ack_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON oncall_ack_tokens USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id));
