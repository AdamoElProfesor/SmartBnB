const { describeDb, resetDatabase } = require("./db");

describeDb("histogram repository against Postgres", () => {
  let repo;
  let db;

  beforeAll(async () => {
    await resetDatabase();
    db = require("../../src/config/db_sql");
    repo = require("../../src/repositories/sql/histogram.repo.sql");
  });

  afterAll(() => db.pool.end());

  test("getHistogramBase() reads price_trends, highest change first, dates as calendar days", async () => {
    await expect(repo.getHistogramBase()).resolves.toEqual([
      { region: "Lausanne", pct: 4.5, start_date: "2026-03-16", end_date: "2026-09-14", n_listings: 568 },
      { region: "Nyon", pct: 4.5, start_date: "2026-03-16", end_date: "2026-09-14", n_listings: 57 },
      { region: "Montreux", pct: -2, start_date: "2026-03-16", end_date: "2026-09-14", n_listings: 41 },
    ]);
  });

  test("getHistogramBase() is empty when there is nothing to compare yet", async () => {
    await db.query("DELETE FROM public.price_trends");
    await expect(repo.getHistogramBase()).resolves.toEqual([]);
  });
});
