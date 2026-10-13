-- 0003: tenants metadata, invitations, user lifecycle
ALTER TABLE tenants
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD COLUMN is_active   boolean NOT NULL DEFAULT true,
  ADD COLUMN updated_at  timestamptz NOT NULL DEFAULT now();

-- Invited users have no password until they accept the invitation.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE user_tenant_roles ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE user_tenant_roles DROP CONSTRAINT IF EXISTS user_tenant_roles_role_check;
-- Global scope (tenant_id NULL): infra-admin, viewer. Tenant scope: tenant-admin, operator, viewer.
ALTER TABLE user_tenant_roles ADD CONSTRAINT user_tenant_roles_role_scope_check CHECK (
  (tenant_id IS NULL AND role IN ('infra-admin', 'viewer')) OR
  (tenant_id IS NOT NULL AND role IN ('tenant-admin', 'operator', 'viewer'))
);

-- One-time links: 'invite' = set password + enroll 2FA; 'reset_2fa' = confirm password + enroll 2FA
CREATE TABLE invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text NOT NULL UNIQUE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('invite', 'reset_2fa')),
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX invites_user_idx ON invites (user_id);

CREATE INDEX audit_log_user_idx ON audit_log (user_id, ts DESC);
CREATE INDEX audit_log_tenant_idx ON audit_log (tenant_id, ts DESC);
CREATE INDEX audit_log_action_idx ON audit_log (action, ts DESC);
