import { t } from "../i18n";
import { isNum, roomTypeWithArticle } from "./format";

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

/** Message shown when POST /api/score fails, by HTTP status */
export function scoreErrorMessage(status) {
  return [400, 404, 422, 429].includes(status) ? t(`scoreError.${status}`) : t("scoreError.other");
}
