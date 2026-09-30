// Shared setup of the repository integration tests (npm run test:integration).
//
// They run the real SQL of src/repositories/sql against the Postgres named by
// TEST_DATABASE_URL, rebuilt from data/db/schema.sql, data/db/seed.sql and
// fixture.sql before each test file. It is a separate variable from
// DATABASE_URL on purpose: schema.sql drops every table, so the tests must
// never pick up the database of a local .env by accident.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const DB_DIR = path.join(__dirname, "../../../../data/db");

if (!TEST_DATABASE_URL && process.env.CI) {
  // In CI a missing database must fail the build, not skip every query test
  throw new Error("TEST_DATABASE_URL is not set: the integration tests cannot run");
}

if (TEST_DATABASE_URL) {
  const { hostname } = new URL(TEST_DATABASE_URL);
  if (!["localhost", "127.0.0.1"].includes(hostname)) {
    throw new Error(`TEST_DATABASE_URL must point to a local throwaway database, not ${hostname}`);
  }
  // src/config/db_sql reads DATABASE_URL (dotenv never overrides a set variable)
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

// Without a database the suites are skipped, so they never break npm test
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * Drops and recreates every table, then loads the seed and the fixture
 * @returns {Promise<void>}
 */
async function resetDatabase() {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    // Simple query protocol: each file runs as one multi-statement batch
    for (const file of [
      path.join(DB_DIR, "schema.sql"),
      path.join(DB_DIR, "seed.sql"),
      path.join(__dirname, "fixture.sql"),
    ]) {
      await client.query(fs.readFileSync(file, "utf8"));
    }
  } finally {
    await client.end();
  }
}

module.exports = { describeDb, resetDatabase };
