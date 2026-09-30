const repo = require("../repositories/factory");
const urlResolver = require("./url-resolver.service");
const { computeSmartScore } = require("../utils/score.utils");
const { chatProsCons, analysisCacheKey, isNonEmptyAnalysis, DEFAULT_LANG } = require("../utils/ai");

// Analyses being generated right now, so parallel requests for the same
// listing share one AI call instead of each spending quota
const inFlight = new Map();

// Listings whose analysis just came back empty (AI down, rate limited or daily
// budget spent): they are not retried for a few minutes, so a failing endpoint
// is not called again on every check
const FAILURE_TTL_MS = 5 * 60 * 1000;
const MAX_RECENT_FAILURES = 1000;
const recentFailures = new Map();

/**
 * @param {string} flightKey
 * @returns {boolean}
 */
function failedRecently(flightKey) {
  const at = recentFailures.get(flightKey);
  if (at === undefined) return false;
  if (Date.now() - at < FAILURE_TTL_MS) return true;
  recentFailures.delete(flightKey);
  return false;
}

/**
 * @param {string} flightKey
 */
function rememberFailure(flightKey) {
  // Map keeps insertion order: drop the oldest entry to stay bounded
  if (recentFailures.size >= MAX_RECENT_FAILURES) {
    recentFailures.delete(recentFailures.keys().next().value);
  }
  recentFailures.set(flightKey, Date.now());
}

/**
 * The cached analysis of a listing, or null. Never calls the AI.
 * A cache read error counts as a miss.
 * @param {{ listingId: string, model: string, dataVersion: string, lang: string }} cacheKey
 * @returns {Promise<{ pros: string[], cons: string[], summary: string }|null>}
 */
async function cachedAnalysis(cacheKey) {
  try {
    return (await repo.aiAnalyses.get(cacheKey)) || null;
  } catch (e) {
    console.error("[score] analysis cache read failed:", e.message);
    return null;
  }
}

/**
 * AI analysis for a listing, read from the ai_analyses cache when present.
 * Only non-empty analyses are stored; after a failed call the listing is not
 * sent to the AI again for FAILURE_TTL_MS.
 * A cache read or write error never fails the analysis: it falls back to the AI.
 * Logs how long each analysis took, so the real wait of visitors is known.
 * @param {{ listing: object, smartScore: number, lang: string }} input
 * @returns {Promise<{ analysis: { pros: string[], cons: string[], summary: string }, cached: boolean }>}
 */
async function getAnalysis(input) {
  const started = Date.now();
  const out = await analysisFromCacheOrAI(input);
  console.log(
    `[score] analysis listing=${input.listing.id} lang=${input.lang} cached=${out.cached}` +
      ` ok=${isNonEmptyAnalysis(out.analysis)} ms=${Date.now() - started}`
  );
  return out;
}

/**
 * @param {{ listing: object, smartScore: number, lang: string }} input
 * @returns {Promise<{ analysis: { pros: string[], cons: string[], summary: string }, cached: boolean }>}
 */
async function analysisFromCacheOrAI(input) {
  const key = analysisCacheKey(input);
  if (!key) return { analysis: await chatProsCons(input), cached: false };

  const cacheKey = { listingId: String(input.listing.id), ...key };
  const hit = await cachedAnalysis(cacheKey);
  if (hit) return { analysis: hit, cached: true };

  const flightKey = `${cacheKey.listingId}|${key.dataVersion}|${key.model}|${key.lang}`;
  if (inFlight.has(flightKey)) {
    return { analysis: await inFlight.get(flightKey), cached: false };
  }
  if (failedRecently(flightKey)) {
    return { analysis: { pros: [], cons: [], summary: "" }, cached: false };
  }

  const pending = (async () => {
    const analysis = await chatProsCons(input);
    if (isNonEmptyAnalysis(analysis)) {
      try {
        await repo.aiAnalyses.save({ ...cacheKey, analysis });
      } catch (e) {
        console.error("[score] analysis cache write failed:", e.message);
      }
    } else {
      rememberFailure(flightKey);
    }
    return analysis;
  })();
  inFlight.set(flightKey, pending);
  try {
    return { analysis: await pending, cached: false };
  } finally {
    inFlight.delete(flightKey);
  }
}

exports._resetFailures = () => recentFailures.clear();

