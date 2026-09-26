require("dotenv").config({ quiet: true });

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const apiApp = require("./app");
const { warnIfRelaySecretMissing } = require("./middleware/rate-limit");

/**
 * Security headers. The CSP lists every third party the frontend uses:
 * Cloudflare Web Analytics, OpenStreetMap tiles (Leaflet) and the
 * youtube-nocookie demo. The font is self-hosted.
 * Leaflet writes style attributes in marker HTML, hence 'unsafe-inline' for
 * styles only; scripts stay 'self'.
 * @returns {import('express').RequestHandler}
 */
function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "https://static.cloudflareinsights.com"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "font-src": ["'self'", "data:"],
        "img-src": ["'self'", "data:", "https://tile.openstreetmap.org"],
        "connect-src": ["'self'", "https://cloudflareinsights.com"],
        "frame-src": ["https://www.youtube-nocookie.com"],
        "media-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'self'"],
        ...(process.env.NODE_ENV === "production" ? { "upgrade-insecure-requests": [] } : {}),
      },
    },
    // YouTube embeds and the OpenStreetMap tile policy both need a Referer
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
  });
}

/**
 * Build the Express app (API under /api)
 * @returns {import('express').Application}
 */
function buildApp() {
  const app = express();
  app.disable("x-powered-by");
  // Render's proxy is the one hop in front of the app (see middleware/rate-limit.js)
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.use(securityHeaders());

  app.use("/api", apiApp);
  const distDir = path.join(__dirname, "..", "..", "frontend", "dist");
  app.use(express.static(distDir));
  app.get("*", (_, res) => res.sendFile(path.join(distDir, "index.html")));

  return app;
}

/**
 * Start the HTTP server on PORT 3000 and log the URL
 * @returns {Promise<void>}
 */
async function bootstrap() {
  warnIfRelaySecretMissing();
  const app = buildApp();
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`SmartBnB is listening on http://localhost:${port}`);
  });
}

if (process.env.NODE_ENV === "test") {
  module.exports = buildApp();
} else {
  bootstrap().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
