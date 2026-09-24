const DEFAULTS = {
  weights: { price: 0.45, reviews: 0.3, amenities: 0.15, superhost: 0.1 },
  priceBands: { goodRatio: 0.8, badRatio: 1.3 },
  reviewsBands: { lowRatio: 0.5, highRatio: 1.5 },
  amenitiesNorm: "listing-db",
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const isNum = (x) => x != null && Number.isFinite(Number(x));

/**
 * Map a price ratio to a score between 0 and 1
 * @param {number|null} ratio
 * @param {priceBands} bands
 * @returns {number|null}
 */
function ratioToScore(ratio, brackets) {
  if (!isNum(ratio)) return null;

  const hasValidBrackets =
    brackets &&
    isNum(brackets.goodRatio) &&
    isNum(brackets.badRatio) &&
    Number(brackets.badRatio) > Number(brackets.goodRatio);

  const bands = hasValidBrackets ? brackets : DEFAULTS.priceBands;

  const good = Number(bands.goodRatio);
  const bad = Number(bands.badRatio);

  if (!isNum(good) || !isNum(bad) || bad <= good) return null;

  const s = (bad - ratio) / (bad - good);
  return clamp01(s);
}

/**
 * Map a ratio to a score between 0 and 1, where higher is better
 * @param {number|null} ratio
 * @param {reviewsBands} bands
 * @returns {number|null}
 */
function ratioHigherIsBetter(ratio, bands) {
  if (!isNum(ratio)) return null;
  const b =
    bands &&
    isNum(bands.lowRatio) &&
    isNum(bands.highRatio) &&
    bands.highRatio > bands.lowRatio
      ? bands
      : DEFAULTS.reviewsBands;
  const lo = Number(b.lowRatio);
  const hi = Number(b.highRatio);
  if (!isNum(lo) || !isNum(hi) || hi <= lo) return null;

  const s = (ratio - lo) / (hi - lo);
  return clamp01(s);
}

/**
 * Compute the price component between 0 and 1 based on price vs neighborhood stats
 * @param {listingInput} listing
 * @param {{priceBands: pricebands}} cfg
 * @returns {{score:number, detail:Object}}
 */
function priceComponent(listing, cfg) {
  const { price, median_price, avg_price } = listing || {};
  if (!isNum(price)) return { score: 0.5, detail: { reason: "missing_price" } };

  const bands =
    cfg &&
    cfg.priceBands &&
    isNum(cfg.priceBands.goodRatio) &&
    isNum(cfg.priceBands.badRatio)
      ? cfg.priceBands
      : DEFAULTS.priceBands;

  const rMed = isNum(median_price) ? price / median_price : null;
  const rAvg = isNum(avg_price) ? price / avg_price : null;

  const sMed = ratioToScore(rMed, bands);
  const sAvg = ratioToScore(rAvg, bands);

  let score;
  if (sMed != null && sAvg != null) score = 0.7 * sMed + 0.3 * sAvg;
  else if (sMed != null) score = sMed;
  else if (sAvg != null) score = sAvg;
  else score = 0.5;

  return {
    score,
    detail: {
      price,
      median_price: median_price ?? null,
      avg_price: avg_price ?? null,
      ratio_median: rMed ?? null,
      ratio_avg: rAvg ?? null,
      score_median: sMed ?? null,
      score_avg: sAvg ?? null,
    },
  };
}

/**
 * Compute superhost component: 1 if superhost, else 0
 * @param {listingInput} listing
 * @returns {{score:number, detail:{host_is_superhost:boolean}}}
 */
function superhostComponent(listing) {
  const is = !!(listing && listing.host_is_superhost);
  return { score: is ? 1 : 0, detail: { host_is_superhost: is } };
}

/**
 * Normalize amenities_score to a value between 0 and 1
 * @param {listingInput} listing
 * @returns {{score:number, detail:{amenities_score:number, normalization:string, min:number, max:number}}}
 */
function amenitiesComponent(listing) {
  const raw = Number(listing?.amenities_score ?? 0);
  const amin = Number(listing?.amenities_min ?? NaN);
  const amax = Number(listing?.amenities_max ?? NaN);

  let lo = null,
    hi = null,
    method = "unknown-range";

  if (isNum(amin) && isNum(amax) && amax > amin) {
    lo = amin;
    hi = amax;
    method = "listing-db";
  }

  const score01 =
    isNum(lo) && isNum(hi) && hi > lo ? clamp01((raw - lo) / (hi - lo)) : 0.5; // neutral when no valid range

  return {
    score: score01,
    detail: {
      amenities_score: raw,
      normalization: method,
      min: isNum(lo) ? lo : null,
      max: isNum(hi) ? hi : null,
    },
  };
}

/**
 * Compute reviews component between 0 and 1 based on reviews_per_month vs neighborhood average
 * @param {listingInput} listing
 * @param {reviewsBands} cfg
 * @returns {{score:number, detail:Object}}
 */
function reviewsComponent(listing, cfg) {
  const rpmListing = isNum(listing?.reviews_per_month)
    ? Number(listing.reviews_per_month)
    : isNum(listing?.number_of_reviews_ltm)
    ? Number(listing.number_of_reviews_ltm) / 12
    : null;

  const rpmNeighborhood = isNum(listing?.neighborhood_avg_reviews_per_month)
    ? Number(listing.neighborhood_avg_reviews_per_month)
    : null;

  const r =
    isNum(rpmListing) && isNum(rpmNeighborhood) && rpmNeighborhood > 0
      ? rpmListing / rpmNeighborhood
      : null;

  const s = ratioHigherIsBetter(r, cfg && cfg.reviewsBands);

  return {
    score: s == null ? 0.5 : s,
    detail: {
      reviews_per_month: isNum(rpmListing) ? rpmListing : null,
      neighborhood_avg_reviews_per_month: isNum(rpmNeighborhood)
        ? rpmNeighborhood
        : null,
      ratio_vs_neighborhood: r,
      bands: (cfg && cfg.reviewsBands) || DEFAULTS.reviewsBands,
      note:
        s == null ? "neutral_due_to_missing_baseline_or_listing_value" : null,
    },
  };
}

/**
 * Compute final SmartBnB score (0..100) + breakdown
 * @param {listingInput} listing
 * @param {scoreConfig} [config]
 * @returns {smartScoreResult}
 */
function computeSmartScore(listing, config = {}) {
  const cfg = {
    weights: { ...DEFAULTS.weights, ...(config.weights || {}) },
    priceBands: { ...DEFAULTS.priceBands, ...(config.priceBands || {}) },
    reviewsBands: { ...DEFAULTS.reviewsBands, ...(config.reviewsBands || {}) },
    amenitiesNorm: "listing-db",
  };

  const compPrice = priceComponent(listing, cfg);
  const compReviews = reviewsComponent(listing, cfg);
  const compSuper = superhostComponent(listing, cfg);
  const compAmen = amenitiesComponent(listing, cfg);

  const w = cfg.weights;

  const score01 =
    (isNum(w.price) ? w.price : 0) * compPrice.score +
    (isNum(w.reviews) ? w.reviews : 0) * compReviews.score +
    (isNum(w.superhost) ? w.superhost : 0) * compSuper.score +
    (isNum(w.amenities) ? w.amenities : 0) * compAmen.score;

  return {
    score: Math.round(clamp01(score01) * 100),
    breakdown: {
      weights: {
        price: w.price,
        reviews: w.reviews,
        superhost: w.superhost,
        amenities: w.amenities,
      },
      price: compPrice.detail,
      reviews: compReviews.detail,
      superhost: compSuper.detail,
      amenities: compAmen.detail,
    },
  };
}

exports.computeSmartScore = computeSmartScore;
exports.DEFAULTS = DEFAULTS;
