const request = require("supertest");

jest.mock("../src/services/score.service", () => ({
  computeFromUrl: jest.fn(),
}));

jest.mock("../src/config/db_sql", () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));

const WORKER_IP ="2a06:98c0:3600::103";

/**
 * Fresh app (and fresh limiter counters) for each test
 * @returns {{ app: import('express').Application, scoreService: { computeFromUrl: jest.Mock } }}
 */
function loadApp() {
  let app;
  let scoreService;
  jest.isolateModules(() => {
    scoreService = require("../src/services/score.service");
    app = require("../src/server");
  });
  scoreService.computeFromUrl.mockResolvedValue({ ok: true, listing_id: "1", smart_score: 50 });
  return { app, scoreService };
}

function score(app, headers = {}) {
  const req = request(app).post("/api/score");
  for (const [k, v] of Object.entries(headers)) req.set(k, v);
  return req.send({ airbnbUrl: "https://www.airbnb.ch/rooms/1" });
}

describe("POST /api/score rate limiting", () => {
  afterEach(() => {
    delete process.env.RELAY_SECRET;
  });

  test("allows 10 checks a minute per IP, then answers JSON 429", async () => {
    const { app, scoreService } = loadApp();
    const ip = { "cf-connecting-ip": "203.0.113.7" };
    for (let i = 0; i < 10; i++) {
      expect((await score(app, ip)).status).toBe(200);
    }
    const res = await score(app, ip);
    expect(res.status).toBe(429);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/wait a minute/);
    expect(scoreService.computeFromUrl).toHaveBeenCalledTimes(10);

    // Another visitor is not affected
    expect((await score(app, { "cf-connecting-ip": "198.51.100.9" })).status).toBe(200);
  });

  test("caps each IP at 60 checks a day", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    try {
      const { app } = loadApp();
      const ip = { "cf-connecting-ip": "203.0.113.8" };
      let ok = 0;
      for (let minute = 0; minute < 7; minute++) {
        for (let i = 0; i < 10; i++) {
          if ((await score(app, ip)).status === 200) ok++;
        }
        jest.advanceTimersByTime(61 * 1000);
      }
      expect(ok).toBe(60);
      const res = await score(app, ip);
      expect(res.status).toBe(429);
      expect(res.body.error).toMatch(/Daily limit/);
    } finally {
      jest.useRealTimers();
    }
  });

  test("a forged X-Forwarded-For does not reset the counter", async () => {
    const { app } = loadApp();
    for (let i = 0; i < 10; i++) {
      await score(app, { "cf-connecting-ip": "203.0.113.10", "x-forwarded-for": `10.0.0.${i}` });
    }
    const res = await score(app, { "cf-connecting-ip": "203.0.113.10", "x-forwarded-for": "10.0.0.99" });
    expect(res.status).toBe(429);
  });

  test("the health check is never rate limited", async () => {
    const { app } = loadApp();
    const ip = { "cf-connecting-ip": "203.0.113.11" };
    for (let i = 0; i < 11; i++) await score(app, ip);
    const res = await request(app).get("/api/health").set(ip);
    expect(res.status).not.toBe(429);
  });
});

describe("clientIp", () => {
  const { clientIp } = require("../src/middleware/rate-limit");

  function fakeReq(headers, ip = "10.0.0.1") {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return { ip, socket: {}, get: (name) => lower[name.toLowerCase()] };
  }

  afterEach(() => {
    delete process.env.RELAY_SECRET;
  });

  test("uses CF-Connecting-IP for direct Cloudflare traffic", () => {
    expect(clientIp(fakeReq({ "cf-connecting-ip": "203.0.113.7", "x-smartbnb-client-ip": "1.1.1.1" }))).toBe(
      "203.0.113.7"
    );
  });

  test("uses the relay header when the request comes from a Worker", () => {
    expect(clientIp(fakeReq({ "cf-connecting-ip": WORKER_IP, "x-smartbnb-client-ip": "203.0.113.7" }))).toBe(
      "203.0.113.7"
    );
  });

  test("requires the relay secret when one is configured", () => {
    process.env.RELAY_SECRET = "s3cret";
    const headers = { "cf-connecting-ip": WORKER_IP, "x-smartbnb-client-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" };
    expect(clientIp(fakeReq(headers))).toBe("198.51.100.1");
    expect(clientIp(fakeReq({ ...headers, "x-smartbnb-relay-key": "wrong" }))).toBe("198.51.100.1");
    expect(clientIp(fakeReq({ ...headers, "x-smartbnb-relay-key": "s3cret" }))).toBe("203.0.113.7");
  });

  test("falls back to the first X-Forwarded-For hop behind a Worker, then req.ip", () => {
    expect(clientIp(fakeReq({ "cf-connecting-ip": WORKER_IP, "x-forwarded-for": "203.0.113.5, 2a06:98c0:3600::103" }))).toBe(
      "203.0.113.5"
    );
    expect(clientIp(fakeReq({}, "192.0.2.4"))).toBe("192.0.2.4");
  });

  test("ignores values that are not IP addresses", () => {
    expect(clientIp(fakeReq({ "cf-connecting-ip": "not-an-ip" }, "192.0.2.4"))).toBe("192.0.2.4");
  });
});
