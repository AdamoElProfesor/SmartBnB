const { all } = require("../../config/db_sql");

/**
 * Returns base histogram data: per-region % change of median price over the
 * 12 months before the latest priced scrape (first vs last scrape with prices).
 * Precomputed into price_trends at each data refresh (dbt model
 * data/transform/models/marts/price_trends.sql).
 * Empty when only one scrape has prices: there is nothing to compare.
 * @returns {Promise<Array<{ region: string, pct: number|null }>>}
 */
exports.getHistogramBase = async () => {
  const rows = await all(
    `
    SELECT region, pct
    FROM public.price_trends
    ORDER BY pct DESC NULLS LAST, region ASC;
  `,
    []
  );

  return rows.map((r) => ({
    region: r.region,
    pct: r.pct != null ? Number(r.pct) : null,
  }));
};
