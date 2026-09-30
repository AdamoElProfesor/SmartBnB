// Repository integration tests: the real SQL against a throwaway Postgres
// (TEST_DATABASE_URL, see test/integration/db.js). npm test leaves them out.
module.exports = {
  testMatch: ["**/test/integration/**/*.test.js"],
};
