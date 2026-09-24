const request = require("supertest");

jest.mock("../src/services/listings.service", () => ({
  search: jest.fn(),
  getById: jest.fn(),
}));

const listingService = require("../src/services/listings.service");
const app = require("../src/server");

describe("API input validation and errors", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listingService.search.mockResolvedValue([]);
    listingService.getById.mockResolvedValue(null);
  });

  test.each(["abc", "12a", "99999999999999999999", "9223372036854775808", "-1", "1.5"])(
    "GET /api/listings/%s returns JSON 400",
    async (id) => {
      const res = await request(app).get(`/api/listings/${id}`);
      expect(res.status).toBe(400);
      expect(res.headers["content-type"]).toMatch(/json/);
      expect(res.body).toEqual({ ok: false, error: "Invalid listing id" });
      expect(listingService.getById).not.toHaveBeenCalled();
    }
  );

  test.each(["-1", "0", "1.5", "101", "abc", ""])("GET /api/listings?limit=%s returns JSON 400", async (limit) => {
    const res = await request(app).get("/api/listings").query({ limit });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/limit/);
    expect(listingService.search).not.toHaveBeenCalled();
  });

  test("GET /api/listings?limit=100 is accepted", async () => {
    const res = await request(app).get("/api/listings").query({ limit: 100 });
    expect(res.status).toBe(200);
    expect(listingService.search).toHaveBeenCalledWith({ limit: "100" });
  });

  test("repeated limit parameters are rejected", async () => {
    const res = await request(app).get("/api/listings?limit=1&limit=2");
    expect(res.status).toBe(400);
  });

  test("invalid rating_min and sort return JSON 400", async () => {
    expect((await request(app).get("/api/listings").query({ rating_min: "x" })).status).toBe(400);
    expect((await request(app).get("/api/listings").query({ rating_min: "9" })).status).toBe(400);
    expect((await request(app).get("/api/listings").query({ sort: "drop table" })).status).toBe(400);
  });

  test("unknown /api routes return JSON 404 instead of the SPA", async () => {
    for (const path of ["/api/nope", "/api/listings/1/extra", "/api"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toMatch(/json/);
      expect(res.body).toEqual({ ok: false, error: "Not found" });
    }
  });

  test("a malformed JSON body returns JSON 400", async () => {
    const res = await request(app)
      .post("/api/score")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.ok).toBe(false);
  });

  test("POST /api/score with a missing or huge id returns JSON 400", async () => {
    for (const body of [{}, { airbnbUrl: "" }, { airbnbUrl: { a: 1 } }, { airbnbUrl: "99999999999999999999" }]) {
      const res = await request(app).post("/api/score").send(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ ok: false, error: "Invalid Airbnb URL" });
    }
  });

  test("unexpected errors return JSON 500 without a stack in production", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    listingService.getById.mockRejectedValue(new Error("connection terminated: secret details"));
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await request(app).get("/api/listings/123");
      expect(res.status).toBe(500);
      expect(res.headers["content-type"]).toMatch(/json/);
      expect(res.body).toEqual({ ok: false, error: "Internal server error" });
    } finally {
      process.env.NODE_ENV = saved;
      console.error.mockRestore();
    }
  });

  test("security headers are set and x-powered-by is not", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["strict-transport-security"]).toMatch(/max-age=31536000/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    const csp = res.headers["content-security-policy"];
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).toMatch(/https:\/\/tile\.openstreetmap\.org/);
    expect(csp).toMatch(/frame-src https:\/\/www\.youtube-nocookie\.com/);
  });
});
