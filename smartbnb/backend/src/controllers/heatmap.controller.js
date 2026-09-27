const service = require("../services/heatmap.service");
const { setReadCacheHeaders } = require("../utils/cache");

/**
 * Returns heatmap data as JSON
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 *
 */
async function getHeatMapController(req, res, next) {
  try {
    const data = await service.getHeatMap();
    setReadCacheHeaders(res);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

module.exports = { getHeatMapController };
