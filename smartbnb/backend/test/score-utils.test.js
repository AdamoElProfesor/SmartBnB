const { computeSmartScore } = require("../src/utils/score.utils");
const { chatProsCons } = require("../src/utils/ai");

const base = {
  price: 100,
  median_price: 100,
  avg_price: 100,
  price_comparables: 40,
  price_baseline_level: "neighbourhood",
  price_baseline_area: "Lausanne",
  capacity_band: "3-4",
  host_is_superhost: false,
  amenities_score: 30,
  amenities_min: 0,
  amenities_max: 55,
  reviews_per_month: 1,
  neighborhood_avg_reviews_per_month: 1,
  neighborhood_n_listings: 80,
  neighborhood_avg_rating: 4.7,
};

// Only one part counts, so the score is that part's value x 100
const only = (part) => ({
  weights: { price: 0, reviews: 0, rating: 0, amenities: 0, superhost: 0, [part]: 1 },
});
const partOf = (result, name) => result.parts.find((p) => p.part === name);

describe("score.utils price part", () => {
  test.each([
    [70, 100], // far below the median: full points
    [80, 100], // 20% below: still full points
    [105, 50], // halfway between the bands
    [130, 0], // 30% above: no point
    [200, 0], // far above: no point, never negative
  ])("a price of %i against a median of 100 gives %i", (price, expected) => {
    const r = computeSmartScore({ ...base, price, avg_price: null }, only("price"));
    expect(r.score).toBe(expected);
  });

  test("mixes the median (70%) and the average (30%)", () => {
    // 100 is 20% below the median of 125 (1) and 30% above the average (0)
    const r = computeSmartScore({ ...base, price: 100, median_price: 125, avg_price: 100 / 1.3 }, only("price"));
    expect(r.score).toBe(70);
  });

  test("uses the average alone without a median", () => {
    const r = computeSmartScore({ ...base, price: 80, median_price: null, avg_price: 100 }, only("price"));
    expect(r.score).toBe(100);
  });

  test("is neutral (half the points) and flagged when the price is missing", () => {
    const r = computeSmartScore({ ...base, price: null }, only("price"));
    expect(r.score).toBe(50);
    expect(partOf(r, "price").status).toBe("neutral_missing_data");
    expect(r.breakdown.price.reason).toBe("missing_price");
  });

  test("is neutral and flagged without any neighbourhood price", () => {
    const r = computeSmartScore({ ...base, median_price: null, avg_price: null }, only("price"));
    expect(r.score).toBe(50);
    expect(partOf(r, "price").status).toBe("neutral_missing_data");
  });

  test("flags a median built on fewer than 5 listings", () => {
    expect(partOf(computeSmartScore({ ...base, price_comparables: 4 }), "price").status).toBe("low_sample");
    expect(partOf(computeSmartScore({ ...base, price_comparables: 5 }), "price").status).toBe("ok");
  });

  test("returns the price, the prices of the similar listings, where they are and how many", () => {
    expect(partOf(computeSmartScore(base), "price").inputs).toEqual({
      price: 100,
      median_price: 100,
      avg_price: 100,
      comparables: 40,
      level: "neighbourhood",
      area: "Lausanne",
      capacity_band: "3-4",
    });
  });
});

describe("score.utils reviews part", () => {
  test("compares reviews per month to the neighbourhood average", () => {
    const busy = computeSmartScore({ ...base, reviews_per_month: 3 });
    const quiet = computeSmartScore({ ...base, reviews_per_month: 0.2 });
    expect(busy.breakdown.reviews.ratio_vs_neighborhood).toBe(3);
    expect(quiet.breakdown.reviews.ratio_vs_neighborhood).toBeCloseTo(0.2);
    expect(busy.score).toBeGreaterThan(quiet.score);
  });

  test.each([
    [0.4, 0], // half the area or less: no point
    [1, 50], // as busy as the area
    [1.5, 100], // 1.5 times the area or more: full points
  ])("%f reviews a month against 1 in the area gives %i", (rpm, expected) => {
    expect(computeSmartScore({ ...base, reviews_per_month: rpm }, only("reviews")).score).toBe(expected);
  });

  test("falls back to the reviews of the last 12 months", () => {
    const r = computeSmartScore({ ...base, reviews_per_month: null, number_of_reviews_ltm: 18 }, only("reviews"));
    expect(r.breakdown.reviews.reviews_per_month).toBe(1.5);
    expect(r.score).toBe(100);
  });

  test("is neutral and flagged without a neighbourhood baseline", () => {
    const r = computeSmartScore({ ...base, neighborhood_avg_reviews_per_month: null }, only("reviews"));
    expect(r.score).toBe(50);
    expect(r.breakdown.reviews.ratio_vs_neighborhood).toBeNull();
    expect(r.breakdown.reviews.note).toBe("neutral_due_to_missing_baseline_or_listing_value");
    expect(partOf(r, "reviews").status).toBe("neutral_missing_data");
  });

  test("flags a baseline built on fewer than 5 listings", () => {
    const r = computeSmartScore({ ...base, neighborhood_n_listings: 3 });
    expect(partOf(r, "reviews").status).toBe("low_sample");
    expect(partOf(r, "reviews").inputs).toEqual({ reviews_per_month: 1, area_reviews_per_month: 1, comparables: 3 });
  });
});

