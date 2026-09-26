import { describe, expect, test } from "vitest";
import { priceComparison, scoreErrorMessage, verdictFor } from "../src/lib/score";

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
