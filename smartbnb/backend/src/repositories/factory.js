const path = require("path");

/**
 * Resolve the absolute path of a repository module for the selected variant
 * @param {string} modBase
 * @returns {string}
 */
function resolve(modBase) {
  const variant = "sql";
  return path.join(__dirname, `./${variant}/${modBase}.${variant}.js`);
}

/**
 * Lazily load and cache a repository module
 * @param {string} modBase
 * @returns {() => any}
 */
function lazy(modBase) {
  let cached;
  return () => {
    if (!cached) {
      const full = resolve(modBase);
      cached = require(full);
      console.log(`[repo] loaded ${full}:`, Object.keys(cached));
    }
    return cached;
  };
}

const listingsLazy = lazy("listings.repo");
const heatmapLazy = lazy("heatmap.repo");
const histogramLazy = lazy("histogram.repo");
const aiAnalysesLazy = lazy("ai-analyses.repo");

module.exports = {
  get listings() {
    return listingsLazy();
  },
  get heatmap() {
    return heatmapLazy();
  },
  get histogram() {
    return histogramLazy();
  },
  get aiAnalyses() {
    return aiAnalysesLazy();
  },
};
