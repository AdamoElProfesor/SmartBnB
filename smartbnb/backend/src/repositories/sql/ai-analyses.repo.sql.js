const { one, query } = require("../../config/db_sql");

/**
 * Cached AI analysis for a listing, data version, model and language
 * @param {{ listingId: string, dataVersion: string, model: string, lang: string }} key
 * @returns {Promise<{ pros: string[], cons: string[], summary: string }|null>}
 */
exports.get = async ({ listingId, dataVersion, model, lang }) => {
  const row = await one(
    `SELECT analysis
       FROM public.ai_analyses
      WHERE listing_id = $1 AND data_version = $2 AND model = $3 AND lang = $4`,
    [String(listingId), dataVersion, model, lang]
  );
  return row ? row.analysis : null;
};

/**
 * Stores an AI analysis; keeps the first one if two requests race
 * @param {{ listingId: string, dataVersion: string, model: string, lang: string, analysis: object }} entry
 * @returns {Promise<void>}
 */
exports.save = async ({ listingId, dataVersion, model, lang, analysis }) => {
  await query(
    `INSERT INTO public.ai_analyses (listing_id, data_version, model, lang, analysis)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (listing_id, data_version, model, lang) DO NOTHING`,
    [String(listingId), dataVersion, model, lang, JSON.stringify(analysis)]
  );
};
