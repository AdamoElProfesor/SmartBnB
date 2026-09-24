const repo = require("../repositories/factory");

/**
 * Search listings; maps API params (rating_min, sort, limit) to repository
 * @param {{ rating_min?: number, sort?: 'price_asc'|'most_booked'|'rating_desc'|'listing_id_asc'|string, limit?: number }} params
 * @returns {Promise<object[]>}
 */
exports.search = async ({ rating_min, sort, limit = 10 }) => {
  return repo.listings.search({ ratingMin: rating_min, sort, limit });
};

/**
 * Get a single listing by ID (delegates to repository)
 * @param {string|number} id
 * @returns {Promise<object|null>}
 */
exports.getById = async (id) => {
  return repo.listings.getById(id);
};
