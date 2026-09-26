jest.mock("../src/config/db_sql", () => ({
  all: jest.fn().mockResolvedValue([]),
  one: jest.fn(),
}));

const { all } = require("../src/config/db_sql");
const repo = require("../src/repositories/sql/listings.repo.sql");

describe("listings repository search()", () => {
  beforeEach(() => all.mockClear());

  test("rating_desc ranks by a Bayesian average with 40 prior reviews", async () => {
    await repo.search({ sort: "rating_desc", limit: 10 });
    const [sql, params] = all.mock.calls[0];

    expect(params).toEqual([0, "rating_desc", 10, 28, 40]);
    expect(sql).toMatch(/AVG\(review_scores_rating\) AS mean_rating/);
    expect(sql.replace(/\s+/g, " ")).toContain(
      "(COALESCE(l.number_of_reviews, 0) * l.review_scores_rating + $5 * prior.mean_rating) / (COALESCE(l.number_of_reviews, 0) + $5)"
    );
  });

  test("returns the total number of reviews for each listing", async () => {
    await repo.search({ sort: "rating_desc" });
    const [sql] = all.mock.calls[0];
    expect(sql).toMatch(/l\.number_of_reviews,/);
  });
});
