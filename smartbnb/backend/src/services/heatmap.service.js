const repo = require("../repositories/factory");

const {
  mapRowsToPoints,
  computeRange,
  applyNormalization,
} = require("../utils/heatmap.utils");

/**
 * Builds heatmap points and normalization metadata from repository rows
 * @param {{ mode?: 'listing'|'neighbourhood' }} [options]
 * @returns {Promise<{ ok: true, points: Array<any>, meta: { mode: string, normalization: { min: number|null, max: number|null } } }>}
 */
async function getHeatMap() {
  const rows = await repo.heatmap.getHeatMap();

  const points = mapRowsToPoints(rows);

  const range = computeRange(points, { clipP95: true });
  const { points: normPoints, normalization } = applyNormalization(
    points,
    range
  );
  const { min, maxUsed, max } = normalization || {};

  return {
    ok: true,
    points: normPoints,
    meta: {
      mode: "listing",
      normalization: { min, max: max ?? maxUsed ?? null },
    },
  };
}

exports.getHeatMap = getHeatMap;
