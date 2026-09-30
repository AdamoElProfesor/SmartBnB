-- Price trends on the same listings, within one price definition (issue #17).
--
-- price_trends now measures the median price change of the listings priced
-- at both dates, so the medians of all listings at each date go and the
-- sample size comes in. Nothing reads the dropped columns (the backend
-- reads region and pct, and now the dates and n_listings), so there is no
-- expand / contract step. The table is emptied: the pipeline refills it at its next run, and
-- the site shows "no price trend yet" until then instead of the old +30% to
-- +65%. Apply it, then run the pipeline with the new model before the next
-- scheduled refresh. Safe to run twice.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/db/migrations/2026-09-30-price-trends-panel.sql

BEGIN;

TRUNCATE public.price_trends;

ALTER TABLE public.price_trends
  DROP COLUMN IF EXISTS start_median,
  DROP COLUMN IF EXISTS end_median,
  ADD COLUMN IF NOT EXISTS n_listings integer NOT NULL,
  ALTER COLUMN pct SET NOT NULL;

COMMIT;
