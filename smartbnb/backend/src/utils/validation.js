const { isValidListingId } = require("../services/url-resolver.service");

const SORTS = ["price_asc", "most_booked", "rating_desc", "listing_id_asc"];

/**
 * Error answered as JSON 400 by the API error handler
 * @param {string} message
 * @returns {Error & { status: number, expose: boolean }}
 */
function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

/**
 * Checks a listing id path parameter (digits that fit in a bigint)
 * @param {unknown} id
 * @returns {string}
 */
function parseListingId(id) {
  if (!isValidListingId(id)) throw badRequest("Invalid listing id");
  return id;
}

/**
 * Checks GET /listings query parameters; absent ones are left out
 * @param {Record<string, unknown>} query
 * @returns {{ rating_min?: string, sort?: string, limit?: string }}
 */
function parseSearchQuery(query) {
  const out = {};
  const { rating_min, sort, limit } = query;

  if (limit !== undefined) {
    if (typeof limit !== "string" || !/^\d{1,3}$/.test(limit)) throw badRequest("limit must be an integer from 1 to 100");
    const n = Number(limit);
    if (n < 1 || n > 100) throw badRequest("limit must be an integer from 1 to 100");
    out.limit = limit;
  }

  if (rating_min !== undefined) {
    const n = typeof rating_min === "string" && rating_min.trim() !== "" ? Number(rating_min) : NaN;
    if (!Number.isFinite(n) || n < 0 || n > 5) throw badRequest("rating_min must be a number from 0 to 5");
    out.rating_min = rating_min;
  }

  if (sort !== undefined) {
    if (typeof sort !== "string" || !SORTS.includes(sort)) throw badRequest(`sort must be one of ${SORTS.join(", ")}`);
    out.sort = sort;
  }

  return out;
}

module.exports = { badRequest, parseListingId, parseSearchQuery };
