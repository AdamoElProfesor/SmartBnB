/**
 * Caches the result of an async function without arguments for ttlMs.
 * Parallel calls during a miss share one pending call, and a failed call is
 * not cached. The read endpoints only change when a new snapshot is loaded,
 * so this keeps a burst of requests from filling the small database pool.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} ttlMs
 * @returns {(() => Promise<T>) & { clear: () => void }}
 */
function cached(fn, ttlMs) {
  let value;
  let expiresAt = 0;
  let pending = null;

  const get = async () => {
    if (Date.now() < expiresAt) return value;
    if (!pending) {
      pending = fn()
        .then((result) => {
          value = result;
          expiresAt = Date.now() + ttlMs;
          return result;
        })
        .finally(() => {
          pending = null;
        });
    }
    return pending;
  };
  get.clear = () => {
    expiresAt = 0;
    value = undefined;
  };
  return get;
}

// Read endpoints are cached for READ_CACHE_TTL_MS (default 10 minutes)
const READ_CACHE_TTL_MS = Number(process.env.READ_CACHE_TTL_MS) || 10 * 60 * 1000;

module.exports = { cached, READ_CACHE_TTL_MS };
