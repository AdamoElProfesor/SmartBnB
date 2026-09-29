-- Adds the language of the AI analysis to its cache key (issue #56).
--
-- For a database created before this change. schema.sql already has the
-- column for a new one. Existing rows were all written in English, so they
-- get lang = 'en'. Safe to run twice.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/db/migrations/2026-09-29-ai-analyses-lang.sql

BEGIN;

ALTER TABLE public.ai_analyses
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'en';

ALTER TABLE public.ai_analyses DROP CONSTRAINT IF EXISTS ai_analyses_pkey;
ALTER TABLE public.ai_analyses
  ADD CONSTRAINT ai_analyses_pkey PRIMARY KEY (listing_id, data_version, model, lang);

COMMIT;
