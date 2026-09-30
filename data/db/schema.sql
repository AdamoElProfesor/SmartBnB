-- SmartBnB database schema (PostgreSQL / Supabase)
--
-- Reconstructed from the queries in smartbnb/backend/src/repositories/sql,
-- data/db/load_data.py and the dbt models of data/transform. Safe to re-run: it drops and
-- recreates every table except price_observations and price_scrape_tiles
-- (collected prices and their progress) and etl_runs (the history of the loads).

DROP TABLE IF EXISTS
  public.ai_analyses,
  public.price_baselines,
  public.listing_activity,
  public.price_trends,
  public.current_prices,
  public.neighbourhood_stats,
  public.neighbourhood_room_type_stats,  -- replaced by price_baselines (#19)
  public.airbnb_points,
  public.airbnb_amenities,
  public.amenity_points,
  public.amenity_references,
  public.airbnb_snapshots,
  public.airbnb_vaud,
  public.raw_airbnb_vaud
CASCADE;

-- -----------------------------------------------------------------
-- Listings: one row per Airbnb listing (static data, latest scrape)
-- -----------------------------------------------------------------
CREATE TABLE public.airbnb_vaud (
  id                            bigint PRIMARY KEY,
  listing_url                   text,
  name                          text,
  picture_url                   text,
  host_is_superhost             boolean,
  neighbourhood_cleansed        text,
  neighbourhood_group_cleansed  text,
  latitude                      double precision,
  longitude                     double precision,
  room_type                     text,
  accommodates                  integer
);

CREATE INDEX airbnb_vaud_neighbourhood_idx
  ON public.airbnb_vaud (neighbourhood_cleansed, room_type);

-- -----------------------------------------------------------------
-- Snapshots: one row per listing per InsideAirbnb scrape (time series)
-- -----------------------------------------------------------------
CREATE TABLE public.airbnb_snapshots (
  listing_id                   bigint NOT NULL REFERENCES public.airbnb_vaud (id),
  scrape_id                    bigint NOT NULL,
  last_scraped                 date,
  price                        double precision,
  minimum_nights               integer,
  number_of_reviews            integer,
  number_of_reviews_ltm        integer,
  review_scores_rating         double precision,
  review_scores_accuracy       double precision,
  review_scores_cleanliness    double precision,
  review_scores_checkin        double precision,
  review_scores_communication  double precision,
  review_scores_location       double precision,
  review_scores_value          double precision,
  reviews_per_month            double precision,
  PRIMARY KEY (listing_id, scrape_id)
);

CREATE INDEX airbnb_snapshots_listing_idx
  ON public.airbnb_snapshots (listing_id, last_scraped DESC);
CREATE INDEX airbnb_snapshots_scrape_idx
  ON public.airbnb_snapshots (scrape_id);
CREATE INDEX airbnb_snapshots_scraped_idx
  ON public.airbnb_snapshots (last_scraped);

-- -----------------------------------------------------------------
-- Amenities: 10 reference categories, their weight, and which
-- listings have them
-- -----------------------------------------------------------------
CREATE TABLE public.amenity_references (
  id    integer PRIMARY KEY,
  name  text NOT NULL UNIQUE
);

CREATE TABLE public.amenity_points (
  amenity_id  integer PRIMARY KEY REFERENCES public.amenity_references (id),
  point       integer NOT NULL
);

CREATE TABLE public.airbnb_amenities (
  airbnb_id   bigint  NOT NULL REFERENCES public.airbnb_vaud (id),
  amenity_id  integer NOT NULL REFERENCES public.amenity_references (id),
  PRIMARY KEY (airbnb_id, amenity_id)
);

CREATE TABLE public.airbnb_points (
  airbnb_id     bigint PRIMARY KEY REFERENCES public.airbnb_vaud (id),
  total_points  integer NOT NULL
);

-- The score reads MIN/MAX(total_points) on each request: the index answers
-- both without scanning the table
CREATE INDEX airbnb_points_total_idx
  ON public.airbnb_points (total_points);

-- -----------------------------------------------------------------
-- Pre-computed data: the dbt marts of data/transform, published here by
-- data/db/pipeline.py at each run
-- -----------------------------------------------------------------
-- Lifetime of each listing: active = in one of the last 2 scrapes (the
-- active_scrapes var of data/transform). The site only scores active listings.
CREATE TABLE public.listing_activity (
  listing_id      bigint PRIMARY KEY REFERENCES public.airbnb_vaud (id),
  first_seen      date    NOT NULL,
  last_seen       date    NOT NULL,
  last_scrape_id  bigint  NOT NULL,
  scrapes_seen    integer NOT NULL,
  is_active       boolean NOT NULL
);

-- Latest valid price per active listing (some scrapes have no usable prices)
CREATE TABLE public.current_prices (
  listing_id  bigint PRIMARY KEY REFERENCES public.airbnb_vaud (id),
  price       double precision NOT NULL,
  price_date  date NOT NULL,
  -- Which price definition it comes from (data/transform int_listing_prices)
  source      text NOT NULL
              CHECK (source IN ('insideairbnb', 'scrape_search', 'scrape_listing'))
);

-- The prices each active listing's price is compared with (issue #19):
-- listings of the same room type and capacity band, in the neighbourhood
-- when it has at least 5 of them, else the district, else the canton
CREATE TABLE public.price_baselines (
  listing_id     bigint PRIMARY KEY REFERENCES public.airbnb_vaud (id),
  level          text NOT NULL CHECK (level IN ('neighbourhood', 'district', 'canton')),
  area           text NOT NULL,   -- neighbourhood, district, or Vaud
  capacity_band  text NOT NULL,   -- 1-2, 3-4, 5-6, 7+ guests, or unknown
  avg_price      double precision,
  median_price   double precision NOT NULL,
  n_listings     integer NOT NULL
);

-- One row per listing of the stats window behind each baseline (see the
-- metrics in data/db/README.md)
CREATE TABLE public.neighbourhood_stats (
  neighbourhood          text PRIMARY KEY,
  avg_reviews_per_month  double precision,  -- mean reviews_per_month, no review counting as 0
  avg_rating             double precision,  -- mean overall rating of the rated listings (1-5)
  n_listings             integer NOT NULL,  -- listings behind avg_reviews_per_month
  n_rated_listings       integer NOT NULL   -- listings behind avg_rating
);

-- Median price change per region of the listings priced at both dates
-- (GET /api/histogram): first priced scrape of the last 12 months against
-- the latest, never across a change of price definition by Inside Airbnb
CREATE TABLE public.price_trends (
  region      text PRIMARY KEY,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  n_listings  integer NOT NULL,           -- listings priced at both dates
  pct         double precision NOT NULL   -- median of their price changes, in percent
);

-- -----------------------------------------------------------------
-- Prices collected by the price scraper (see data/prices, raw layer): one row
-- per listing and run. The breakdown is kept so the nightly price metric
-- can be recomputed without collecting again. Not tied to airbnb_vaud:
-- searches also return listings Inside Airbnb has not recorded yet.
-- nightly_price = (total - taxes) / nights, NULL when no price was found.
-- Never dropped by this script: the collected prices are not in the
-- repository and could not be rebuilt.
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_observations (
  run_id         text        NOT NULL,
  listing_id     bigint      NOT NULL,
  observed_at    timestamptz NOT NULL DEFAULT now(),
  method         text        NOT NULL CHECK (method IN ('search', 'listing')),
  status         text        NOT NULL CHECK (status IN ('ok', 'unavailable', 'error')),
  check_in       date,
  nights         integer,
  adults         integer,
  nights_amount  numeric(10, 2),
  taxes          numeric(10, 2),
  total          numeric(10, 2),
  currency       text,
  nightly_price  numeric(10, 2),
  breakdown      jsonb,
  PRIMARY KEY (run_id, listing_id)
);
CREATE INDEX IF NOT EXISTS price_observations_listing_idx
  ON public.price_observations (listing_id, observed_at DESC);

-- Map tiles the price scraper has searched in a run, so an interrupted run
-- resumes where it stopped (done: its listings are stored; split: too many
-- results, its four quarters are searched instead). Written in the same
-- transaction as the tile's price_observations. Kept like them.
CREATE TABLE IF NOT EXISTS public.price_scrape_tiles (
  run_id   text        NOT NULL,
  tile     text        NOT NULL,   -- "sw_lat,sw_lng,ne_lat,ne_lng", 5 decimals
  status   text        NOT NULL CHECK (status IN ('done', 'split')),
  done_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, tile)
);

