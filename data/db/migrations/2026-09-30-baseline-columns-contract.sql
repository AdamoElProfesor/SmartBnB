-- Contract step of 2026-09-30-baseline-columns.sql (issue #49).
--
-- The backend reads neighbourhood_stats.avg_rating and the pipeline fills
-- the new columns at every run, so the old avg_reviews column goes, and the
-- new columns get the constraints they could not have while still empty.
-- Apply it before deploying the dbt models that no longer build avg_reviews.
-- Safe to run twice.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/db/migrations/2026-09-30-baseline-columns-contract.sql

BEGIN;

ALTER TABLE public.neighbourhood_stats
  DROP COLUMN IF EXISTS avg_reviews,
  ALTER COLUMN n_listings SET NOT NULL,
  ALTER COLUMN n_rated_listings SET NOT NULL;

ALTER TABLE public.current_prices
  ALTER COLUMN source SET NOT NULL,
  DROP CONSTRAINT IF EXISTS current_prices_source_check,
  ADD CONSTRAINT current_prices_source_check
    CHECK (source IN ('insideairbnb', 'scrape_search', 'scrape_listing'));

COMMIT;
