import { describe, expect, test } from "vitest";
import { breakdownRows, priceComparison, scoreErrorMessage, verdictFor } from "../src/lib/score";

describe("breakdownRows", () => {
  const part = (over) => ({ part: "price", points: 20, max: 45, status: "ok", inputs: {}, ...over });

  test("is empty without a breakdown (a listing that left Airbnb)", () => {
    expect(breakdownRows(null)).toEqual([]);
  });

  test("says how far the price is from the median, and on how many stays", () => {
    const [row] = breakdownRows([part({ inputs: { price: 130, median_price: 100, comparables: 42 } })]);
    expect(row).toMatchObject({ label: "Price", points: 20, max: 45, neutral: false, warning: null });
    expect(row.fill).toBeCloseTo(44.44, 1);
    expect(row.sentence).toBe("30% above the median of 42 similar stays.");
  });

  test("falls back to the average price without a median", () => {
    const [row] = breakdownRows([part({ inputs: { price: 100, median_price: null, avg_price: 100, comparables: 1 } })]);
    expect(row.sentence).toBe("At the median of 1 similar stay.");
  });

  test("warns when the comparison rests on few listings", () => {
    const [row] = breakdownRows([
      part({ status: "low_sample", inputs: { price: 90, median_price: 100, comparables: 3 } }),
    ]);
    expect(row.sentence).toBe("10% below the median of 3 similar stays.");
    expect(row.warning).toBe("Compared with only 3 listings: read this with care.");
  });

  test("marks a neutral part and says which data is missing", () => {
    const rows = breakdownRows([
      part({ status: "neutral_missing_data", inputs: { price: null } }),
      part({ status: "neutral_missing_data", inputs: { price: 90, median_price: null, avg_price: null } }),
    ]);
    expect(rows.every((r) => r.neutral)).toBe(true);
    expect(rows[0].sentence).toMatch(/^No recent price/);
    expect(rows[1].sentence).toMatch(/^No similar stays nearby/);
  });

  test("says where the similar stays are: neighbourhood, district or canton", () => {
    const at = (level, area) =>
      breakdownRows([part({ inputs: { price: 90, median_price: 100, comparables: 12, level, area } })])[0].sentence;
    expect(at("neighbourhood", "Montreux")).toBe("10% below the median of 12 similar stays in Montreux.");
    expect(at("district", "Nyon")).toBe("10% below the median of 12 similar stays in the same district (Nyon).");
    expect(at("canton", "Vaud")).toBe("10% below the median of 12 similar stays across the canton.");
  });

  test("describes the guest rating, and says when few reviews moved it", () => {
    const rating = (inputs, status = "ok") => breakdownRows([part({ part: "rating", status, inputs })])[0];
    expect(rating({ rating: 4.9, number_of_reviews: 200, adjusted_rating: 4.9 }).sentence).toBe(
      "Rated 4.90 from 200 reviews."
    );
    expect(rating({ rating: 5, number_of_reviews: 2, adjusted_rating: 4.83 }).sentence).toBe(
      "Rated 5.00 from 2 reviews, counted as 4.83: a few reviews weigh less."
    );
    const none = rating({ rating: null, number_of_reviews: 0, adjusted_rating: 4.8, area_rating: 4.8 }, "neutral_missing_data");
    expect(none.neutral).toBe(true);
    expect(none.label).toBe("Guest rating");
    expect(none.sentence).toBe("No rating yet, so this part counts as the average rating of the canton (4.80).");
  });

  test("describes the reviews, amenities and superhost parts", () => {
    const rows = breakdownRows([
      part({ part: "reviews", inputs: { reviews_per_month: 1.25, area_reviews_per_month: 0.8 } }),
      part({ part: "amenities", inputs: { amenities_score: 30, min: 5, max: 52 } }),
      part({ part: "superhost", inputs: { host_is_superhost: false } }),
    ]);
    expect(rows.map((r) => r.sentence)).toEqual([
      "1.3 reviews a month, against 0.8 on average in the area.",
      "30 amenity points, where the best-equipped stay has 52.",
      "The host is not a Superhost.",
    ]);
  });
});

describe("verdictFor", () => {
  test("uses the 70 and 50 thresholds", () => {
    expect(verdictFor(70).word).toBe("Worth booking");
    expect(verdictFor(69).word).toBe("Fair deal");
    expect(verdictFor(50).word).toBe("Fair deal");
    expect(verdictFor(49).word).toBe("Look around");
  });

  test("treats a missing score as 0", () => {
    expect(verdictFor(undefined).word).toBe("Look around");
  });
});

describe("priceComparison", () => {
  const listing = { price: 80, median_price: 100, room_type: "Private room", neighborhood: "Lausanne" };

  test("says how far below the median the price is", () => {
    const out = priceComparison(listing);
    expect(out.sentence).toBe("20% below the median for a private room in Lausanne.");
    expect(out.medianPos).toBeCloseTo(62.5);
    expect(out.listingPos).toBeCloseTo(50);
  });

  test("names the capacity band and where the similar stays are", () => {
    const baseline = { level: "district", area: "Riviera-Pays-d'Enhaut", capacity_band: "3-4", n_listings: 44 };
    expect(priceComparison({ ...listing, room_type: "Entire home/apt", price_baseline: baseline }).sentence).toBe(
      "20% below the median for an entire home for 3-4 guests in the same district (Riviera-Pays-d'Enhaut)."
    );
    expect(
      priceComparison({ ...listing, price_baseline: { ...baseline, level: "neighbourhood", area: "Lausanne", capacity_band: "unknown" } })
        .sentence
    ).toBe("20% below the median for a private room in Lausanne.");
  });

  test("says above the median", () => {
    expect(priceComparison({ ...listing, price: 150 }).sentence).toMatch(/^50% above the median/);
  });

  test("calls a difference under 3% right at the median", () => {
    expect(priceComparison({ ...listing, price: 102 }).sentence).toBe(
      "right at the median for a private room in Lausanne."
    );
  });

  test("uses an before a vowel", () => {
    expect(priceComparison({ ...listing, room_type: "Entire home/apt" }).sentence).toBe(
      "20% below the median for an entire home in Lausanne."
    );
  });

  test("falls back to Vaud without a neighbourhood", () => {
    expect(priceComparison({ ...listing, neighborhood: null }).sentence).toMatch(/in Vaud\.$/);
  });

  test("returns null without both prices or with a zero median", () => {
    expect(priceComparison({ ...listing, price: null })).toBeNull();
    expect(priceComparison({ ...listing, median_price: undefined })).toBeNull();
    expect(priceComparison({ ...listing, median_price: 0 })).toBeNull();
  });
});

describe("scoreErrorMessage", () => {
  test("has a specific message for each known status", () => {
    const messages = [400, 404, 422, 429].map(scoreErrorMessage);
    expect(messages[0]).toMatch(/doesn't look like an Airbnb listing/);
    expect(messages[1]).toMatch(/isn't in our data/);
    expect(messages[2]).toMatch(/couldn't open this share link/);
    expect(messages[3]).toMatch(/Wait a little/);
  });

  test("falls back to a generic message", () => {
    expect(scoreErrorMessage(500)).toMatch(/didn't go through/);
    expect(scoreErrorMessage(undefined)).toMatch(/didn't go through/);
  });
});
