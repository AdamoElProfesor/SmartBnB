const { one, query } = require("../../config/db_sql");

/**
 * Cached AI analysis for a listing, data version and model
 * @param {{ listingId: string, dataVersion: string, model: string }} key
 * @returns {Promise<{ pros: string[], cons: string[], summary: string }|null>}
 */
exports.get = async ({ listingId, dataVersion, model }) => {
  const row = await one(
    `SELECT analysis
       FROM public.ai_analyses
      WHERE listing_id = $1 AND data_version = $2 AND model = $3`,
    [String(listingId), dataVersion, model]
  );
  return row ? row.analysis : null;
};

/**
 * Stores an AI analysis; keeps the first one if two requests race
 * @param {{ listingId: string, dataVersion: string, model: string, analysis: object }} entry
 * @returns {Promise<void>}
 */
exports.save = async ({ listingId, dataVersion, model, analysis }) => {
  await query(
    `INSERT INTO public.ai_analyses (listing_id, data_version, model, analysis)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (listing_id, data_version, model) DO NOTHING`,
    [String(listingId), dataVersion, model, JSON.stringify(analysis)]
  );
};
