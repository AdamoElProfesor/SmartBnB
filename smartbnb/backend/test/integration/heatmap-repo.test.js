const { describeDb, resetDatabase } = require("./db");

describeDb("heatmap repository against Postgres", () => {
  let repo;
  let db;

  beforeAll(async () => {
    await resetDatabase();
    db = require("../../src/config/db_sql");
    repo = require("../../src/repositories/sql/heatmap.repo.sql");
  });

  afterAll(() => db.pool.end());

  test("getHeatMap() returns the active, priced listings that have coordinates", async () => {
    const points = await repo.getHeatMap();
    // 102 has no price, 104 left Airbnb, 105 has no coordinates
    expect(points.sort((a, b) => a.weight - b.weight)).toEqual([
      { lat: 46.4312, lng: 6.9107, weight: 80 },
      { lat: 46.5197, lng: 6.6323, weight: 150 },
    ]);
  });
});
