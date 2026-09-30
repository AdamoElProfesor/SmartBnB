const DEFAULTS = {
  weights: { price: 0.45, reviews: 0.3, amenities: 0.15, superhost: 0.1 },
  priceBands: { goodRatio: 0.8, badRatio: 1.3 },
  reviewsBands: { lowRatio: 0.5, highRatio: 1.5 },
  amenitiesNorm: "listing-db",
  // A baseline built on fewer listings is shown as a small sample
  minComparables: 5,
};

// Order of the parts in the breakdown
const PARTS = ["price", "reviews", "amenities", "superhost"];

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
 * Whole points of each part, adding up exactly to the rounded total: each part
 * gets the floor of its exact points, and the points left go to the parts with
 * the largest remainders (largest remainder method). A part never exceeds its max.
 * @param {number[]} exact points of each part, unrounded
 * @param {number} total rounded score
 * @returns {number[]}
 */
function allocatePoints(exact, total) {
  const points = exact.map(Math.floor);
  let left = total - points.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    points[i] += 1;
    left -= 1;
  }
  return points;
}

/**
 * Whether a part could be measured: neutral_missing_data when it fell back to
 * the middle value (0.5) for lack of data, low_sample when its neighbourhood
 * baseline rests on fewer than minComparables listings, ok otherwise
 * @param {string} part
 * @param {object} listing
 * @param {{score:number, detail:Object}} comp
 * @returns {"ok"|"neutral_missing_data"|"low_sample"}
 */
function partStatus(part, listing, comp) {
  const small = (n) => isNum(n) && Number(n) < DEFAULTS.minComparables;
  if (part === "price") {
    const d = comp.detail;
    if (d.reason === "missing_price" || (d.score_median == null && d.score_avg == null)) {
      return "neutral_missing_data";
    }
    return small(listing?.count_airbnb) ? "low_sample" : "ok";
  }
  if (part === "reviews") {
    if (comp.detail.ratio_vs_neighborhood == null) return "neutral_missing_data";
    return small(listing?.neighborhood_n_listings) ? "low_sample" : "ok";
  }
  if (part === "amenities") {
    return comp.detail.normalization === "listing-db" ? "ok" : "neutral_missing_data";
  }
  return "ok";
}

/**
 * The plain values behind each part, for the visitor
 * @param {string} part
 * @param {object} listing
 * @param {{score:number, detail:Object}} comp
 * @returns {Object}
 */
function partInputs(part, listing, comp) {
  const num = (x) => (isNum(x) ? Number(x) : null);
  const d = comp.detail;
  if (part === "price") {
    return {
      price: num(listing?.price),
      median_price: num(listing?.median_price),
      avg_price: num(listing?.avg_price),
      comparables: num(listing?.count_airbnb),
    };
  }
  if (part === "reviews") {
    return {
      reviews_per_month: d.reviews_per_month,
      area_reviews_per_month: d.neighborhood_avg_reviews_per_month,
      comparables: num(listing?.neighborhood_n_listings),
    };
  }
  if (part === "amenities") return { amenities_score: d.amenities_score, min: d.min, max: d.max };
  return { host_is_superhost: d.host_is_superhost };
}

/**
 * Points earned by each part out of its max (its weight x 100), with its
 * status and inputs, in PARTS order. The points add up to the score.
 * @param {object} listing
 * @param {Record<string, {score:number, detail:Object}>} comps
 * @param {Record<string, number>} weights
 * @param {number} score
 * @returns {Array<{ part: string, points: number, max: number, status: string, inputs: Object }>}
 */
function scoreParts(listing, comps, weights, score) {
  const weightOf = (part) => (isNum(weights[part]) ? Number(weights[part]) : 0);
  const exact = PARTS.map((part) => weightOf(part) * comps[part].score * 100);
  const points = allocatePoints(exact, score);
  return PARTS.map((part, i) => ({
    part,
    points: points[i],
    max: Math.round(weightOf(part) * 100),
    status: partStatus(part, listing, comps[part]),
    inputs: partInputs(part, listing, comps[part]),
  }));
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

  const score = Math.round(clamp01(score01) * 100);
  const comps = { price: compPrice, reviews: compReviews, amenities: compAmen, superhost: compSuper };

  return {
    score,
    parts: scoreParts(listing, comps, w, score),
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
