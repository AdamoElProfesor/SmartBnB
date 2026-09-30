-- Price baselines by capacity band, with a fallback to the district and the
-- canton (issue #19), "expand" step: the new table next to
-- neighbourhood_room_type_stats, which the running backend still reads. The
-- pipeline fills both; once the backend reading price_baselines is deployed,
-- a contract migration drops the old table.
--
-- A new table in production also needs what schema.sql gives every table:
-- row level security, no access for the Supabase API roles, read access for
-- the backend and the backup, write access for the loader. Safe to run twice.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/db/migrations/2026-09-30-price-baselines.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.price_baselines (
  listing_id     bigint PRIMARY KEY REFERENCES public.airbnb_vaud (id),
  level          text NOT NULL CHECK (level IN ('neighbourhood', 'district', 'canton')),
  area           text NOT NULL,
  capacity_band  text NOT NULL,
  avg_price      double precision,
  median_price   double precision NOT NULL,
  n_listings     integer NOT NULL
);

ALTER TABLE public.price_baselines ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.price_baselines FROM anon, authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartbnb_app') THEN
    GRANT SELECT ON public.price_baselines TO smartbnb_app, smartbnb_backup;
    DROP POLICY IF EXISTS smartbnb_read ON public.price_baselines;
    CREATE POLICY smartbnb_read ON public.price_baselines
      FOR SELECT TO smartbnb_app, smartbnb_backup USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartbnb_loader') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.price_baselines TO smartbnb_loader;
    DROP POLICY IF EXISTS smartbnb_loader_read ON public.price_baselines;
    CREATE POLICY smartbnb_loader_read ON public.price_baselines
      FOR SELECT TO smartbnb_loader USING (true);
    DROP POLICY IF EXISTS smartbnb_loader_write ON public.price_baselines;
    CREATE POLICY smartbnb_loader_write ON public.price_baselines
      FOR ALL TO smartbnb_loader USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;
