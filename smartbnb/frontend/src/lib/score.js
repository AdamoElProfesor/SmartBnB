import { isNum, roomTypeLabel } from "./format";

/** Verdict shown under the SmartScore */
export function verdictFor(score) {
  const s = Number(score ?? 0);
  if (s >= 70) return { word: "Worth booking", note: "Better value than most comparable stays.", color: "var(--good)" };
  if (s >= 50) return { word: "Fair deal", note: "In line with what the area offers.", color: "var(--mid)" };
  return { word: "Look around", note: "Similar stays nearby offer more for the money.", color: "var(--bad)" };
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
  const type = roomTypeLabel(listing.room_type);
  const where = `for ${/^[aeiou]/.test(type) ? "an" : "a"} ${type} in ${listing.neighborhood || "Vaud"}`;
  const sentence =
    Math.abs(diff) < 3
      ? `right at the median ${where}.`
      : `${Math.abs(diff)}% ${diff < 0 ? "below" : "above"} the median ${where}.`;
  return { medianPos: (m / max) * 100, listingPos: Math.min(100, (p / max) * 100), sentence };
}

/** Message shown when POST /api/score fails, by HTTP status */
export function scoreErrorMessage(status) {
  switch (status) {
    case 404:
      return "This listing isn't in our data. SmartBnB only covers listings in canton Vaud that InsideAirbnb has recorded.";
    case 400:
      return "That link doesn't look like an Airbnb listing. Paste the link shared from the Airbnb app, or one that contains /rooms/ followed by a number.";
    case 422:
      return "We couldn't open this share link. Open it in your browser and copy the address from there: it should contain /rooms/ followed by a number.";
    case 429:
      return "You've checked a lot of listings in a short time. Wait a little and try again.";
    default:
      return "The check didn't go through. Try again in a moment.";
  }
}
