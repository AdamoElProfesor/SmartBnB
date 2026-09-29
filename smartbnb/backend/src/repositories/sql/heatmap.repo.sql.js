const { all } = require("../../config/db_sql");

/**
 * Returns heatmap point rows (lat/lng, price as weight) for the listings
 * still on Airbnb (listing_activity.is_active) that have a current price
 * @returns {Promise<Array<{ lat: number, lng: number, weight: number }>>}
 */
exports.getHeatMap = async () => {
  return await all(
    `
    SELECT
      v.latitude::float  AS lat,
      v.longitude::float AS lng,
      cp.price::float    AS weight
    FROM public.listing_activity a
    JOIN public.airbnb_vaud v ON v.id = a.listing_id
    JOIN public.current_prices cp ON cp.listing_id = a.listing_id
    WHERE a.is_active
      AND v.latitude  IS NOT NULL
      AND v.longitude IS NOT NULL
    `,
    []
  );
};
