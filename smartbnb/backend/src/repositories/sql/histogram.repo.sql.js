const { all } = require("../../config/db_sql");

/**
 * Returns base histogram data: per-region % change of median price over the
 * 12 months before the latest priced scrape (first vs last scrape with prices)
 * @returns {Promise<Array<{ region: string, pct: number|null }>>}
 */
exports.getHistogramBase = async () => {
  const rows = await all(
    `
    WITH priced AS (
      SELECT scrape_id, MIN(last_scraped) AS scraped_on
      FROM airbnb_snapshots
      WHERE price IS NOT NULL
      GROUP BY scrape_id
    ),
    bounds AS (
      SELECT
        (SELECT MIN(scrape_id) FROM priced
          WHERE scraped_on >= (SELECT MAX(scraped_on) FROM priced) - interval '12 months') AS m_min,
        (SELECT MAX(scrape_id) FROM priced) AS m_max
    ),
    agg AS (
      SELECT
        coalesce(v.neighbourhood_group_cleansed, 'Unknown') AS region,
        s.scrape_id AS month_bucket,
        percentile_disc(0.5) within group (order by s.price)::float AS val
      FROM airbnb_snapshots s
      JOIN airbnb_vaud v ON v.id = s.listing_id
      WHERE s.price IS NOT NULL
        AND s.scrape_id IN (SELECT m_min FROM bounds UNION SELECT m_max FROM bounds)
      GROUP BY 1, 2
    ),
    joined AS (
      SELECT
        a_min.region,
        a_min.val AS start_val,
        a_max.val AS end_val
      FROM bounds b
      JOIN agg a_min ON a_min.month_bucket = b.m_min
      JOIN agg a_max ON a_max.month_bucket = b.m_max AND a_max.region = a_min.region
    )
    SELECT
      region,
      CASE
        WHEN start_val IS NULL OR start_val = 0 THEN NULL
        ELSE ((end_val - start_val) / start_val) * 100.0
      END AS pct
    FROM joined
    ORDER BY pct DESC NULLS LAST, region ASC;
  `,
    []
  );

  return rows.map((r) => ({
    region: r.region,
    pct: r.pct != null ? Number(r.pct) : null,
  }));
};
