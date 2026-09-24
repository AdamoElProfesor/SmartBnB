const crypto = require("crypto");
const net = require("net");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// Cloudflare sets CF-Connecting-IP to this address on a subrequest a Worker
// sends to another Cloudflare zone (our relay -> onrender.com), so it does not
// identify the visitor there.
const WORKER_IP_PREFIX = "2a06:98c0:3600:";

/**
 * @param {string} ip
 * @returns {boolean}
 */
function isWorkerIp(ip) {
  return ip.toLowerCase().startsWith(WORKER_IP_PREFIX);
}

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
 * True when X-SmartBnB-Client-IP was set by our relay Worker: it must carry
 * RELAY_SECRET when one is configured, or at least come from a Worker.
 * @param {import('express').Request} req
 * @param {string} cfIp
 * @returns {boolean}
 */
function fromRelay(req, cfIp) {
  const secret = process.env.RELAY_SECRET;
  if (secret) return safeEqual(req.get("x-smartbnb-relay-key") || "", secret);
  return Boolean(cfIp) && isWorkerIp(cfIp);
}

/**
 * Visitor IP behind Cloudflare (relay Worker) and Render:
 * 1. X-SmartBnB-Client-IP from the relay (it copies its own CF-Connecting-IP)
 * 2. CF-Connecting-IP, which Cloudflare overwrites so a client cannot forge it
 * 3. the first X-Forwarded-For hop when the request came through a Worker
 * 4. req.ip (X-Forwarded-For read with the app's "trust proxy" setting)
 * @param {import('express').Request} req
 * @returns {string}
 */
function clientIp(req) {
  const cfIp = (req.get("cf-connecting-ip") || "").trim();

  const relayed = (req.get("x-smartbnb-client-ip") || "").trim();
  if (relayed && net.isIP(relayed) && fromRelay(req, cfIp)) return relayed;

  if (cfIp && net.isIP(cfIp) && !isWorkerIp(cfIp)) return cfIp;

  if (cfIp && isWorkerIp(cfIp)) {
    const first = (req.get("x-forwarded-for") || "").split(",")[0].trim();
    if (first && net.isIP(first) && !isWorkerIp(first)) return first;
  }

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

module.exports = { clientIp, scoreLimiters };
