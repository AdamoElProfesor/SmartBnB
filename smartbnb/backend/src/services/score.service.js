const repo = require("../repositories/factory");
const urlResolver = require("./url-resolver.service");
const { computeSmartScore } = require("../utils/score.utils");
const { chatProsCons, analysisCacheKey, isNonEmptyAnalysis } = require("../utils/ai");

// Analyses being generated right now, so parallel requests for the same
// listing share one AI call instead of each spending quota
const inFlight = new Map();

/**
 * AI analysis for a listing, read from the ai_analyses cache when present.
 * Only non-empty analyses are stored, so a failed call is retried next time.
 * A cache read or write error never fails the score: it falls back to the AI.
 * @param {{ listing: object, smartScore: number }} input
 * @returns {Promise<{ analysis: { pros: string[], cons: string[], summary: string }, cached: boolean }>}
 */
async function getAnalysis(input) {
  const key = analysisCacheKey(input);
  if (!key) return { analysis: await chatProsCons(input), cached: false };

  const cacheKey = { listingId: String(input.listing.id), ...key };
  try {
    const hit = await repo.aiAnalyses.get(cacheKey);
    if (hit) return { analysis: hit, cached: true };
  } catch (e) {
    console.error("[score] analysis cache read failed:", e.message);
  }

  const flightKey = `${cacheKey.listingId}|${key.dataVersion}|${key.model}`;
  if (inFlight.has(flightKey)) {
    return { analysis: await inFlight.get(flightKey), cached: false };
  }

  const pending = (async () => {
    const analysis = await chatProsCons(input);
    if (isNonEmptyAnalysis(analysis)) {
      try {
        await repo.aiAnalyses.save({ ...cacheKey, analysis });
      } catch (e) {
        console.error("[score] analysis cache write failed:", e.message);
      }
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

/**
 * Compute SmartBnB score from an Airbnb URL
 * @param {string} airbnbUrl
 * @returns {Promise<{ ok: boolean, error?: string, listing_id?: string, smart_score?: number, listing?: object, analysis?: object }>}
 */
exports.computeFromUrl = async (airbnbUrl) => {
  const id = urlResolver.extractListingId(String(airbnbUrl || ""));
  if (!id) return { ok: false, error: "Invalid Airbnb URL" };

  const listing = await repo.listings.getById(String(id));
  if (!listing) return { ok: false, error: "Listing not found" };

  const score = computeSmartScore(listing);

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

  const { analysis, cached } = await getAnalysis({ listing, smartScore: score.score });

  return {
    ok: true,
    listing_id: String(id),
    smart_score: score.score,
    listing: listingSummary,
    analysis,
    analysis_cached: cached,
  };
};
