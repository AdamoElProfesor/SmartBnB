const { all, one } = require("../../config/db_sql");

// Airbnb's own threshold for monthly stays: a listing that requires at least
// this many nights is a long-term rental, not a holiday stay.
const LONG_STAY_MIN_NIGHTS = 28;

// "Best rated" ranks by a Bayesian average: each rating is pulled towards the
// mean rating of the area, as if the listing had this many extra reviews at
// that mean. A 5.0 from 3 guests then ranks below a 4.97 from 400 guests.
const RATING_PRIOR_REVIEWS = 40;

/**
 * Search the listings still on Airbnb (listing_activity.is_active), with
 * optional filters/sort, from each one's latest snapshot.
 * The price ranking leaves out long stays: their monthly rent spread per night
 * is not comparable with a holiday price. The rating ranking uses a Bayesian
 * average (RATING_PRIOR_REVIEWS).
 * @param {{ ratingMin?: number, sort?: 'price_asc'|'most_booked'|'rating_desc'|'listing_id_asc'|string, limit?: number }} params
 * @returns {Promise<Array<{ id: string, name: string, neighborhood: string, latitude: number, longitude: number, room_type: string, accommodates: number, price: number|null, rating: number|null, number_of_reviews: number|null, number_of_reviews_ltm: number|null, minimum_nights: number|null, long_stay: boolean, host_is_superhost: boolean }>>}
 */
exports.search = async ({
  ratingMin = 0,
  sort = "listing_id_asc",
  limit = 10,
}) => {
  const lim = Number.isFinite(Number(limit))
    ? Math.min(Number(limit), 100)
    : 10;
  const rows = await all(
    `
    -- Active listings (the one definition, computed by the pipeline) and the
    -- latest snapshot of each: a lookup on the snapshots' primary key
    -- (listing_id, scrape_id) instead of ranking every snapshot of the history.
    WITH latest AS (
      SELECT s.*
      FROM public.listing_activity a
      JOIN public.airbnb_snapshots s
        ON s.listing_id = a.listing_id AND s.scrape_id = a.last_scrape_id
      WHERE a.is_active
    ),
    -- Mean rating of the active listings: the prior of the Bayesian average.
    prior AS (
      SELECT AVG(review_scores_rating) AS mean_rating
      FROM latest
      WHERE review_scores_rating IS NOT NULL
        AND number_of_reviews > 0
    )
    SELECT
      v.id,
      v.name,
      v.neighbourhood_cleansed  AS neighborhood,
      v.latitude,
      v.longitude,
      v.room_type,
      v.accommodates,
      cp.price,
      l.review_scores_rating     AS rating,
      l.number_of_reviews,
      l.number_of_reviews_ltm,
      l.minimum_nights,
      COALESCE(l.minimum_nights >= $4, false) AS long_stay,
      v.host_is_superhost
    FROM public.airbnb_vaud v
    JOIN latest l ON l.listing_id = v.id
    LEFT JOIN public.current_prices cp ON cp.listing_id = v.id
    CROSS JOIN prior
    WHERE COALESCE(l.review_scores_rating, 0) >= $1
      AND ($2 <> 'price_asc' OR l.minimum_nights IS NULL OR l.minimum_nights < $4)
    ORDER BY
      CASE WHEN $2 = 'price_asc'   THEN cp.price END ASC  NULLS LAST,
      CASE WHEN $2 = 'most_booked' THEN l.number_of_reviews_ltm END DESC NULLS LAST,
      CASE WHEN $2 = 'rating_desc' THEN
        (COALESCE(l.number_of_reviews, 0) * l.review_scores_rating + $5 * prior.mean_rating)
        / (COALESCE(l.number_of_reviews, 0) + $5)
      END DESC NULLS LAST,
      CASE WHEN $2 = 'rating_desc' THEN l.number_of_reviews END DESC NULLS LAST,
      v.id ASC
    LIMIT LEAST($3, 100);
    `,
    [Number(ratingMin) || 0, String(sort || ""), Number(lim), LONG_STAY_MIN_NIGHTS, RATING_PRIOR_REVIEWS]
  );
  return rows;
};

/**
 * Get detailed listing by ID (latest snapshot, lifetime and activity,
 * neighborhood stats, amenities), whether or not it is still on Airbnb
 * @param {string|number} id
 * @param {{ missingLimit?: number, missingMinPoint?: number }} [options]
 * @returns {Promise<object|null>}
 */
