-- Neighbourhood baselines measured like the listing side (issue #49),
-- "expand" step of an expand / contract change.
--
-- Adds the new columns next to the old ones, so the running backend keeps
-- working while the pipeline and the backend switch to them:
--   neighbourhood_stats.avg_rating        replaces avg_reviews (same value while both exist)
--   neighbourhood_stats.n_listings        sample size of the reviews baseline
--   neighbourhood_stats.n_rated_listings  sample size of the rating baseline
--   current_prices.source                 which price definition each price comes from
-- They stay empty until the next pipeline run fills them. The contract step
-- drops avg_reviews once nothing reads it. Safe to run twice.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/db/migrations/2026-09-30-baseline-columns.sql

BEGIN;

ALTER TABLE public.neighbourhood_stats
  ADD COLUMN IF NOT EXISTS avg_rating double precision,
  ADD COLUMN IF NOT EXISTS n_listings integer,
  ADD COLUMN IF NOT EXISTS n_rated_listings integer;

ALTER TABLE public.current_prices
  ADD COLUMN IF NOT EXISTS source text;

COMMIT;