-- -----------------------------------------------------------------
-- Cache of the AI pros/cons analysis, filled by POST /api/score.
-- data_version is a hash of the data sent to the model, so a new scrape
-- or price gives a new row instead of a stale analysis. lang is the
-- language the analysis is written in (en, fr): each has its own row.
-- -----------------------------------------------------------------
CREATE TABLE public.ai_analyses (
  listing_id    bigint      NOT NULL,
  data_version  text        NOT NULL,
  model         text        NOT NULL,
  lang          text        NOT NULL DEFAULT 'en',
  analysis      jsonb       NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, data_version, model, lang)
);

-- -----------------------------------------------------------------
-- One row per run of pipeline.py (Write-Audit-Publish, see quality.py):
-- the metrics measured on the loaded data and the result of each quality
-- check. status: running, success, warning (published with warnings),
-- blocked (a blocking check failed, rolled back) or failed (crashed).
-- Never dropped by this script: it is the history of the pipeline.
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.etl_runs (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  trigger      text        NOT NULL,
  mode         text        NOT NULL CHECK (mode IN ('incremental', 'full', 'init')),
  dry_run      boolean     NOT NULL DEFAULT false,
  status       text        NOT NULL DEFAULT 'running'
               CHECK (status IN ('running', 'success', 'warning', 'blocked', 'failed')),
  new_scrapes  integer,
  metrics      jsonb,
  checks       jsonb,
  error        text
);
CREATE INDEX IF NOT EXISTS etl_runs_finished_idx ON public.etl_runs (finished_at DESC);

