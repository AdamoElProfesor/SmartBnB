const repo = require("../repositories/factory");
const { cached, READ_CACHE_TTL_MS } = require("../utils/cache");

/**
 * Returns base histogram data from the repository
 * @returns {Promise<{ ok: true, data: Array<{ region: string, pct: number|null, start_date: string, end_date: string, n_listings: number }> }>}
 */
exports.getHistogramBase = cached(async () => {
  const data = await repo.histogram.getHistogramBase();
  return { ok: true, data };
}, READ_CACHE_TTL_MS);
