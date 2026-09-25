const crypto = require("crypto");
const OpenAI = require("openai");

const EMPTY_ANALYSIS = { pros: [], cons: [], summary: "" };
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
// A hung AI endpoint must not hold the request open: fail fast, retry once at most
const AI_TIMEOUT_MS = 15_000;
const AI_MAX_RETRIES = 1;

let client = null;

/**
 * Returns a shared client for any OpenAI-compatible API, or null when no key is configured.
 * AI_BASE_URL + AI_API_KEY point to an OpenAI-compatible endpoint (e.g. the Workers AI
 * Worker serving open-weights models); OPENAI_API_KEY alone falls back to OpenAI.
 * @returns {OpenAI|null}
 */
function getClient() {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!client) {
    client = new OpenAI({
      apiKey,
      baseURL: process.env.AI_BASE_URL || undefined,
      timeout: AI_TIMEOUT_MS,
      maxRetries: AI_MAX_RETRIES,
    });
  }
  return client;
}

/**
 * Model to request; an empty AI_MODEL lets an OpenAI-compatible endpoint pick its default
 * @returns {string|undefined}
 */
function getModel() {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  return process.env.AI_BASE_URL ? undefined : DEFAULT_OPENAI_MODEL;
}

/**
 * Builds a concise prompt to get pros/cons JSON for a listing
 * @param {{ listing: object, smartScore: number }} input
 * @returns {string}
 */
function buildProConsPrompt({ listing, smartScore }) {
  const playload = {
    smartScore: smartScore,
    id: listing.id,
    name: listing.name,
    neighborhood: listing.neighborhood,
    neighborhood_group: listing.neighborhood_group,
    room_type: listing.room_type,
    accommodates: listing.accommodates,
    price: listing.price,
    median_price: listing.median_price,
    avg_price: listing.avg_price,
    price_position_vs_neighborhood:
      listing.price && listing.median_price
        ? listing.price < 0.95 * listing.median_price
          ? "below"
          : listing.price > 1.05 * listing.median_price
          ? "above"
          : "at"
        : "unknown",
    rating: listing.review_scores_rating ?? null,
    neighborhood_avg_rating: listing.neighborhood_avg_rating ?? null,
    reviews_per_month: listing.reviews_per_month ?? null,
    number_of_reviews_ltm: listing.number_of_reviews_ltm ?? null,
    neighborhood_avg_reviews_per_month:
      listing.neighborhood_avg_reviews_per_month ?? null,
    host_is_superhost: listing.host_is_superhost,
    amenities_score: listing.amenities_score,
    amenities: listing.amenities || [],
    missing_amenities: listing.missing_amenities || [],
  };
  return [
    "You are a short-term rental analyst for the canton of Vaud, Switzerland.",
    "Using ONLY the JSON below, return STRICTLY a JSON object (no text outside the JSON) in this format:",
    `{
      "pros": ["..."],     // 2-4 concrete strengths
      "cons": ["..."],     // 2-4 specific points to watch out for
      "summary": "...",    // 1-2 sentences, objective
    }`,
    "Rules:",
    "- Base the analysis ONLY on the data provided. Do not invent amenities.",
    "- Use the neighbourhood median/average to judge the price.",
    "- Write in English, in a concise and clear style.",
    "",
    "DATA:",
    JSON.stringify(playload, null, 2),
  ].join("\n");
}

/**
 * Parses the JSON object in a model reply; open-weights models sometimes wrap it
 * in a ```json fence or add a sentence around it
 * @param {string} content
 * @returns {object}
 */
function parseJsonObject(content) {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("No JSON object in reply");
    return JSON.parse(content.slice(start, end + 1));
  }
}

/**
 * Keeps non-empty string points, without the trailing commas some models leave
 * @param {unknown} points
 * @returns {string[]}
 */
function cleanPoints(points) {
  if (!Array.isArray(points)) return [];
  return points
    .filter((p) => typeof p === "string")
    .map((p) => p.replace(/[\s,;]+$/, "").trim())
    .filter(Boolean);
}

/**
 * Cache key parts for an analysis: the model name and a hash of the exact
 * prompt, so any change in the listing data (new scrape, new price, new
 * score) gives a new version. Returns null when no AI is configured.
 * @param {{ listing: object, smartScore: number }} input
 * @returns {{ model: string, dataVersion: string }|null}
 */
function analysisCacheKey(input) {
  if (!getClient()) return null;
  const hash = crypto.createHash("sha256").update(buildProConsPrompt(input)).digest("hex");
  return { model: getModel() || "default", dataVersion: `sha256:${hash.slice(0, 32)}` };
}

/**
 * True when the analysis holds at least one point or a summary
 * @param {{ pros?: string[], cons?: string[], summary?: string }|null|undefined} analysis
 * @returns {boolean}
 */
function isNonEmptyAnalysis(analysis) {
  return Boolean(
    analysis &&
      ((analysis.pros && analysis.pros.length) ||
        (analysis.cons && analysis.cons.length) ||
        (analysis.summary && analysis.summary.trim()))
  );
}

/**
 * Calls the configured AI endpoint to get pros/cons JSON for a listing
 * Returns an empty analysis when no API key is set or the call fails
 * @param {{ listing: object, smartScore: number }} input
 * @returns {Promise<{ pros: string[], cons: string[], summary: string }>}
 */
async function chatProsCons(input) {
  const openai = getClient();
  if (!openai) return { ...EMPTY_ANALYSIS };

  const prompt = buildProConsPrompt(input);
  let response;
  try {
    response = await openai.chat.completions.create({
      model: getModel(),
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: "You return ONLY valid JSON." },
        { role: "user", content: prompt },
      ],
    });
  } catch (e) {
    console.error("[ai] AI call failed:", e.message);
    return { ...EMPTY_ANALYSIS };
  }

  const content = response.choices?.[0]?.message?.content || "";
  try {
    const json = parseJsonObject(content);
    return {
      pros: cleanPoints(json.pros),
      cons: cleanPoints(json.cons),
      summary: typeof json.summary === "string" ? json.summary : "",
    };
  } catch {
    return { ...EMPTY_ANALYSIS };
  }
}

exports.chatProsCons = chatProsCons;
exports.analysisCacheKey = analysisCacheKey;
exports.isNonEmptyAnalysis = isNonEmptyAnalysis;
