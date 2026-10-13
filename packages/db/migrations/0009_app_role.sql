-- 0009: run the application as a role that row-level security applies to.
-- PostgreSQL superusers (like POSTGRES_USER in the official Docker image) and BYPASSRLS roles
-- ignore RLS even with FORCE. Migrations keep running as the connecting (admin) user; the API
-- and worker switch to fudo_app at connection start (SET ROLE via the "role" startup option).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fudo_app') THEN
    CREATE ROLE fudo_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  -- the connecting user must be a member to switch to it (superusers already can)
  IF NOT pg_has_role(current_user, 'fudo_app', 'MEMBER') THEN
    EXECUTE format('GRANT fudo_app TO %I', current_user);
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Cannot create role fudo_app (%). Row-level security still applies if the application user is not a superuser.', SQLERRM;
END $$;
-- Table and sequence privileges are (re)granted after every migration run by the runner.
