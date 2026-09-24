// Relay smartbnb.ch to the Render service (the domain itself is held by another Render account)
const ORIGIN = "smartbnb-twsi.onrender.com";
const CANONICAL = "www.smartbnb.ch";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== CANONICAL) {
      url.hostname = CANONICAL;
      return Response.redirect(url.toString(), 301);
    }
    url.hostname = ORIGIN;
    const upstream = new Request(url, request);
    // On this cross-zone subrequest Cloudflare replaces CF-Connecting-IP with the
    // Worker's address, so pass the visitor IP on for the backend rate limiter.
    // RELAY_SECRET (wrangler secret, same value on Render) proves the header is ours.
    const clientIp = request.headers.get("cf-connecting-ip");
    upstream.headers.delete("x-smartbnb-client-ip");
    upstream.headers.delete("x-smartbnb-relay-key");
    if (clientIp) upstream.headers.set("x-smartbnb-client-ip", clientIp);
    if (env && env.RELAY_SECRET) upstream.headers.set("x-smartbnb-relay-key", env.RELAY_SECRET);

    const res = await fetch(upstream, { redirect: "manual" });
    const location = res.headers.get("location");
    if (!location || !location.includes(ORIGIN)) return res;
    const headers = new Headers(res.headers);
    headers.set("location", location.replace(ORIGIN, CANONICAL));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