exports.getById = async (
  id,
  { missingLimit = 10, missingMinPoint = 1 } = {}
) => {
  const row = await one(
    `
    WITH latest AS (
      SELECT *
      FROM (
        SELECT s.*,
               ROW_NUMBER() OVER (
                 PARTITION BY s.listing_id
                 ORDER BY s.last_scraped DESC NULLS LAST, s.scrape_id DESC
               ) AS rn
        FROM public.airbnb_snapshots s
        WHERE s.listing_id = $1
      ) x
      WHERE x.rn = 1
    ),
    amen AS (
      SELECT array_agg(ar.name ORDER BY ar.name) AS amenities
      FROM public.airbnb_amenities aa
      JOIN public.amenity_references ar ON ar.id = aa.amenity_id
      WHERE aa.airbnb_id = $1
    )
    SELECT
      v.id,
      v.listing_url,
      v.name,
      v.host_is_superhost,
      v.neighbourhood_cleansed       AS neighborhood,
      v.neighbourhood_group_cleansed AS neighborhood_group,
      v.room_type,
      v.accommodates,
      -- Calendar days as YYYY-MM-DD text: a date sent as a timestamp at
      -- midnight UTC would show the previous day west of Greenwich
      act.first_seen::text           AS first_seen,
      act.last_seen::text            AS last_seen,
      act.is_active,
      cp.price,
      cp.price_date::text            AS price_date,
      s.number_of_reviews,
      s.number_of_reviews_ltm,
      s.reviews_per_month,
      s.review_scores_rating,

      -- Prices of the similar listings (same room type and capacity band),
      -- in the neighbourhood, the district or the canton (price_baselines)
      pb.median_price,
      pb.avg_price,
      pb.n_listings                  AS price_comparables,
      pb.level                       AS price_baseline_level,
      pb.area                        AS price_baseline_area,
      pb.capacity_band,
      ns.avg_rating            AS neighborhood_avg_rating,
      ns.avg_reviews_per_month AS neighborhood_avg_reviews_per_month,
      ns.n_listings            AS neighborhood_n_listings,
      -- Mean rating of the rated listings of the canton: the prior of the
      -- score's Bayesian rating
      (SELECT SUM(ns2.avg_rating * ns2.n_rated_listings) / NULLIF(SUM(ns2.n_rated_listings), 0)
       FROM public.neighbourhood_stats ns2) AS canton_avg_rating,

      a.amenities,
      p.total_points                  AS amenities_score,
      (SELECT MIN(pp.total_points) FROM public.airbnb_points pp) AS amenities_min,
      (SELECT MAX(pp.total_points) FROM public.airbnb_points pp) AS amenities_max,
      m.missing_amenities
    FROM public.airbnb_vaud v
    LEFT JOIN latest s ON s.listing_id = v.id
    LEFT JOIN public.listing_activity act ON act.listing_id = v.id
    LEFT JOIN public.current_prices cp ON cp.listing_id = v.id
    LEFT JOIN amen   a ON TRUE
    LEFT JOIN public.airbnb_points p ON p.airbnb_id = v.id
    LEFT JOIN public.neighbourhood_stats ns ON ns.neighbourhood = v.neighbourhood_cleansed
    LEFT JOIN public.price_baselines pb ON pb.listing_id = v.id
    LEFT JOIN LATERAL (
      SELECT array_agg(mm.name ORDER BY mm.point DESC, mm.name) AS missing_amenities
      FROM (
        SELECT ar.name, ap.point
        FROM public.amenity_references ar
        JOIN public.amenity_points ap ON ap.amenity_id = ar.id
        WHERE ap.point >= $2
          AND NOT EXISTS (
            SELECT 1
            FROM public.airbnb_amenities aa
            WHERE aa.airbnb_id = v.id
              AND aa.amenity_id = ar.id
          )
        ORDER BY ap.point DESC, ar.name
        LIMIT LEAST($3, 50)
      ) AS mm
    ) m ON TRUE
    WHERE v.id = $1
    LIMIT 1;
    `,
    [String(id), Number(missingMinPoint) || 1, Number(missingLimit) || 10]
  );
  return row || null;
};