-- -----------------------------------------------------------------
-- Build schema: where the pipeline prepares the next version of the data
-- (candidate raw tables from load_data.py, dbt models) before publishing it
-- into public. Not read by the site, not in the backups, not exposed by the
-- Supabase API. Its tables belong to whoever runs the pipeline.
-- -----------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS build;

-- -----------------------------------------------------------------
-- Security: the backend connects with the Postgres role (bypasses RLS).
-- Enabling RLS with no policy keeps the tables closed to the public
-- anon key exposed by Supabase's REST API.
-- -----------------------------------------------------------------
ALTER TABLE public.airbnb_vaud                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airbnb_snapshots              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amenity_references            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amenity_points                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airbnb_amenities              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airbnb_points                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbourhood_stats           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.current_prices                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_activity              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_baselines               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_trends                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analyses                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_observations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_scrape_tiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etl_runs                      ENABLE ROW LEVEL SECURITY;

-- Supabase only: also hide the tables from the anon / authenticated roles
-- (REST and GraphQL). Skipped on a plain Postgres where they do not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
  END IF;
END $$;

-- Least-privilege roles (created once by roles.sql): recreating the tables
-- above dropped their grants and policies, so give them back. Skipped when
-- the roles do not exist. Keep in sync with the grants in roles.sql.
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartbnb_app')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartbnb_backup') THEN
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO smartbnb_app, smartbnb_backup;
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO smartbnb_backup;
    GRANT INSERT ON public.ai_analyses TO smartbnb_app;
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      EXECUTE format('DROP POLICY IF EXISTS smartbnb_read ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY smartbnb_read ON public.%I FOR SELECT TO smartbnb_app, smartbnb_backup USING (true)', t);
    END LOOP;
    DROP POLICY IF EXISTS smartbnb_app_insert ON public.ai_analyses;
    CREATE POLICY smartbnb_app_insert ON public.ai_analyses
      FOR INSERT TO smartbnb_app WITH CHECK (true);
  END IF;

  -- Loader role (roles.sql): same block as there, keep both in sync
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartbnb_loader') THEN
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO smartbnb_loader;
    GRANT INSERT, UPDATE, DELETE, TRUNCATE ON
      public.airbnb_vaud, public.airbnb_snapshots, public.airbnb_amenities,
      public.airbnb_points, public.current_prices, public.listing_activity, public.price_baselines,
      public.neighbourhood_stats,
      public.price_trends
      TO smartbnb_loader;
    GRANT INSERT, UPDATE ON public.etl_runs TO smartbnb_loader;
    GRANT USAGE, CREATE ON SCHEMA build TO smartbnb_loader;
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      EXECUTE format('DROP POLICY IF EXISTS smartbnb_loader_read ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY smartbnb_loader_read ON public.%I FOR SELECT TO smartbnb_loader USING (true)', t);
    END LOOP;
    FOREACH t IN ARRAY ARRAY['airbnb_vaud', 'airbnb_snapshots', 'airbnb_amenities',
                             'airbnb_points', 'current_prices', 'listing_activity', 'price_baselines',
                             'neighbourhood_stats', 'price_trends', 'etl_runs'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS smartbnb_loader_write ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY smartbnb_loader_write ON public.%I FOR ALL TO smartbnb_loader USING (true) WITH CHECK (true)', t);
    END LOOP;
  END IF;
END $$;
