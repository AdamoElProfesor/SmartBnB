const request = require("supertest");

jest.mock("../src/config/db_sql", () => ({ query: jest.fn() }));

const db = require("../src/config/db_sql");
const app = require("../src/server");

describe("GET /api/health", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns ok when the database answers", async () => {
    db.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(db.query).toHaveBeenCalledWith("SELECT 1");
  });

  test("returns JSON 503 when the database fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    db.query.mockRejectedValue(new Error("pooler down"));
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, error: "Database unavailable" });
    console.error.mockRestore();
  });
});
