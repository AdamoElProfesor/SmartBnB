-- Least-privilege roles for SmartBnB (PostgreSQL / Supabase)
--
-- By default the backend, the backup and the loaders all connect as
-- "postgres", which can drop any table. With these roles a leaked backend or
-- backup credential can only read (and, for the backend, add AI analyses).
--
--   smartbnb_app     backend: SELECT on every table, INSERT into ai_analyses
--   smartbnb_backup  pg_dump: SELECT on every table and sequence
--   smartbnb_loader  load_data.py in GitHub Actions: writes the listing and
--                    stats tables and etl_runs, reads price_observations.
--                    It cannot drop tables or touch the collected prices.
--
-- "postgres" stays for schema.sql, load_data.py --init and scrape_prices.py.
--
-- Run it once, with three long random passwords (schema.sql gives the grants
-- and policies back each time it recreates the tables):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v app_password="$(openssl rand -hex 32)" \
--     -v backup_password="$(openssl rand -hex 32)" \
--     -v loader_password="$(openssl rand -hex 32)" \
--     -f data/db/roles.sql
--
-- Then connect with user "smartbnb_app.<project ref>" on the Supabase pooler
-- (Render DATABASE_URL), "smartbnb_backup.<project ref>" (GitHub secret
-- BACKUP_DATABASE_URL) and "smartbnb_loader.<project ref>" (GitHub secret
-- LOADER_DATABASE_URL). Safe to re-run: it also rotates the passwords.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartbnb_app') THEN
    CREATE ROLE smartbnb_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartbnb_backup') THEN
    CREATE ROLE smartbnb_backup LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartbnb_loader') THEN
    CREATE ROLE smartbnb_loader LOGIN;
  END IF;
END $$;

ALTER ROLE smartbnb_app PASSWORD :'app_password';
ALTER ROLE smartbnb_backup PASSWORD :'backup_password';
ALTER ROLE smartbnb_loader PASSWORD :'loader_password';

-- A runaway query cannot hold a connection for long
ALTER ROLE smartbnb_app SET statement_timeout = '10s';
-- A load recomputes the stats tables: minutes, not hours
ALTER ROLE smartbnb_loader SET statement_timeout = '5min';

GRANT USAGE ON SCHEMA public TO smartbnb_app, smartbnb_backup, smartbnb_loader;

-- Backend: read everything, write only the AI analysis cache
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM smartbnb_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO smartbnb_app;
GRANT INSERT ON public.ai_analyses TO smartbnb_app;

-- Backup: read every table and sequence (pg_dump reads sequence values)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM smartbnb_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO smartbnb_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO smartbnb_backup;

-- Loader: read everything, write only what load_data.py rebuilds, and its
-- own run log. No DELETE on price_observations, no DDL.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM smartbnb_loader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO smartbnb_loader;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON
  public.airbnb_vaud, public.airbnb_snapshots, public.airbnb_amenities,
  public.airbnb_points, public.current_prices,
  public.neighbourhood_room_type_stats, public.neighbourhood_stats
  TO smartbnb_loader;
GRANT INSERT, UPDATE ON public.etl_runs TO smartbnb_loader;

-- Tables created later by "postgres" get the same read access
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO smartbnb_app, smartbnb_backup, smartbnb_loader;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO smartbnb_backup;

-- Row level security is enabled with no policy on every table (schema.sql),
-- which hides all rows from any role that is not the owner. These policies
-- open the rows to the two roles above, and only to them (same block at the
-- end of schema.sql).
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

-- Loader policies (same block at the end of schema.sql)
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS smartbnb_loader_read ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY smartbnb_loader_read ON public.%I FOR SELECT TO smartbnb_loader USING (true)', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['airbnb_vaud', 'airbnb_snapshots', 'airbnb_amenities',
                           'airbnb_points', 'current_prices', 'neighbourhood_room_type_stats',
                           'neighbourhood_stats', 'etl_runs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS smartbnb_loader_write ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY smartbnb_loader_write ON public.%I FOR ALL TO smartbnb_loader USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
