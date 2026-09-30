jest.mock("../src/repositories/factory", () => ({
  listings: { getById: jest.fn() },
  aiAnalyses: { get: jest.fn(), save: jest.fn() },
}));

jest.mock("../src/utils/ai", () => {
  const actual = jest.requireActual("../src/utils/ai");
  return {
    ...actual,
    chatProsCons: jest.fn(),
    analysisCacheKey: jest.fn(),
  };
});

const repo = require("../src/repositories/factory");
const ai = require("../src/utils/ai");
const service = require("../src/services/score.service");

const listing = {
  id: "53584592",
  name: "Petite chambre",
  price: 76,
  median_price: 93.5,
  avg_price: 127,
  review_scores_rating: 4.91,
  host_is_superhost: true,
  amenities_score: 44,
  amenities_min: 5,
  amenities_max: 52,
};
const analysis = { pros: ["Prix bas"], cons: ["Pas de jacuzzi"], summary: "Bon plan." };
const KEY = { model: "@cf/openai/gpt-oss-20b", dataVersion: "sha256:abc", lang: "en" };

describe("score.service analysis cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service._resetFailures();
    repo.listings.getById.mockResolvedValue(listing);
    ai.analysisCacheKey.mockReturnValue(KEY);
  });

  test("the score comes with the analysis when it is cached", async () => {
    repo.aiAnalyses.get.mockResolvedValue(analysis);
    const out = await service.computeFromUrl("https://www.airbnb.ch/rooms/53584592");
    expect(out.ok).toBe(true);
    expect(out).toMatchObject({ analysis, analysis_cached: true, analysis_pending: false });
    expect(repo.aiAnalyses.get).toHaveBeenCalledWith({ listingId: "53584592", ...KEY });
    expect(ai.chatProsCons).not.toHaveBeenCalled();
    expect(repo.aiAnalyses.save).not.toHaveBeenCalled();
  });

  test("the score never waits for the AI: a missing analysis is pending", async () => {
    repo.aiAnalyses.get.mockResolvedValue(null);
    const out = await service.computeFromUrl("53584592");
    expect(typeof out.smart_score).toBe("number");
    expect(out).toMatchObject({ analysis: null, analysis_cached: false, analysis_pending: true });
    expect(ai.chatProsCons).not.toHaveBeenCalled();
  });

  test("a cache read error only makes the analysis pending", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    repo.aiAnalyses.get.mockRejectedValue(new Error("relation does not exist"));
    const out = await service.computeFromUrl("53584592");
    expect(out).toMatchObject({ ok: true, analysis: null, analysis_pending: true });
    console.error.mockRestore();
  });

  test("without an AI configured nothing is pending and the cache is not read", async () => {
    ai.analysisCacheKey.mockReturnValue(null);
    const out = await service.computeFromUrl("53584592");
    expect(out).toMatchObject({ analysis: null, analysis_pending: false });
    expect(repo.aiAnalyses.get).not.toHaveBeenCalled();
  });

  test("the language defaults to English", async () => {
    repo.aiAnalyses.get.mockResolvedValue(analysis);
    await service.computeFromUrl("53584592");
    expect(ai.analysisCacheKey).toHaveBeenCalledWith(expect.objectContaining({ lang: "en" }));
  });

  test("analyzeListing reads a cached analysis without calling the AI", async () => {
    repo.aiAnalyses.get.mockResolvedValue(analysis);
    const out = await service.analyzeListing("53584592");
    expect(out).toEqual({ ok: true, listing_id: "53584592", analysis, analysis_cached: true });
    expect(ai.chatProsCons).not.toHaveBeenCalled();
  });

  test("analyzeListing calls the AI once on a miss and stores the analysis", async () => {
    repo.aiAnalyses.get.mockResolvedValue(null);
    ai.chatProsCons.mockResolvedValue(analysis);
    const out = await service.analyzeListing("53584592");
    expect(out).toMatchObject({ analysis, analysis_cached: false });
    expect(ai.chatProsCons).toHaveBeenCalledTimes(1);
    expect(repo.aiAnalyses.save).toHaveBeenCalledWith({ listingId: "53584592", ...KEY, analysis });
  });

  test("the analysis is asked and cached in the requested language", async () => {
    const french = { ...KEY, lang: "fr" };
    ai.analysisCacheKey.mockReturnValue(french);
    repo.aiAnalyses.get.mockResolvedValue(null);
    ai.chatProsCons.mockResolvedValue(analysis);
    await service.analyzeListing("53584592", { lang: "fr" });
    expect(ai.analysisCacheKey).toHaveBeenCalledWith(expect.objectContaining({ lang: "fr" }));
    expect(ai.chatProsCons).toHaveBeenCalledWith(expect.objectContaining({ lang: "fr" }));
    expect(repo.aiAnalyses.get).toHaveBeenCalledWith({ listingId: "53584592", ...french });
    expect(repo.aiAnalyses.save).toHaveBeenCalledWith({ listingId: "53584592", ...french, analysis });
  });

  test("an AI failure gives an empty analysis, which is not stored", async () => {
    repo.aiAnalyses.get.mockResolvedValue(null);
    ai.chatProsCons.mockResolvedValue({ pros: [], cons: [], summary: "" });
    const out = await service.analyzeListing("53584592");
    expect(out).toMatchObject({ ok: true, analysis: { pros: [], cons: [], summary: "" } });
    expect(repo.aiAnalyses.save).not.toHaveBeenCalled();
  });

  test("after an empty analysis the listing is not sent to the AI again for a while", async () => {
    repo.aiAnalyses.get.mockResolvedValue(null);
    ai.chatProsCons.mockResolvedValue({ pros: [], cons: [], summary: "" });
    await service.analyzeListing("53584592");
    const out = await service.analyzeListing("53584592");
    expect(out.ok).toBe(true);
    expect(out.analysis).toEqual({ pros: [], cons: [], summary: "" });
    expect(ai.chatProsCons).toHaveBeenCalledTimes(1);
  });

  test("parallel requests for one listing share a single AI call", async () => {
    repo.aiAnalyses.get.mockResolvedValue(null);
    let resolve;
    ai.chatProsCons.mockReturnValue(new Promise((r) => (resolve = r)));
    const both = Promise.all([service.analyzeListing("53584592"), service.analyzeListing("53584592")]);
    await new Promise((r) => setImmediate(r));
    resolve(analysis);
    const [a, b] = await both;
    expect(a.analysis).toEqual(analysis);
    expect(b.analysis).toEqual(analysis);
    expect(ai.chatProsCons).toHaveBeenCalledTimes(1);
    expect(repo.aiAnalyses.save).toHaveBeenCalledTimes(1);
  });

  test("a cache database error falls back to the AI", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    repo.aiAnalyses.get.mockRejectedValue(new Error("relation does not exist"));
    repo.aiAnalyses.save.mockRejectedValue(new Error("relation does not exist"));
    ai.chatProsCons.mockResolvedValue(analysis);
    const out = await service.analyzeListing("53584592");
    expect(out.ok).toBe(true);
    expect(out.analysis).toEqual(analysis);
    console.error.mockRestore();
  });

  test("analyzeListing never sends a listing that left Airbnb, nor an unknown one", async () => {
    repo.listings.getById.mockResolvedValue({ ...listing, is_active: false });
    expect(await service.analyzeListing("53584592")).toMatchObject({ ok: true, analysis: null });
    repo.listings.getById.mockResolvedValue(null);
    expect(await service.analyzeListing("1")).toEqual({ ok: false, error: "Listing not found" });
    expect(ai.chatProsCons).not.toHaveBeenCalled();
  });

  test("a listing that left Airbnb is not scored and never reaches the AI", async () => {
    repo.listings.getById.mockResolvedValue({ ...listing, is_active: false, last_seen: "2025-03-16" });
    const out = await service.computeFromUrl("53584592");
    expect(out).toMatchObject({
      ok: true,
      active: false,
      last_seen: "2025-03-16",
      smart_score: null,
      breakdown: null,
      analysis: null,
    });
    expect(out.listing.name).toBe("Petite chambre");
    expect(ai.chatProsCons).not.toHaveBeenCalled();
    expect(repo.aiAnalyses.get).not.toHaveBeenCalled();
  });

  test("an active listing says so, and a listing without activity data counts as active", async () => {
    repo.aiAnalyses.get.mockResolvedValue(analysis);
    repo.listings.getById.mockResolvedValue({ ...listing, is_active: true, last_seen: "2026-09-14" });
    expect(await service.computeFromUrl("53584592")).toMatchObject({ active: true, last_seen: "2026-09-14" });
    repo.listings.getById.mockResolvedValue(listing);
    const out = await service.computeFromUrl("53584592");
    expect(out.active).toBe(true);
    expect(typeof out.smart_score).toBe("number");
  });

  test("the score comes with the points of each part, which add up to it", async () => {
    repo.aiAnalyses.get.mockResolvedValue(analysis);
    repo.listings.getById.mockResolvedValue({ ...listing, count_airbnb: 3 });
    const out = await service.computeFromUrl("53584592");
    expect(out.breakdown.map((p) => p.part)).toEqual(["price", "reviews", "amenities", "superhost"]);
    expect(out.breakdown.reduce((sum, p) => sum + p.points, 0)).toBe(out.smart_score);
    expect(out.breakdown[0]).toMatchObject({ max: 45, status: "low_sample", inputs: { price: 76, comparables: 3 } });
    // No reviews baseline in the test listing: the part is neutral and says so
    expect(out.breakdown[1].status).toBe("neutral_missing_data");
  });

  test("invalid or unknown listings never reach the AI", async () => {
    expect(await service.computeFromUrl("https://evil.com/rooms/1")).toEqual({ ok: false, error: "Invalid Airbnb URL" });
    repo.listings.getById.mockResolvedValue(null);
    expect(await service.computeFromUrl("123")).toEqual({ ok: false, error: "Listing not found" });
    expect(ai.chatProsCons).not.toHaveBeenCalled();
  });
});
