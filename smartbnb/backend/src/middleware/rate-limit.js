const crypto = require("crypto");
const net = require("net");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Accepted relay secrets. RELAY_SECRET may hold several comma-separated values
 * so the secret can be rotated without downtime: add the new value on Render,
 * update the Worker, then remove the old one.
 * @returns {string[]}
 */
function relaySecrets() {
  return (process.env.RELAY_SECRET || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * True when X-SmartBnB-Client-IP was set by our relay Worker, proven by
 * X-SmartBnB-Relay-Key. Without RELAY_SECRET the header is never trusted:
 * any Cloudflare Worker (not only ours) could otherwise set it.
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function fromRelay(req) {
  const key = req.get("x-smartbnb-relay-key") || "";
  if (!key) return false;
  // Check every secret so the timing does not reveal which one matched
  return relaySecrets().reduce((ok, secret) => safeEqual(key, secret) || ok, false);
}

/**
 * Visitor IP behind Cloudflare (relay Worker) and Render:
 * 1. X-SmartBnB-Client-IP, only when the relay proves it with RELAY_SECRET
 * 2. CF-Connecting-IP, which Cloudflare overwrites so a client cannot forge it.
 *    Requests from any other Worker share the Worker address range, so they
 *    all land in the same (IPv6 /56) bucket instead of picking their own key.
 * 3. req.ip (X-Forwarded-For read with the app's "trust proxy" setting), for
 *    local runs without Cloudflare
 * X-Forwarded-For is never read by hand: Cloudflare appends to the value a
 * client sends, so its first hop is attacker controlled.
 * @param {import('express').Request} req
 * @returns {string}
 */
function clientIp(req) {
  const cfIp = (req.get("cf-connecting-ip") || "").trim();

  const relayed = (req.get("x-smartbnb-client-ip") || "").trim();
  if (relayed && net.isIP(relayed) && fromRelay(req)) return relayed;

  if (cfIp && net.isIP(cfIp)) return cfIp;

  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * JSON 429 limiter keyed on the visitor IP (IPv6 grouped by /56)
 * @param {{ windowMs: number, limit: number, message: string }} options
 * @returns {import('express').RequestHandler}
 */
function jsonLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
    handler: (req, res) => {
      res.status(429).json({ ok: false, error: message });
    },
  });
}

/**
 * Limiters for POST /api/score, which spends the shared daily AI quota.
 * Limits can be tuned with SCORE_LIMIT_PER_MINUTE / SCORE_LIMIT_PER_DAY.
 * @returns {import('express').RequestHandler[]}
 */
function scoreLimiters() {
  return [
    jsonLimiter({
      windowMs: 60 * 1000,
      limit: Number(process.env.SCORE_LIMIT_PER_MINUTE) || 10,
      message: "Too many checks, please wait a minute and try again.",
    }),
    jsonLimiter({
      windowMs: 24 * 60 * 60 * 1000,
      limit: Number(process.env.SCORE_LIMIT_PER_DAY) || 60,
      message: "Daily limit of listing checks reached, please come back tomorrow.",
    }),
  ];
}

/**
 * Broad limiter for every /api route, so a single client cannot fill the
 * small database pool with read requests. Tuned with API_LIMIT_PER_MINUTE.
 * @returns {import('express').RequestHandler}
 */
function apiLimiter() {
  return jsonLimiter({
    windowMs: 60 * 1000,
    limit: Number(process.env.API_LIMIT_PER_MINUTE) || 120,
    message: "Too many requests, please wait a minute and try again.",
  });
}

/**
 * Warns at startup when the backend runs in production without RELAY_SECRET:
 * every visitor coming through the relay would then share one rate limit.
 */
function warnIfRelaySecretMissing() {
  if (process.env.NODE_ENV === "production" && relaySecrets().length === 0) {
    console.warn(
      "[rate-limit] RELAY_SECRET is not set: visitors behind the relay Worker share one rate limit bucket"
    );
  }
}

module.exports = { clientIp, scoreLimiters, apiLimiter, warnIfRelaySecretMissing };
