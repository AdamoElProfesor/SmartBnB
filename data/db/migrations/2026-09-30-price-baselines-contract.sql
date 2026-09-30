-- Contract step of 2026-09-30-price-baselines.sql (issue #19).
--
-- The backend reads price_baselines and the pipeline no longer builds
-- neighbourhood_room_type_stats, so the old table goes. Apply it once the
-- backend reading price_baselines is deployed. Safe to run twice.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/db/migrations/2026-09-30-price-baselines-contract.sql

BEGIN;

DROP TABLE IF EXISTS public.neighbourhood_room_type_stats;

COMMIT;
