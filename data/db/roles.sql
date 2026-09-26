-- Least-privilege roles for SmartBnB (PostgreSQL / Supabase)
--
-- By default the backend, the backup and the loaders all connect as
-- "postgres", which can drop any table. With these roles a leaked backend or
-- backup credential can only read (and, for the backend, add AI analyses).
--
--   smartbnb_app     backend: SELECT on every table, INSERT into ai_analyses
--   smartbnb_backup  pg_dump: SELECT on every table and sequence
--
-- "postgres" stays for schema.sql, load_data.py and scrape_prices.py.
--
-- Run it after schema.sql (which recreates the tables and drops their
-- policies), with two long random passwords:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v app_password="$(openssl rand -hex 32)" \
--     -v backup_password="$(openssl rand -hex 32)" \
--     -f data/db/roles.sql
--
-- Then connect with user "smartbnb_app.<project ref>" on the Supabase pooler
-- (Render DATABASE_URL) and "smartbnb_backup.<project ref>" (GitHub secret
-- BACKUP_DATABASE_URL). Safe to re-run: it also rotates both passwords.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartbnb_app') THEN
    CREATE ROLE smartbnb_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartbnb_backup') THEN
    CREATE ROLE smartbnb_backup LOGIN;
  END IF;
END $$;

ALTER ROLE smartbnb_app PASSWORD :'app_password';
ALTER ROLE smartbnb_backup PASSWORD :'backup_password';

-- A runaway query cannot hold a connection for long
ALTER ROLE smartbnb_app SET statement_timeout = '10s';

GRANT USAGE ON SCHEMA public TO smartbnb_app, smartbnb_backup;

-- Backend: read everything, write only the AI analysis cache
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM smartbnb_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO smartbnb_app;
GRANT INSERT ON public.ai_analyses TO smartbnb_app;

-- Backup: read every table and sequence (pg_dump reads sequence values)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM smartbnb_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO smartbnb_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO smartbnb_backup;

-- Tables created later by "postgres" get the same read access
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO smartbnb_app, smartbnb_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO smartbnb_backup;

-- Row level security is enabled with no policy on every table (schema.sql),
-- which hides all rows from any role that is not the owner. These policies
-- open the rows to the two roles above, and only to them.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS smartbnb_read ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY smartbnb_read ON public.%I FOR SELECT TO smartbnb_app, smartbnb_backup USING (true)', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS smartbnb_app_insert ON public.ai_analyses;
CREATE POLICY smartbnb_app_insert ON public.ai_analyses
  FOR INSERT TO smartbnb_app WITH CHECK (true);
