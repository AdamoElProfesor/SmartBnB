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
const KEY = { model: "@cf/openai/gpt-oss-20b", dataVersion: "sha256:abc" };

describe("score.service analysis cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service._resetFailures();
    repo.listings.getById.mockResolvedValue(listing);
    ai.analysisCacheKey.mockReturnValue(KEY);
  });

  test("a cache hit skips the AI call", async () => {
    repo.aiAnalyses.get.mockResolvedValue(analysis);
    const out = await service.computeFromUrl("https://www.airbnb.ch/rooms/53584592");
    expect(out.ok).toBe(true);
    expect(out.analysis).toEqual(analysis);
    expect(out.analysis_cached).toBe(true);
    expect(repo.aiAnalyses.get).toHaveBeenCalledWith({ listingId: "53584592", ...KEY });
    expect(ai.chatProsCons).not.toHaveBeenCalled();
    expect(repo.aiAnalyses.save).not.toHaveBeenCalled();
  });

  test("a cache miss calls the AI once and stores the analysis", async () => {
    repo.aiAnalyses.get.mockResolvedValue(null);
    ai.chatProsCons.mockResolvedValue(analysis);
    const out = await service.computeFromUrl("53584592");
    expect(out.analysis).toEqual(analysis);
    expect(out.analysis_cached).toBe(false);
    expect(ai.chatProsCons).toHaveBeenCalledTimes(1);
    expect(repo.aiAnalyses.save).toHaveBeenCalledWith({ listingId: "53584592", ...KEY, analysis });
  });

  test("an empty analysis is not stored", async () => {
    repo.aiAnalyses.get.mockResolvedValue(null);
    ai.chatProsCons.mockResolvedValue({ pros: [], cons: [], summary: "" });
    const out = await service.computeFromUrl("53584592");
    expect(out.ok).toBe(true);
    expect(repo.aiAnalyses.save).not.toHaveBeenCalled();
  });

  test("after an empty analysis the listing is not sent to the AI again for a while", async () => {
    repo.aiAnalyses.get.mockResolvedValue(null);
    ai.chatProsCons.mockResolvedValue({ pros: [], cons: [], summary: "" });
    await service.computeFromUrl("53584592");
    const out = await service.computeFromUrl("53584592");
    expect(out.ok).toBe(true);
    expect(out.analysis).toEqual({ pros: [], cons: [], summary: "" });
    expect(ai.chatProsCons).toHaveBeenCalledTimes(1);
  });

  test("parallel checks of one listing share a single AI call", async () => {
    repo.aiAnalyses.get.mockResolvedValue(null);
    let resolve;
    ai.chatProsCons.mockReturnValue(new Promise((r) => (resolve = r)));
    const both = Promise.all([service.computeFromUrl("53584592"), service.computeFromUrl("53584592")]);
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
    const out = await service.computeFromUrl("53584592");
    expect(out.ok).toBe(true);
    expect(out.analysis).toEqual(analysis);
    console.error.mockRestore();
  });

  test("without an AI configured the cache is not used", async () => {
    ai.analysisCacheKey.mockReturnValue(null);
    ai.chatProsCons.mockResolvedValue({ pros: [], cons: [], summary: "" });
    await service.computeFromUrl("53584592");
    expect(repo.aiAnalyses.get).not.toHaveBeenCalled();
  });

  test("invalid or unknown listings never reach the AI", async () => {
    expect(await service.computeFromUrl("https://evil.com/rooms/1")).toEqual({ ok: false, error: "Invalid Airbnb URL" });
    repo.listings.getById.mockResolvedValue(null);
    expect(await service.computeFromUrl("123")).toEqual({ ok: false, error: "Listing not found" });
    expect(ai.chatProsCons).not.toHaveBeenCalled();
  });
});
