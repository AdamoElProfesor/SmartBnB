const { describeDb, resetDatabase } = require("./db");

describeDb("AI analyses repository against Postgres", () => {
  let repo;
  let db;

  beforeAll(async () => {
    await resetDatabase();
    db = require("../../src/config/db_sql");
    repo = require("../../src/repositories/sql/ai-analyses.repo.sql");
  });

  afterAll(() => db.pool.end());

  const key = { listingId: 101, dataVersion: "v1", model: "test-model", lang: "en" };
  const analysis = { pros: ["Lake view"], cons: ["Noisy street"], summary: "A bright flat." };

  test("get() returns null when nothing is cached", async () => {
    await expect(repo.get(key)).resolves.toBeNull();
  });

  test("save() stores the analysis and get() reads it back", async () => {
    await repo.save({ ...key, analysis });
    await expect(repo.get(key)).resolves.toEqual(analysis);
    // The listing id is accepted as a number or a string
    await expect(repo.get({ ...key, listingId: "101" })).resolves.toEqual(analysis);
  });

  test("save() twice with the same key keeps the first analysis without failing", async () => {
    await expect(
      repo.save({ ...key, analysis: { pros: [], cons: [], summary: "Second" } })
    ).resolves.toBeUndefined();
    await expect(repo.get(key)).resolves.toEqual(analysis);
  });

  test("each language, model and data version has its own row", async () => {
    const french = { pros: ["Vue sur le lac"], cons: [], summary: "Un appartement lumineux." };
    await repo.save({ ...key, lang: "fr", analysis: french });

    await expect(repo.get({ ...key, lang: "fr" })).resolves.toEqual(french);
    await expect(repo.get(key)).resolves.toEqual(analysis);
    await expect(repo.get({ ...key, model: "other-model" })).resolves.toBeNull();
    await expect(repo.get({ ...key, dataVersion: "v2" })).resolves.toBeNull();
  });
});
