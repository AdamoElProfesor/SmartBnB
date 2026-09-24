/**
 * Liveness + database check for uptime monitors: runs SELECT 1, never cached
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
async function health(req, res) {
  res.set("Cache-Control", "no-store");
  try {
    // Required here so a missing DATABASE_URL is reported as unhealthy, not a crash
    const { query } = require("../config/db_sql");
    await query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    console.error("[health] database check failed:", e.message);
    res.status(503).json({ ok: false, error: "Database unavailable" });
  }
}

module.exports = { health };
