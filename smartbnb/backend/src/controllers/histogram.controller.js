const service = require("../services/histogram.service");
const { setReadCacheHeaders } = require("../utils/cache");

exports.base = async (req, res, next) => {
  try {
    const out = await service.getHistogramBase();
    setReadCacheHeaders(res);
    res.json(out);
  } catch (e) {
    next(e);
  }
};