/**
 * Compute SmartBnB score from an Airbnb URL. It never waits for the AI: the
 * analysis in the given language comes with it only when it is already
 * cached; otherwise analysis_pending tells the client to ask for it with
 * analyzeListing (POST /api/score/analysis).
 * @param {string} airbnbUrl
 * @param {{ lang?: string }} [options]
 * @returns {Promise<{ ok: boolean, error?: string, listing_id?: string, active?: boolean, last_seen?: string|null, smart_score?: number|null, breakdown?: Array<object>|null, listing?: object, analysis?: object|null, analysis_cached?: boolean, analysis_pending?: boolean }>}
 */
exports.computeFromUrl = async (airbnbUrl, { lang = DEFAULT_LANG } = {}) => {
  const { id, shortLink } = await urlResolver.resolveListingId(String(airbnbUrl || ""));
  if (!id) return { ok: false, error: shortLink ? "Share link could not be resolved" : "Invalid Airbnb URL" };

  const listing = await repo.listings.getById(String(id));
  if (!listing) return { ok: false, error: "Listing not found" };

  // A listing no longer on Airbnb cannot be booked: it is not scored and not
  // sent to the AI. No activity row (not computed yet) counts as active.
  const active = listing.is_active !== false;
  const lifetime = { active, last_seen: listing.last_seen ?? null };

  const listingSummary = {
    id: listing.id,
    name: listing.name,
    neighborhood: listing.neighborhood,
    neighborhood_group: listing.neighborhood_group,
    room_type: listing.room_type,
    accommodates: listing.accommodates,
    price: listing.price,
    price_date: listing.price_date ?? null,
    median_price: listing.median_price,
    avg_price: listing.avg_price,
    // What median_price is measured on (price_baselines)
    price_baseline: listing.price_baseline_level
      ? {
          level: listing.price_baseline_level,
          area: listing.price_baseline_area,
          capacity_band: listing.capacity_band,
          n_listings: listing.price_comparables ?? null,
        }
      : null,
    number_of_reviews: listing.number_of_reviews ?? null,
    rating: listing.review_scores_rating,
    neighborhood_avg_rating: listing.neighborhood_avg_rating ?? null,
    reviews_per_month: listing.reviews_per_month ?? null,
    number_of_reviews_ltm: listing.number_of_reviews_ltm ?? null,
    neighborhood_avg_reviews_per_month:
      listing.neighborhood_avg_reviews_per_month ?? null,
    host_is_superhost: listing.host_is_superhost,
    amenities_score: listing.amenities_score,
    amenities: listing.amenities || [],
    missing_amenities: listing.missing_amenities || [],
  };

  if (!active) {
    return {
      ok: true,
      listing_id: String(id),
      ...lifetime,
      smart_score: null,
      breakdown: null,
      listing: listingSummary,
      analysis: null,
      analysis_cached: false,
      analysis_pending: false,
    };
  }

  const score = computeSmartScore(listing);
  // Without an AI configured there is no analysis to wait for
  const key = analysisCacheKey({ listing, smartScore: score.score, lang });
  const analysis = key ? await cachedAnalysis({ listingId: String(listing.id), ...key }) : null;

  return {
    ok: true,
    listing_id: String(id),
    ...lifetime,
    smart_score: score.score,
    breakdown: score.parts,
    listing: listingSummary,
    analysis,
    analysis_cached: analysis !== null,
    analysis_pending: key !== null && analysis === null,
  };
};

/**
 * AI analysis of a listing in the given language: from the cache, or written
 * by the AI (this is the call that spends the AI quota). An AI failure gives
 * an empty analysis, not an error. A listing that left Airbnb gets none.
 * @param {string} listingId
 * @param {{ lang?: string }} [options]
 * @returns {Promise<{ ok: boolean, error?: string, listing_id?: string, analysis?: object|null, analysis_cached?: boolean }>}
 */
exports.analyzeListing = async (listingId, { lang = DEFAULT_LANG } = {}) => {
  const listing = await repo.listings.getById(String(listingId));
  if (!listing) return { ok: false, error: "Listing not found" };
  if (listing.is_active === false) {
    return { ok: true, listing_id: String(listingId), analysis: null, analysis_cached: false };
  }

  const score = computeSmartScore(listing);
  const { analysis, cached } = await getAnalysis({ listing, smartScore: score.score, lang });
  return { ok: true, listing_id: String(listingId), analysis, analysis_cached: cached };
};
