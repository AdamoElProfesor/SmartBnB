/**
 * Maps raw rows to heatmap points (lat, lng, weight) and filters invalid values
 * @param {Array<any>} rows
 * @returns {Array<{ lat: number, lng: number, weight: number }>}
 */
function mapRowsToPoints(rows) {
  return (rows || [])
    .map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lng),
      weight: r.weight != null ? Number(r.weight) : null,
    }))
    .filter(
      (p) =>
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng) &&
        Number.isFinite(p.weight)
    );
}

/**
 * Computes min/max of weights
 * @param {Array<{ weight: number }>} points
 * @param {{ clipP95?: boolean }} [options]
 * @returns {{ min: number|null, max: number|null, maxUsed: number|null, method: string }}
 */
function computeRange(points, { clipP95 = true } = {}) {
  const ws = points
    .map((p) => p.weight)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!ws.length)
    return { min: null, max: null, maxUsed: null, method: "none" };

  const min = ws[0];
  const realMax = ws[ws.length - 1];

  let maxUsed = realMax;
  if (clipP95 && ws.length >= 20) {
    const i95 = Math.floor(ws.length * 0.95) - 1;
    maxUsed = Math.max(ws[i95], min);
  }
  return {
    min,
    max: realMax,
    maxUsed,
    method: clipP95 ? "min…p95" : "min…max",
  };
}

/**
 * Normalizes point weights beetween 0 and 1 using min–max
 * @param {Array<{ lat: number, lng: number, weight: number|null }>} points
 * @param {{ min: number|null, maxUsed: number|null }} range
 * @returns {{ points: Array<{ lat: number, lng: number, weight: number }>, normalization: { min: number|null, max: number|null, method: string } }}
 */
function applyNormalization(points, { min, maxUsed }) {
  if (!points.length || min == null || maxUsed == null) {
    return { points, normalization: { min, max: maxUsed, method: "min-max" } };
  }
  const denom = maxUsed - min || 1;
  const normalized = points.map((p) => ({
    ...p,
    weight: (p.weight - min) / denom,
  }));
  return {
    points: normalized,
    normalization: { min, max: maxUsed, method: "min-max" },
  };
}

exports.mapRowsToPoints = mapRowsToPoints;
exports.computeRange = computeRange;
exports.applyNormalization = applyNormalization;
