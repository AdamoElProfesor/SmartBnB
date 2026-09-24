const service = require("../services/listings.service");
const { parseListingId, parseSearchQuery } = require("../utils/validation");

/**
 * Search listings based on query parameters and return JSON; 400 on invalid parameters
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
exports.search = async (req, res, next) => {
  try {
    const data = await service.search(parseSearchQuery(req.query));
    res.json(data);
  } catch (e) {
    next(e);
  }
};

/**
 * Get a single listing by ID and return JSON; 400 on an invalid id, 404 if not found
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
exports.getById = async (req, res, next) => {
  try {
    const data = await service.getById(parseListingId(req.params.id));
    if (!data) {
      return res.status(404).json({ error: "Listing not found" });
    }
    res.json(data);
  } catch (e) {
    next(e);
  }
};
