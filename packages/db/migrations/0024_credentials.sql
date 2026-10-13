-- 0024: shared credentials. One account (or SNMP community, SSH key) used by many monitors of the
-- same scope; checks read it when they run. Secrets are encrypted (AES-256-GCM, key from APP_SECRET).
CREATE TABLE credentials (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('password', 'ssh-key', 'snmp-community', 'snmpv3')),
  description text NOT NULL DEFAULT '',
  fields      jsonb NOT NULL DEFAULT '{}',   -- not secret: user, SNMPv3 level and protocols
  secrets_enc text NOT NULL,                 -- encrypted JSON of the secret fields
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX credentials_scope_name ON credentials (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- same scope only: no global_read policy, so a tenant cannot use (or see) global credentials
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON credentials USING (fudo_tenant_ok(tenant_id)) WITH CHECK (fudo_tenant_ok(tenant_id));

-- a credential in use cannot be deleted
ALTER TABLE monitors ADD COLUMN credential_id uuid REFERENCES credentials(id) ON DELETE RESTRICT;
CREATE INDEX monitors_credential_idx ON monitors (credential_id) WHERE credential_id IS NOT NULL;
