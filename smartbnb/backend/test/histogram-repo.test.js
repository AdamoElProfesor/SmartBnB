jest.mock("../src/config/db_sql", () => ({
  all: jest.fn().mockResolvedValue([
    { region: "Lausanne", pct: "4.5", start_date: "2026-03-16", end_date: "2026-09-14", n_listings: "568" },
  ]),
}));

const { all } = require("../src/config/db_sql");
const repo = require("../src/repositories/sql/histogram.repo.sql");

describe("histogram repository getHistogramBase()", () => {
  test("reads the trends precomputed by the loader, with the compared period", async () => {
    await expect(repo.getHistogramBase()).resolves.toEqual([
      { region: "Lausanne", pct: 4.5, start_date: "2026-03-16", end_date: "2026-09-14", n_listings: 568 },
    ]);

    const [sql] = all.mock.calls[0];
    expect(sql).toMatch(/FROM public\.price_trends/);
    expect(sql).toMatch(/start_date::text/);
    expect(sql).not.toMatch(/airbnb_snapshots/);
  });
});
