// Cron-only Worker: pings the app every 10 minutes so the free Render service
// never sleeps (no cold start for visitors) and the Supabase project sees
// regular queries (free projects pause after 7 days without activity).
//
// /api/histogram is small and runs a real DB query. Once GET /api/health is
// deployed on the backend, PING_URL can switch to it.
const PING_URL = "https://www.smartbnb.ch/api/histogram";
const TIMEOUT_MS = 60_000;

async function ping() {
  const started = Date.now();
  const res = await fetch(PING_URL, {
    headers: { "User-Agent": "smartbnb-keepalive" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await res.arrayBuffer();
  const ms = Date.now() - started;
  if (!res.ok) throw new Error(`${PING_URL} answered ${res.status} after ${ms} ms`);
  console.log(`${PING_URL} ok in ${ms} ms`);
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(ping());
  },
};
