-- SmartBnB database schema (PostgreSQL / Supabase)
--
-- Reconstructed from the queries in smartbnb/backend/src/repositories/sql
-- and data/db/load_data.py. Safe to re-run: it drops and
-- recreates every table except price_observations (collected prices).

DROP TABLE IF EXISTS
  public.ai_analyses,
  public.current_prices,
  public.neighbourhood_stats,
  public.neighbourhood_room_type_stats,
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

-- -----------------------------------------------------------------
-- Pre-computed data, rebuilt by load_data.py
-- -----------------------------------------------------------------
-- Latest valid price per listing (some scrapes have no usable prices)
CREATE TABLE public.current_prices (
  listing_id  bigint PRIMARY KEY REFERENCES public.airbnb_vaud (id),
  price       double precision NOT NULL,
  price_date  date NOT NULL
);

CREATE TABLE public.neighbourhood_room_type_stats (
  neighbourhood  text NOT NULL,
  room_type      text NOT NULL,
  avg_price      double precision,
  median_price   double precision,
  count_airbnb   integer NOT NULL,
  PRIMARY KEY (neighbourhood, room_type)
);

CREATE TABLE public.neighbourhood_stats (
  neighbourhood          text PRIMARY KEY,
  avg_reviews            double precision,  -- mean review score (0-5)
  avg_reviews_per_month  double precision   -- mean reviews_per_month
);

-- -----------------------------------------------------------------
-- Prices collected by data/prices/scrape_prices.py (raw layer): one row
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

-- -----------------------------------------------------------------
-- Cache of the AI pros/cons analysis, filled by POST /api/score.
-- data_version is a hash of the data sent to the model, so a new scrape
-- or price gives a new row instead of a stale analysis.
-- -----------------------------------------------------------------
CREATE TABLE public.ai_analyses (
  listing_id    bigint      NOT NULL,
  data_version  text        NOT NULL,
  model         text        NOT NULL,
  analysis      jsonb       NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, data_version, model)
);

-- -----------------------------------------------------------------
-- Legacy staging table from the removed Airflow DAG (raw InsideAirbnb CSV
-- rows). load_data.py does not use it; kept so existing databases match.
-- Every column is text.
-- -----------------------------------------------------------------
CREATE TABLE public.raw_airbnb_vaud (
  id text, listing_url text, scrape_id text, last_scraped text, source text,
  name text, description text, neighborhood_overview text, picture_url text,
  host_id text, host_url text, host_name text, host_since text,
  host_location text, host_about text, host_response_time text,
  host_response_rate text, host_acceptance_rate text, host_is_superhost text,
  host_thumbnail_url text, host_picture_url text, host_neighbourhood text,
  host_listings_count text, host_total_listings_count text,
  host_verifications text, host_has_profile_pic text,
  host_identity_verified text, neighbourhood text, neighbourhood_cleansed text,
  neighbourhood_group_cleansed text, latitude text, longitude text,
  property_type text, room_type text, accommodates text, bathrooms text,
  bathrooms_text text, bedrooms text, beds text, amenities text, price text,
  minimum_nights text, maximum_nights text, minimum_minimum_nights text,
  maximum_minimum_nights text, minimum_maximum_nights text,
  maximum_maximum_nights text, minimum_nights_avg_ntm text,
  maximum_nights_avg_ntm text, calendar_updated text, has_availability text,
  availability_30 text, availability_60 text, availability_90 text,
  availability_365 text, calendar_last_scraped text, number_of_reviews text,
  number_of_reviews_ltm text, number_of_reviews_l30d text,
  availability_eoy text, number_of_reviews_ly text,
  estimated_occupancy_l365d text, estimated_revenue_l365d text,
  first_review text, last_review text, review_scores_rating text,
  review_scores_accuracy text, review_scores_cleanliness text,
  review_scores_checkin text, review_scores_communication text,
  review_scores_location text, review_scores_value text, license text,
  instant_bookable text, calculated_host_listings_count text,
  calculated_host_listings_count_entire_homes text,
  calculated_host_listings_count_private_rooms text,
  calculated_host_listings_count_shared_rooms text, reviews_per_month text
);

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
ALTER TABLE public.neighbourhood_room_type_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbourhood_stats           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.current_prices                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_airbnb_vaud               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analyses                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_observations            ENABLE ROW LEVEL SECURITY;

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
END $$;
