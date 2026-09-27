jest.mock("../src/config/db_sql", () => ({
  all: jest.fn().mockResolvedValue([{ region: "Lausanne", pct: "4.5" }]),
}));

const { all } = require("../src/config/db_sql");
const repo = require("../src/repositories/sql/histogram.repo.sql");

describe("histogram repository getHistogramBase()", () => {
  test("reads the trends precomputed by the loader", async () => {
    await expect(repo.getHistogramBase()).resolves.toEqual([{ region: "Lausanne", pct: 4.5 }]);

    const [sql] = all.mock.calls[0];
    expect(sql).toMatch(/FROM public\.price_trends/);
    expect(sql).not.toMatch(/airbnb_snapshots/);
  });
});
