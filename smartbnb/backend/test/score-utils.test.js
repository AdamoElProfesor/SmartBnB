const { computeSmartScore } = require("../src/utils/score.utils");
const { chatProsCons } = require("../src/utils/ai");

describe("score.utils.computeSmartScore", () => {
  const base = {
    price: 100,
    median_price: 100,
    avg_price: 100,
    host_is_superhost: false,
    amenities_score: 30,
    amenities_min: 0,
    amenities_max: 55,
    neighborhood_avg_rating: 4.7,
  };

  test("reviews component compares reviews per month to the neighbourhood average", () => {
    const busy = computeSmartScore({
      ...base,
      reviews_per_month: 3,
      neighborhood_avg_reviews_per_month: 1,
    });
    const quiet = computeSmartScore({
      ...base,
      reviews_per_month: 0.2,
      neighborhood_avg_reviews_per_month: 1,
    });

    expect(busy.breakdown.reviews.ratio_vs_neighborhood).toBe(3);
    expect(quiet.breakdown.reviews.ratio_vs_neighborhood).toBeCloseTo(0.2);
    expect(busy.score).toBeGreaterThan(quiet.score);
  });

  test("reviews component is neutral without a neighbourhood baseline", () => {
    const result = computeSmartScore({ ...base, reviews_per_month: 3 });
    expect(result.breakdown.reviews.ratio_vs_neighborhood).toBeNull();
    expect(result.breakdown.reviews.note).toBe(
      "neutral_due_to_missing_baseline_or_listing_value"
    );
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
