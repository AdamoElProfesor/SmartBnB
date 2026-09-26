const service = require("../services/score.service");

/**
 * Computes SmartBnB score from a posted Airbnb URL and returns JSON
 * Accepts body field: airbnbUrl
 * Responds 400 on invalid URL, 404 if not found, 422 when a share link
 * from the Airbnb app cannot be resolved
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

    const data = await service.computeFromUrl(airbnbUrl);

    if (!data.ok) {
      const code =
        data.error === "Listing not found" ? 404 : data.error === "Share link could not be resolved" ? 422 : 400;
      return res.status(code).json(data);
    }

    res.json(data);
  } catch (e) {
    next(e);
  }
}

module.exports = { computeFromUrl };
