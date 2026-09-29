-- Lifetime of each listing, to tell the listings still on Airbnb from those
-- that left (issue #47). The pipeline fills the table at every run.
--
-- A new table in production also needs what schema.sql gives every table:
-- row level security, no access for the Supabase API roles, read access for
-- the backend and the backup, write access for the loader. Safe to run twice.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/db/migrations/2026-09-30-listing-activity.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.listing_activity (
  listing_id      bigint PRIMARY KEY REFERENCES public.airbnb_vaud (id),
  first_seen      date    NOT NULL,
  last_seen       date    NOT NULL,
  last_scrape_id  bigint  NOT NULL,
  scrapes_seen    integer NOT NULL,
  is_active       boolean NOT NULL
);

ALTER TABLE public.listing_activity ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.listing_activity FROM anon, authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartbnb_app') THEN
    GRANT SELECT ON public.listing_activity TO smartbnb_app, smartbnb_backup;
    DROP POLICY IF EXISTS smartbnb_read ON public.listing_activity;
    CREATE POLICY smartbnb_read ON public.listing_activity
      FOR SELECT TO smartbnb_app, smartbnb_backup USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartbnb_loader') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.listing_activity TO smartbnb_loader;
    DROP POLICY IF EXISTS smartbnb_loader_read ON public.listing_activity;
    CREATE POLICY smartbnb_loader_read ON public.listing_activity
      FOR SELECT TO smartbnb_loader USING (true);
    DROP POLICY IF EXISTS smartbnb_loader_write ON public.listing_activity;
    CREATE POLICY smartbnb_loader_write ON public.listing_activity
      FOR ALL TO smartbnb_loader USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;
