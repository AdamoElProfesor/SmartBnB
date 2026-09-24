const { all } = require("../../config/db_sql");

/**
 * Returns heatmap point rows (lat/lng, price as weight) for the listings of
 * the latest scrape
 * @returns {Promise<Array<{ lat: number, lng: number, weight: number }>>}
 */
exports.getHeatMap = async () => {
  return await all(
    `
    SELECT
      v.latitude::float  AS lat,
      v.longitude::float AS lng,
      cp.price::float    AS weight
    FROM airbnb_snapshots s
    JOIN airbnb_vaud v ON v.id = s.listing_id
    JOIN current_prices cp ON cp.listing_id = s.listing_id
    WHERE s.scrape_id = (SELECT MAX(scrape_id) FROM airbnb_snapshots)
      AND v.latitude  IS NOT NULL
      AND v.longitude IS NOT NULL
    `,
    []
  );
};
