import { t } from "../i18n";
import { formatNumber, isNum, roomTypeWithArticle } from "./format";

/** Verdict shown under the SmartScore */
export function verdictFor(score) {
  const s = Number(score ?? 0);
  const [level, color] = s >= 70 ? ["good", "var(--good)"] : s >= 50 ? ["fair", "var(--mid)"] : ["poor", "var(--bad)"];
  return { word: t(`verdict.${level}.word`), note: t(`verdict.${level}.note`), color };
}

/**
 * Where the similar listings of a price comparison are: "in Montreux", "in
 * the same district (Riviera-Pays-d'Enhaut)" or "across the canton"; empty
 * when unknown
 * @param {{ level?: string|null, area?: string|null }|null|undefined} baseline
 */
function comparedPlace(baseline) {
  if (!baseline?.level) return "";
  return t(`evaluator.parts.place.${baseline.level}`, { area: baseline.area ?? "" });
}

/** A sentence left with an empty place ends cleanly */
const tidy = (text) => text.replace(/\s+([.,])/g, "$1").trim();

/**
 * Listing price against the median of the similar listings (same room type
 * and capacity band, where price_baseline says): marker positions on the
 * price rule (in %) and the sentence under it. Null without both prices.
 */
export function priceComparison(listing) {
  const p = Number(listing.price);
  const m = Number(listing.median_price);
  if (!isNum(listing.price) || !isNum(listing.median_price) || m <= 0) return null;
  const max = Math.max(p, m) * 1.6;
  const diff = Math.round(((p - m) / m) * 100);
  const type = roomTypeWithArticle(listing.room_type);
  const baseline = listing.price_baseline;
  const band = baseline?.capacity_band && baseline.capacity_band !== "unknown" ? t(`band.${baseline.capacity_band}`) : null;
  const where = !baseline?.level
    ? t("price.where", { type, place: listing.neighborhood || "Vaud" })
    : band
      ? t("price.whereBand", { type, band, place: comparedPlace(baseline) })
      : t("price.whereArea", { type, place: comparedPlace(baseline) });
  const sentence =
    Math.abs(diff) < 3
      ? t("price.at", { where })
      : t(diff < 0 ? "price.below" : "price.above", { pct: Math.abs(diff), where });
  return { medianPos: (m / max) * 100, listingPos: Math.min(100, (p / max) * 100), sentence };
}

/** The sentence saying what a part of the score was measured on */
function partSentence({ part, status, inputs = {} }) {
  const k = (key) => `evaluator.parts.${key}`;
  if (part === "superhost") return t(k(inputs.host_is_superhost ? "superhostYes" : "superhostNo"));
  if (status === "neutral_missing_data") {
    if (part === "price") return t(k(isNum(inputs.price) ? "priceNoBaseline" : "priceNoPrice"));
    if (part === "rating") return t(k("ratingNone"), { area: formatNumber(inputs.area_rating, 2) });
    return t(k(`${part}None`));
  }
  if (part === "price") {
    const ref = isNum(inputs.median_price) ? Number(inputs.median_price) : Number(inputs.avg_price);
    const diff = Math.round(((Number(inputs.price) - ref) / ref) * 100);
    const count = Number(inputs.comparables) || 0;
    const place = comparedPlace(inputs);
    if (Math.abs(diff) < 3) return tidy(t(k("priceAt"), { count, place }));
    return tidy(t(k(diff < 0 ? "priceBelow" : "priceAbove"), { pct: Math.abs(diff), count, place }));
  }
  if (part === "rating") {
    const values = {
      rating: formatNumber(inputs.rating, 2),
      adjusted: formatNumber(inputs.adjusted_rating, 2),
      count: Number(inputs.number_of_reviews) || 0,
    };
    // Say it when few reviews moved the rating that counts
    const moved = Math.abs(Number(inputs.adjusted_rating) - Number(inputs.rating)) >= 0.05;
    return t(k(moved ? "ratingAdjusted" : "ratingVs"), values);
  }
  if (part === "reviews") {
    return t(k("reviewsVs"), {
      value: formatNumber(inputs.reviews_per_month, 1),
      area: formatNumber(inputs.area_reviews_per_month, 1),
    });
  }
  return t(k("amenitiesVs"), { value: inputs.amenities_score, max: inputs.max });
}

/**
 * Rows of the "Why this score" list, from the breakdown of POST /api/score:
 * the points of each part out of its max, what it was measured on, and a
 * warning when its comparison rests on few listings. A neutral part (no data)
 * is marked, so its middle value is never read as a real measure.
 * @param {Array<{ part: string, points: number, max: number, status: string, inputs: object }>|null} breakdown
 */
export function breakdownRows(breakdown) {
  if (!Array.isArray(breakdown)) return [];
  return breakdown.map((p) => ({
    key: p.part,
    label: t(`evaluator.parts.${p.part}`),
    points: p.points,
    max: p.max,
    fill: p.max > 0 ? (p.points / p.max) * 100 : 0,
    neutral: p.status === "neutral_missing_data",
    sentence: partSentence(p),
    warning:
      p.status === "low_sample"
        ? t("evaluator.parts.smallSample", { count: Number(p.inputs?.comparables) || 0 })
        : null,
  }));
}

/** Message shown when POST /api/score fails, by HTTP status */
export function scoreErrorMessage(status) {
  return [400, 404, 422, 429].includes(status) ? t(`scoreError.${status}`) : t("scoreError.other");
}
