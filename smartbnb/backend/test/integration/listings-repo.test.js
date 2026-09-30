const { describeDb, resetDatabase } = require("./db");

describeDb("listings repository against Postgres", () => {
  let repo;
  let db;

  beforeAll(async () => {
    await resetDatabase();
    db = require("../../src/config/db_sql");
    repo = require("../../src/repositories/sql/listings.repo.sql");
  });

  afterAll(() => db.pool.end());

  const ids = (rows) => rows.map((r) => r.id);

  describe("search()", () => {
    test("returns only the listings still on Airbnb, by id by default", async () => {
      const rows = await repo.search({});
      // 104 left Airbnb (listing_activity.is_active false)
      expect(ids(rows)).toEqual(["101", "102", "103", "105"]);
    });

    test("reads each listing from its latest snapshot, with its current price", async () => {
      const [first] = await repo.search({ limit: 1 });
      expect(first).toEqual({
        id: "101",
        name: "Lake view flat",
        neighborhood: "Lausanne",
        latitude: 46.5197,
        longitude: 6.6323,
        room_type: "Entire home/apt",
        accommodates: 4,
        price: 150,
        rating: 4.9,
        number_of_reviews: 400,
        number_of_reviews_ltm: 60,
        minimum_nights: 2,
        long_stay: false,
        host_is_superhost: true,
      });
    });

    test("price_asc puts the listings with no price last and leaves out long stays", async () => {
      const rows = await repo.search({ sort: "price_asc" });
      // 103 asks for 30 nights at least: a monthly rent, not a holiday price
      expect(ids(rows)).toEqual(["105", "101", "102"]);
      expect(rows.map((r) => r.price)).toEqual([60, 150, null]);
    });

    test("flags the long stays in the other rankings", async () => {
      const rows = await repo.search({});
      const longStay = rows.find((r) => r.id === "103");
      expect(longStay.long_stay).toBe(true);
    });

    test("most_booked ranks by the reviews of the last 12 months", async () => {
      const rows = await repo.search({ sort: "most_booked" });
      expect(ids(rows)).toEqual(["101", "103", "102", "105"]);
    });

    test("rating_desc ranks a 5.0 from 3 guests below a 4.9 from 400, unrated last", async () => {
      const rows = await repo.search({ sort: "rating_desc" });
      expect(ids(rows)).toEqual(["101", "103", "102", "105"]);
    });

    test("ratingMin drops the listings rated below it, and the unrated ones", async () => {
      const rows = await repo.search({ ratingMin: 4.8 });
      expect(ids(rows)).toEqual(["101", "103"]);
    });

    test("limit caps the number of rows", async () => {
      await expect(repo.search({ limit: 2 })).resolves.toHaveLength(2);
    });
  });

  describe("getById()", () => {
    test("returns the latest snapshot, the neighbourhood stats and the amenities", async () => {
      const row = await repo.getById("101");
      expect(row).toEqual({
        id: "101",
        listing_url: "https://www.airbnb.com/rooms/101",
        name: "Lake view flat",
        host_is_superhost: true,
        neighborhood: "Lausanne",
        neighborhood_group: "Lausanne",
        room_type: "Entire home/apt",
        accommodates: 4,
        first_seen: "2026-03-16",
        last_seen: "2026-09-14",
        is_active: true,
        price: 150,
        price_date: "2026-09-14",
        number_of_reviews_ltm: 60,
        reviews_per_month: 2.2,
        review_scores_rating: 4.9,
        median_price: 140,
        avg_price: 145.5,
        count_airbnb: 2,
        neighborhood_avg_rating: 4.7,
        neighborhood_avg_reviews_per_month: 1.55,
        neighborhood_n_listings: 3,
        amenities: ["HEATING", "KITCHEN", "WIFI"],
        amenities_score: 27,
        amenities_min: 0,
        amenities_max: 27,
        missing_amenities: ["AC", "PARKING", "WASHER", "DRYER", "WORKSPACE", "ENTRANCE", "HOTTUB"],
      });
    });

    test("missingLimit and missingMinPoint narrow the missing amenities", async () => {
      const limited = await repo.getById(101, { missingLimit: 2 });
      expect(limited.missing_amenities).toEqual(["AC", "PARKING"]);

      const heavy = await repo.getById(101, { missingMinPoint: 5 });
      expect(heavy.missing_amenities).toEqual(["AC", "PARKING", "WASHER"]);
    });

    test("still returns a listing that left Airbnb, flagged inactive", async () => {
      const row = await repo.getById("104");
      expect(row).toMatchObject({
        id: "104",
        is_active: false,
        first_seen: "2026-03-16",
        last_seen: "2026-03-16",
        review_scores_rating: 4.2,
        amenities: null,
        amenities_score: null,
      });
      expect(row.missing_amenities).toHaveLength(10);
    });

    test("returns null for an unknown listing", async () => {
      await expect(repo.getById("999")).resolves.toBeNull();
    });
  });
});
