const service = require("../services/histogram.service");

exports.base = async (req, res, next) => {
  try {
    const out = await service.getHistogramBase();
    res.json(out);
  } catch (e) {
    next(e);
  }
};
