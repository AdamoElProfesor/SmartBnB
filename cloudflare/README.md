# Cloudflare Workers

Three small Workers run around the Render service. See also
[docs/operations.md](../docs/operations.md) for monitoring and backups.

## `ai/`: open-weights AI endpoint

OpenAI-compatible `POST /v1/chat/completions` backed by
[Workers AI](https://developers.cloudflare.com/workers-ai/), so the listing
analysis runs on open-weights models within Cloudflare's free daily allowance.
The default model is `@cf/openai/gpt-oss-20b`. A request can only pick
another model listed in the `ALLOWED_MODELS` var (comma separated, in
`wrangler.toml` or the dashboard), and `max_tokens` is capped at 1500, so a
leaked key cannot run costlier models or huge replies. Model errors are
logged in the Worker (`npx wrangler tail`) and returned as a generic 502.

Requests must send `Authorization: Bearer <AI_API_KEY>`. The key is checked
in constant time (both sides are hashed with SHA-256 and every byte is
compared), so response timing does not leak it.

```bash
cd cloudflare/ai
npx wrangler deploy
npx wrangler secret put AI_API_KEY
```

Backend environment (Render and `smartbnb/backend/.env`):

```bash
AI_BASE_URL=https://smartbnb-ai.<your-subdomain>.workers.dev/v1
AI_API_KEY=<same key as the Worker secret>
AI_MODEL=@cf/openai/gpt-oss-20b
```

Without these variables the backend falls back to `OPENAI_API_KEY`, and with
no key at all the analysis is simply left empty.

## `relay/`: smartbnb.ch

Serves `smartbnb.ch` from the Render service `smartbnb-twsi.onrender.com`,
because the Render custom domain is still attached to an older service on
another account. The apex domain redirects to `www.smartbnb.ch`.

```bash
cd cloudflare/relay
npx wrangler deploy
npx wrangler secret put RELAY_SECRET
```

The relay passes the visitor IP to the backend in `X-SmartBnB-Client-IP`,
because Cloudflare replaces `CF-Connecting-IP` with the Worker's own address
on this cross-zone request. The backend rate limiter trusts that header only
when `X-SmartBnB-Relay-Key` matches the `RELAY_SECRET` set on Render (same
value as the Worker secret). Without `RELAY_SECRET` on Render the header is
never trusted (any Cloudflare Worker could set it), so every visitor coming
through the relay shares one rate limit bucket: the backend logs a warning at
startup in that case. `X-Forwarded-For` is never read by hand, because
Cloudflare appends to the value the client sends.

To rotate the secret without downtime, set `RELAY_SECRET=old,new` on Render,
run `npx wrangler secret put RELAY_SECRET` with the new value, then set
`RELAY_SECRET=new` on Render.

Once the domain can be attached to the Render service directly, point the DNS
there and delete this Worker.

## `keepalive/`: keeps Render and Supabase awake

Cron-only Worker (no HTTP route, `workers.dev` disabled). Every 10 minutes it
sends `GET https://www.smartbnb.ch/api/health`, a small request that runs a
real database query (`SELECT 1`). This keeps the free Render service from
sleeping (no 10 to 60 s cold start for visitors) and keeps the free Supabase
project active (it is paused after 7 days without activity).

```bash
cd cloudflare/keepalive
npx wrangler deploy   # also registers the "*/10 * * * *" Cron Trigger
```

Check that it runs: Cloudflare dashboard, Workers & Pages, `smartbnb-keepalive`,
Logs (or `npx wrangler tail smartbnb-keepalive`). A failed ping shows up as a
failed Cron event there.