describe("score.utils rating part", () => {
  const rated = (rating, reviews) => ({ ...base, review_scores_rating: rating, number_of_reviews: reviews, canton_avg_rating: 4.8 });

  test.each([
    [5.0, 1000, 100], // many reviews: its own rating, full points
    [4.75, 1000, 50],
    [4.4, 1000, 0], // an adjusted 4.5 or less gives no point
    [2.0, 1000, 0],
  ])("a rating of %f from %i reviews gives %i", (rating, reviews, expected) => {
    expect(computeSmartScore(rated(rating, reviews), only("rating")).score).toBe(expected);
  });

  test("few reviews are pulled towards the canton's mean rating", () => {
    // (2 x 5.0 + 10 x 4.8) / 12 = 4.83: a perfect score from 2 guests is not a proof
    const fewPerfect = computeSmartScore(rated(5.0, 2), only("rating"));
    expect(partOf(fewPerfect, "rating").inputs).toEqual({
      rating: 5,
      number_of_reviews: 2,
      adjusted_rating: 4.83,
      area_rating: 4.8,
    });
    expect(fewPerfect.score).toBe(67);
    // (6 x 2.0 + 10 x 4.8) / 16 = 3.75: a bad rating from 6 guests still sinks it
    expect(computeSmartScore(rated(2.0, 6), only("rating")).score).toBe(0);
  });

  test("a listing rated 2/5 by many guests loses the whole part", () => {
    const good = computeSmartScore(rated(4.9, 200));
    const bad = computeSmartScore(rated(2.0, 200));
    expect(partOf(good, "rating").points).toBe(12);
    expect(partOf(bad, "rating").points).toBe(0);
    expect(good.score - bad.score).toBe(12);
  });

  test("without a rating it counts as the canton's mean, and says so", () => {
    const r = computeSmartScore({ ...base, canton_avg_rating: 4.8 }, only("rating"));
    expect(r.score).toBe(60);
    expect(partOf(r, "rating").status).toBe("neutral_missing_data");
  });

  test("without a rating nor a mean it is neutral", () => {
    expect(computeSmartScore(base, only("rating")).score).toBe(50);
  });
});

describe("score.utils amenities part", () => {
  test("places the listing between the least and the best equipped", () => {
    const r = computeSmartScore({ ...base, amenities_score: 30, amenities_min: 10, amenities_max: 50 }, only("amenities"));
    expect(r.score).toBe(50);
    expect(partOf(r, "amenities").inputs).toEqual({ amenities_score: 30, min: 10, max: 50 });
  });

  test("stays between 0 and full points", () => {
    const over = { ...base, amenities_score: 70, amenities_min: 10, amenities_max: 50 };
    expect(computeSmartScore(over, only("amenities")).score).toBe(100);
    expect(computeSmartScore({ ...over, amenities_score: 0 }, only("amenities")).score).toBe(0);
  });

  test("is neutral and flagged without a valid range", () => {
    const r = computeSmartScore({ ...base, amenities_min: null, amenities_max: null }, only("amenities"));
    expect(r.score).toBe(50);
    expect(partOf(r, "amenities").status).toBe("neutral_missing_data");
  });
});

describe("score.utils superhost part", () => {
  test("gives all its points to a Superhost and none otherwise", () => {
    expect(partOf(computeSmartScore({ ...base, host_is_superhost: true }), "superhost").points).toBe(10);
    expect(partOf(computeSmartScore({ ...base, host_is_superhost: false }), "superhost").points).toBe(0);
  });
});

describe("score.utils parts", () => {
  test("come in a fixed order with the default maximum points", () => {
    const r = computeSmartScore(base);
    expect(r.parts.map((p) => [p.part, p.max])).toEqual([
      ["price", 45],
      ["reviews", 15],
      ["rating", 15],
      ["amenities", 15],
      ["superhost", 10],
    ]);
  });

  test("a perfect listing gets every point", () => {
    const r = computeSmartScore({
      ...base,
      price: 50,
      reviews_per_month: 5,
      amenities_score: 55,
      host_is_superhost: true,
      review_scores_rating: 5,
      number_of_reviews: 10000,
      canton_avg_rating: 4.8,
    });
    expect(r.score).toBe(100);
    expect(r.parts.map((p) => p.points)).toEqual([45, 15, 15, 15, 10]);
  });

  test("the total is rounded to the nearest point", () => {
    // 0.45 x 0.6 + 0.15 x 0.5 + 0.15 x 0.5 (no rating) + 0.15 x 30/55 = 0.5018
    expect(computeSmartScore(base).score).toBe(50);
  });

  test("always add up to the score and never exceed their max", () => {
    for (let i = 0; i < 200; i++) {
      const r = computeSmartScore({
        ...base,
        price: 40 + ((i * 37) % 160),
        reviews_per_month: ((i * 13) % 30) / 10,
        amenities_score: (i * 7) % 56,
        host_is_superhost: i % 3 === 0,
        median_price: i % 11 === 0 ? null : 100,
      });
      expect(r.parts.reduce((sum, p) => sum + p.points, 0)).toBe(r.score);
      for (const p of r.parts) {
        expect(p.points).toBeGreaterThanOrEqual(0);
        expect(p.points).toBeLessThanOrEqual(p.max);
      }
    }
  });

  test("a listing with every value missing still scores, and says why", () => {
    const r = computeSmartScore({ id: "1" });
    // Price, reviews, rating and amenities neutral (half their points), not a Superhost
    expect(r.score).toBe(45);
    expect(r.parts.map((p) => p.status)).toEqual([
      "neutral_missing_data",
      "neutral_missing_data",
      "neutral_missing_data",
      "neutral_missing_data",
      "ok",
    ]);
  });
});

describe("ai.chatProsCons", () => {
  test("returns an empty analysis when no OpenAI key is configured", async () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    await expect(
      chatProsCons({ listing: { id: "1" }, smartScore: 50 })
    ).resolves.toEqual({ pros: [], cons: [], summary: "" });

    if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
  });
});
