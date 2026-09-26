const { Pool } = require("pg");
const { DATABASE_URL } = require("./env");

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in environment");
}

// Hosted databases (Supabase) require SSL; a local Postgres does not support it
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL);

/**
 * TLS options for a hosted database. With DATABASE_CA_CERT (the PEM of the
 * Supabase root certificate) the server certificate is verified, so nobody
 * on the path can impersonate the database. Without it the connection is
 * still encrypted but not authenticated, hence the warning.
 * @returns {false|import('tls').ConnectionOptions}
 */
function sslOptions() {
  if (isLocal) return false;
  // Env var UIs often store the PEM on one line with literal "\n"
  const ca = (process.env.DATABASE_CA_CERT || "").replace(/\\n/g, "\n").trim();
  if (ca) return { ca, rejectUnauthorized: true };
  if (process.env.NODE_ENV === "production") {
    console.warn("[db] DATABASE_CA_CERT is not set: the database certificate is not verified");
  }
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslOptions(),
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
