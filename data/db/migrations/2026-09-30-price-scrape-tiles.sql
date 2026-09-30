-- Map tiles searched by the price scraper, so an interrupted run resumes
-- where it stopped instead of repeating every search (issue #37). Only the
-- scraper (as postgres) writes it.
--
-- A new table in production also needs what schema.sql gives every table:
-- row level security, no access for the Supabase API roles, read access for
-- the backend, the backup and the loader. Safe to run twice.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/db/migrations/2026-09-30-price-scrape-tiles.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.price_scrape_tiles (
  run_id   text        NOT NULL,
  tile     text        NOT NULL,
  status   text        NOT NULL CHECK (status IN ('done', 'split')),
  done_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, tile)
);

ALTER TABLE public.price_scrape_tiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.price_scrape_tiles FROM anon, authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartbnb_app') THEN
    GRANT SELECT ON public.price_scrape_tiles TO smartbnb_app, smartbnb_backup;
    DROP POLICY IF EXISTS smartbnb_read ON public.price_scrape_tiles;
    CREATE POLICY smartbnb_read ON public.price_scrape_tiles
      FOR SELECT TO smartbnb_app, smartbnb_backup USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartbnb_loader') THEN
    GRANT SELECT ON public.price_scrape_tiles TO smartbnb_loader;
    DROP POLICY IF EXISTS smartbnb_loader_read ON public.price_scrape_tiles;
    CREATE POLICY smartbnb_loader_read ON public.price_scrape_tiles
      FOR SELECT TO smartbnb_loader USING (true);
  END IF;
END $$;

COMMIT;
