const service = require("../services/score.service");

/**
 * Computes SmartBnB score from a posted Airbnb URL and returns JSON
 * Accepts body fields: airbnbUrl, include_analysis
 * Responds 400 on invalid URL, 404 if not found
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
async function computeFromUrl(req, res, next) {
  try {
    const raw = req.body?.airbnbUrl;
    const airbnbUrl = typeof raw === "number" && Number.isSafeInteger(raw) ? String(raw) : raw;
    if (typeof airbnbUrl !== "string" || !airbnbUrl.trim()) {
      return res.status(400).json({ ok: false, error: "Invalid Airbnb URL" });
    }

    const data = await service.computeFromUrl(airbnbUrl, {
      includeAnalysis: true,
    });

    if (!data.ok) {
      const code = data.error === "Listing not found" ? 404 : 400;
      return res.status(code).json(data);
    }

    res.json(data);
  } catch (e) {
    next(e);
  }
}

module.exports = { computeFromUrl };
