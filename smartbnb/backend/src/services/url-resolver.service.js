// Largest Postgres bigint: listing ids above it cannot exist in the database
const MAX_BIGINT = 9223372036854775807n;

// airbnb.<tld> or airbnb.co|com.<country> (airbnb.ch, airbnb.co.uk,
// airbnb.com.au), with any subdomain (www., fr., m.)
const AIRBNB_HOST = /^(?:[a-z0-9-]+\.)*airbnb\.(?:(?:co|com)\.[a-z]{2}|[a-z]{2,})$/i;

// /rooms/<id>, /rooms/plus/<id>, /plus/rooms/<id>, /manage-listing/<id>
const ID_PATHS = [
  /^\/rooms\/(?:plus\/)?(\d+)(?:[/?#]|$)/,
  /^\/plus\/rooms\/(\d+)(?:[/?#]|$)/,
  /^\/manage-listing\/(\d+)(?:[/?#]|$)/,
];

// Short links shared by the Airbnb app (airbnb.ch/l/<code>, abnb.me/<code>)
// and host custom links (airbnb.ch/h/<name>) only give the id after a redirect
const SHORT_LINK_HOST = /^(?:[a-z0-9-]+\.)*abnb\.me$/i;
const SHORT_LINK_PATH = /^\/(?:l|h)\/[\w-]+\/?$/;
const MAX_REDIRECTS = 4;
const RESOLVE_TIMEOUT_MS = 3000;
const USER_AGENT = "Mozilla/5.0 (compatible; SmartBnB/1.0; +https://www.smartbnb.ch)";

/**
 * True when the string is a listing id that fits in a Postgres bigint
 * @param {string} value
 * @returns {boolean}
 */
function isValidListingId(value) {
  if (typeof value !== "string" || !/^\d{1,19}$/.test(value)) return false;
  return BigInt(value) <= MAX_BIGINT;
}

/**
 * Removes leading zeros so "0123" and "123" are the same listing
 * @param {string} id
 * @returns {string|null}
 */
function normalize(id) {
  const trimmed = id.replace(/^0+(?=\d)/, "");
  return isValidListingId(trimmed) ? trimmed : null;
}

/**
 * Parses a pasted link into a URL, or null when it is not a plain http(s) link
 * without credentials or port
 * @param {string} raw
 * @returns {URL|null}
 */
function parseUrl(raw) {
  let url;
  try {
    // Accept links pasted without a scheme, e.g. "www.airbnb.ch/rooms/123"
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  return url;
}

/**
 * Extracts an Airbnb listing ID from a bare id or an Airbnb listing URL.
 * Only Airbnb hosts are accepted; nothing is ever fetched.
 * @param {string|URL|null|undefined} input
 * @returns {string|null}
 */
function extractListingId(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw || raw.length > 2048) return null;

  if (/^\d+$/.test(raw)) return normalize(raw);

  const url = parseUrl(raw);
  if (!url || !AIRBNB_HOST.test(url.hostname)) return null;

  const path = url.pathname.replace(/\/{2,}/g, "/");
  for (const re of ID_PATHS) {
    const m = path.match(re);
    if (m) return normalize(m[1]);
  }

  const idParam = url.searchParams.get("listing_id") || url.searchParams.get("id");
  if (idParam && /^\d+$/.test(idParam)) return normalize(idParam);

  return null;
}

/**
 * Returns the URL when the input is an Airbnb short or custom link that needs
 * a redirect to reveal the listing id, otherwise null
 * @param {string|null|undefined} input
 * @returns {URL|null}
 */
function parseShortLink(input) {
  const raw = String(input || "").trim();
  if (!raw || raw.length > 2048) return null;
  const url = parseUrl(raw);
  if (!url) return null;
  if (SHORT_LINK_HOST.test(url.hostname)) return url.pathname.length > 1 ? url : null;
  if (AIRBNB_HOST.test(url.hostname) && SHORT_LINK_PATH.test(url.pathname)) return url;
  return null;
}

/**
 * Follows the redirects of an Airbnb short link until one points to a listing.
 *
 * The server makes the request, so it must not become a proxy to arbitrary
 * hosts (server-side request forgery): every hop, including each redirect
 * target, must be an Airbnb or abnb.me host over https, redirects are
 * followed by hand, the whole chain has a short timeout, and the response
 * bodies are discarded. Only the listing id ever leaves this function.
 * @param {URL} start
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<string|null>}
 */
async function followShortLink(start, { fetchImpl = fetch, timeoutMs = RESOLVE_TIMEOUT_MS } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = new URL(start);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const id = extractListingId(url.href);
    if (id) return id;
    if (!AIRBNB_HOST.test(url.hostname) && !SHORT_LINK_HOST.test(url.hostname)) return null;
    if (url.username || url.password || url.port) return null;
    url.protocol = "https:";

    let res;
    try {
      res = await fetchImpl(url.href, {
        method: "GET",
        redirect: "manual",
        signal,
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      });
    } catch {
      return null;
    }
    res.body?.cancel().catch(() => {});

    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return null;
    try {
      url = new URL(location, url);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Like extractListingId, but also resolves Airbnb share links from the app
 * (airbnb.ch/l/..., abnb.me/...) by following their redirects.
 * @param {string|null|undefined} input
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{ id: string|null, shortLink: boolean }>}
 */
async function resolveListingId(input, options) {
  const id = extractListingId(input);
  if (id) return { id, shortLink: false };
  const short = parseShortLink(input);
  if (!short) return { id: null, shortLink: false };
  return { id: await followShortLink(short, options), shortLink: true };
}

module.exports = { extractListingId, isValidListingId, parseShortLink, resolveListingId };
