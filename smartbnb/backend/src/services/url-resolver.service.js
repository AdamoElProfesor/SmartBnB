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

  let url;
  try {
    // Accept links pasted without a scheme, e.g. "www.airbnb.ch/rooms/123"
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  if (!AIRBNB_HOST.test(url.hostname)) return null;

  const path = url.pathname.replace(/\/{2,}/g, "/");
  for (const re of ID_PATHS) {
    const m = path.match(re);
    if (m) return normalize(m[1]);
  }

  const idParam = url.searchParams.get("listing_id") || url.searchParams.get("id");
  if (idParam && /^\d+$/.test(idParam)) return normalize(idParam);

  return null;
}

module.exports = { extractListingId, isValidListingId };
