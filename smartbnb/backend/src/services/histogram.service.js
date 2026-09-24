const repo = require("../repositories/factory");

/**
 * Returns base histogram data from the repository
 * @returns {Promise<{ ok: true, data: Array<{ region: string, pct: number|null }> }>}
 */
exports.getHistogramBase = async () => {
  const data = await repo.histogram.getHistogramBase();
  return { ok: true, data };
};
