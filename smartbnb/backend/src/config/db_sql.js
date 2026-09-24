const { Pool } = require("pg");
const { DATABASE_URL } = require("./env");

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in environment");
}

// Hosted databases (Supabase) require SSL; a local Postgres does not support it
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL);

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  // The Supabase pooler has a small connection budget on the free plan
  max: Number(process.env.DB_POOL_MAX) || 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // A slow query fails fast instead of holding a request (and a connection) open.
  // statement_timeout is a session setting: the Supabase transaction pooler
  // (port 6543) ignores it, so query_timeout enforces the limit client side
  // (the pool then drops that connection).
  statement_timeout: 10_000,
  query_timeout: 10_000,
});

// An idle client can be dropped by the pooler; without a listener the error
// event would crash the process. The pool replaces the client on the next query.
pool.on("error", (err) => {
  console.error("[db] idle client error:", err.message);
});

async function query(text, params = []) {
  const res = await pool.query(text, params);
  return res;
}

async function all(text, params = []) {
  const { rows } = await query(text, params);
  return rows;
}

async function one(text, params = []) {
  const { rows } = await query(text, params);
  return rows[0] || null;
}

module.exports = { query, all, one, pool };
