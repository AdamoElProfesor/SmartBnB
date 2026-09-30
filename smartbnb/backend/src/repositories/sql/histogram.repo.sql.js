const { all } = require("../../config/db_sql");

/**
 * Returns base histogram data: per-region median price change, in percent,
 * of the listings priced both in the first priced scrape of the last 12
 * months and in the latest one, never across a change of price definition.
 * Precomputed into price_trends at each data refresh (dbt model
 * data/transform/models/marts/price_trends.sql).
 * Empty when there is nothing to compare yet.
 * Dates are read as text: a calendar day, the same in every time zone.
 * @returns {Promise<Array<{ region: string, pct: number|null, start_date: string, end_date: string, n_listings: number }>>}
 */
exports.getHistogramBase = async () => {
  const rows = await all(
    `
    SELECT region, pct, start_date::text AS start_date, end_date::text AS end_date, n_listings
    FROM public.price_trends
    ORDER BY pct DESC NULLS LAST, region ASC;
  `,
    []
  );

  return rows.map((r) => ({
    region: r.region,
    pct: r.pct != null ? Number(r.pct) : null,
    start_date: r.start_date,
    end_date: r.end_date,
    n_listings: Number(r.n_listings),
  }));
};
