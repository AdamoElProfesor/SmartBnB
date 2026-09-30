const service = require("../services/score.service");
const { parseLang, parseListingId } = require("../utils/validation");

/**
 * Computes SmartBnB score from a posted Airbnb URL and returns JSON
 * Accepts body fields: airbnbUrl, lang (language of the AI analysis, "en" by default)
 * Responds 400 on invalid URL or language, 404 if not found, 422 when a share
 * link from the Airbnb app cannot be resolved
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
    const lang = parseLang(req.body?.lang);

    const data = await service.computeFromUrl(airbnbUrl, { lang });

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

/**
 * Returns the AI analysis of a scored listing, written by the AI when it is
 * not cached yet. Accepts body fields: listingId, lang ("en" by default)
 * Responds 400 on an invalid id or language, 404 if not found
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
async function analyze(req, res, next) {
  try {
    const raw = req.body?.listingId;
    const listingId = parseListingId(typeof raw === "number" && Number.isSafeInteger(raw) ? String(raw) : raw);
    const lang = parseLang(req.body?.lang);

    const data = await service.analyzeListing(listingId, { lang });
    if (!data.ok) return res.status(404).json(data);

    res.json(data);
  } catch (e) {
    next(e);
  }
}

module.exports = { computeFromUrl, analyze };
