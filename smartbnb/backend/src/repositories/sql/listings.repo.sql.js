const { all, one } = require("../../config/db_sql");

/**
 * Search listings still active in the latest scrape, with optional filters/sort
 * @param {{ ratingMin?: number, sort?: 'price_asc'|'most_booked'|'rating_desc'|'listing_id_asc'|string, limit?: number }} params
 * @returns {Promise<Array<{ id: string, name: string, neighborhood: string, latitude: number, longitude: number, room_type: string, accommodates: number, price: number|null, rating: number|null, number_of_reviews_ltm: number|null, host_is_superhost: boolean }>>}
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
    WITH latest AS (
      SELECT *
      FROM (
        SELECT
          s.*,
          ROW_NUMBER() OVER (
            PARTITION BY s.listing_id
            ORDER BY s.last_scraped DESC NULLS LAST, s.scrape_id DESC
          ) AS rn
        FROM public.airbnb_snapshots s
      ) x
      WHERE x.rn = 1
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
      l.number_of_reviews_ltm,
      v.host_is_superhost
    FROM public.airbnb_vaud v
    JOIN latest l ON l.listing_id = v.id
    LEFT JOIN public.current_prices cp ON cp.listing_id = v.id
    WHERE COALESCE(l.review_scores_rating, 0) >= $1
      AND l.scrape_id = (SELECT MAX(scrape_id) FROM public.airbnb_snapshots)
    ORDER BY
      CASE WHEN $2 = 'price_asc'   THEN cp.price END ASC  NULLS LAST,
      CASE WHEN $2 = 'most_booked' THEN l.number_of_reviews_ltm END DESC NULLS LAST,
      CASE WHEN $2 = 'rating_desc' THEN l.review_scores_rating END DESC NULLS LAST,
      CASE WHEN $2 = 'rating_desc' THEN l.number_of_reviews END DESC NULLS LAST,
      v.id ASC
    LIMIT LEAST($3, 100);
    `,
    [Number(ratingMin) || 0, String(sort || ""), Number(lim)]
  );
  return rows;
};

/**
 * Get detailed listing by ID (latest snapshot, neighborhood stats, amenities)
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
      cp.price,
      cp.price_date,
      s.number_of_reviews_ltm,
      s.reviews_per_month, 
      s.review_scores_rating,

      n.median_price,
      n.avg_price,
      n.count_airbnb,
      ns.avg_reviews           AS neighborhood_avg_rating,
      ns.avg_reviews_per_month AS neighborhood_avg_reviews_per_month,

      a.amenities,
      p.total_points                  AS amenities_score,
      (SELECT MIN(pp.total_points) FROM public.airbnb_points pp) AS amenities_min,
      (SELECT MAX(pp.total_points) FROM public.airbnb_points pp) AS amenities_max,
      m.missing_amenities
    FROM public.airbnb_vaud v
    LEFT JOIN latest s ON s.listing_id = v.id
    LEFT JOIN public.current_prices cp ON cp.listing_id = v.id
    LEFT JOIN amen   a ON TRUE
    LEFT JOIN public.airbnb_points p ON p.airbnb_id = v.id
    LEFT JOIN public.neighbourhood_stats ns ON ns.neighbourhood = v.neighbourhood_cleansed
    LEFT JOIN LATERAL (
      SELECT
        nrt.median_price,
        nrt.avg_price,
        nrt.count_airbnb
      FROM public.neighbourhood_room_type_stats nrt
      WHERE nrt.neighbourhood = v.neighbourhood_cleansed
        AND nrt.room_type     = v.room_type
      LIMIT 1
    ) n ON TRUE
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
