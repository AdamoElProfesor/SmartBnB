import { t } from "../i18n";
import { formatNumber, isNum, roomTypeWithArticle } from "./format";

/** Verdict shown under the SmartScore */
export function verdictFor(score) {
  const s = Number(score ?? 0);
  const [level, color] = s >= 70 ? ["good", "var(--good)"] : s >= 50 ? ["fair", "var(--mid)"] : ["poor", "var(--bad)"];
  return { word: t(`verdict.${level}.word`), note: t(`verdict.${level}.note`), color };
}

/**
 * Listing price against the neighbourhood median: marker positions on the
 * price rule (in %) and the sentence under it. Null without both prices.
 */
export function priceComparison(listing) {
  const p = Number(listing.price);
  const m = Number(listing.median_price);
  if (!isNum(listing.price) || !isNum(listing.median_price) || m <= 0) return null;
  const max = Math.max(p, m) * 1.6;
  const diff = Math.round(((p - m) / m) * 100);
  const where = t("price.where", { type: roomTypeWithArticle(listing.room_type), place: listing.neighborhood || "Vaud" });
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
    return t(k(`${part}None`));
  }
  if (part === "price") {
    const ref = isNum(inputs.median_price) ? Number(inputs.median_price) : Number(inputs.avg_price);
    const diff = Math.round(((Number(inputs.price) - ref) / ref) * 100);
    const count = Number(inputs.comparables) || 0;
    if (Math.abs(diff) < 3) return t(k("priceAt"), { count });
    return t(k(diff < 0 ? "priceBelow" : "priceAbove"), { pct: Math.abs(diff), count });
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
