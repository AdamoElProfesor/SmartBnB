-- Moves the transformations to dbt (issue #52).
--
-- The pipeline now builds the next version of the data in its own "build"
-- schema, then publishes it into public. The loader role gets the right to
-- create tables there, and only there. The legacy raw_airbnb_vaud table of
-- the removed Airflow DAG goes. schema.sql already matches for a new
-- database. Safe to run twice.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/db/migrations/2026-09-30-build-schema.sql

BEGIN;

CREATE SCHEMA IF NOT EXISTS build;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartbnb_loader') THEN
    GRANT USAGE, CREATE ON SCHEMA build TO smartbnb_loader;
  END IF;
END $$;

DROP TABLE IF EXISTS public.raw_airbnb_vaud;

COMMIT;
