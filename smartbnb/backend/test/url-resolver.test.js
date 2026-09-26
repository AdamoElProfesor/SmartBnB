const {
  extractListingId,
  isValidListingId,
  parseShortLink,
  resolveListingId,
} = require("../src/services/url-resolver.service");

describe("url-resolver.extractListingId", () => {
  test.each([
    ["53584592", "53584592"],
    ["  53584592 ", "53584592"],
    ["https://www.airbnb.ch/rooms/53584592", "53584592"],
    ["https://www.airbnb.ch/rooms/53584592?adults=2&check_in=2026-10-01", "53584592"],
    ["https://fr.airbnb.ch/rooms/53584592/", "53584592"],
    ["https://m.airbnb.com/rooms/7", "7"],
    ["https://airbnb.com/rooms/7", "7"],
    ["https://www.airbnb.co.uk/rooms/9", "9"],
    ["https://www.airbnb.com.au/rooms/9", "9"],
    ["www.airbnb.ch/rooms/42", "42"],
    ["https://www.airbnb.ch/rooms/plus/42", "42"],
    ["https://www.airbnb.ch/plus/rooms/42", "42"],
    ["https://www.airbnb.ch/manage-listing/55/details", "55"],
    ["https://www.airbnb.ch/s/x?listing_id=77", "77"],
    ["https://www.airbnb.ch/rooms/744638415023127097", "744638415023127097"],
  ])("accepts %s", (input, id) => {
    expect(extractListingId(input)).toBe(id);
  });

  test.each([
    [""],
    [null],
    ["invalid-url"],
    ["https://evil.com/rooms/1"],
    ["https://airbnb.evil.com/rooms/1"],
    ["https://evilairbnb.com/rooms/1"],
    ["https://airbnb.com.evil.com/rooms/1"],
    ["https://www.airbnb.ch.evil.com/rooms/1"],
    ["https://user:pass@www.airbnb.ch/rooms/1"],
    ["https://www.airbnb.ch:8443/rooms/1"],
    ["ftp://www.airbnb.ch/rooms/1"],
    ["javascript:alert(1)//www.airbnb.ch/rooms/1"],
    ["https://www.airbnb.ch/rooms/123abc"],
    ["https://www.airbnb.ch/experiences/123"],
    ["https://www.airbnb.ch/rooms/99999999999999999999"],
    ["https://www.airbnb.ch/rooms/9223372036854775808"],
    ["99999999999999999999"],
  ])("rejects %s", (input) => {
    expect(extractListingId(input)).toBeNull();
  });
});

describe("url-resolver.isValidListingId", () => {
  test("accepts ids that fit in a bigint", () => {
    expect(isValidListingId("1")).toBe(true);
    expect(isValidListingId("9223372036854775807")).toBe(true);
  });

  test("rejects anything else", () => {
    expect(isValidListingId("9223372036854775808")).toBe(false);
    expect(isValidListingId("abc")).toBe(false);
    expect(isValidListingId("-1")).toBe(false);
    expect(isValidListingId("1.5")).toBe(false);
    expect(isValidListingId(123)).toBe(false);
  });
});

describe("url-resolver.parseShortLink", () => {
  test.each([
    ["https://www.airbnb.ch/l/AbCdEf12"],
    ["https://airbnb.com/l/AbCdEf12/"],
    ["www.airbnb.ch/l/AbCdEf12"],
    ["https://www.airbnb.ch/h/lake-view-studio"],
    ["https://abnb.me/AbCdEf12"],
    ["https://abnb.me/e/AbCdEf12"],
  ])("recognises %s", (input) => {
    expect(parseShortLink(input)).not.toBeNull();
  });

  test.each([
    ["https://www.airbnb.ch/rooms/1"],
    ["https://www.airbnb.ch/l/"],
    ["https://www.airbnb.ch/l/a/b"],
    ["https://abnb.me/"],
    ["https://evil.com/l/AbCdEf12"],
    ["https://abnb.me.evil.com/AbCdEf12"],
    ["https://user:pass@abnb.me/AbCdEf12"],
    ["https://abnb.me:8443/AbCdEf12"],
    ["ftp://abnb.me/AbCdEf12"],
    [""],
  ])("ignores %s", (input) => {
    expect(parseShortLink(input)).toBeNull();
  });
});

describe("url-resolver.resolveListingId", () => {
  const redirect = (location, status = 301) => ({ status, headers: new Headers({ location }), body: null });
  const page = () => ({ status: 200, headers: new Headers(), body: null });
  // Fake fetch answering from a map of url -> response
  const fakeFetch = (routes) =>
    jest.fn(async (url) => {
      const res = routes[url];
      if (!res) throw new Error(`unexpected fetch ${url}`);
      return res;
    });

  test("full listing links are parsed without any request", async () => {
    const fetchImpl = fakeFetch({});
    await expect(resolveListingId("https://www.airbnb.ch/rooms/42", { fetchImpl })).resolves.toEqual({
      id: "42",
      shortLink: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("links that are neither listings nor share links are rejected without any request", async () => {
    const fetchImpl = fakeFetch({});
    await expect(resolveListingId("https://evil.com/l/abc", { fetchImpl })).resolves.toEqual({
      id: null,
      shortLink: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("an app share link resolves through its redirect", async () => {
    const fetchImpl = fakeFetch({
      "https://www.airbnb.ch/l/AbCdEf12": redirect("https://www.airbnb.ch/rooms/53584592?source_impression_id=x"),
    });
    await expect(resolveListingId("https://www.airbnb.ch/l/AbCdEf12", { fetchImpl })).resolves.toEqual({
      id: "53584592",
      shortLink: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.airbnb.ch/l/AbCdEf12",
      expect.objectContaining({ redirect: "manual" })
    );
  });

  test("redirect chains across Airbnb hosts and relative locations are followed", async () => {
    const fetchImpl = fakeFetch({
      "https://abnb.me/AbCdEf12": redirect("https://www.airbnb.com/l/AbCdEf12", 307),
      "https://www.airbnb.com/l/AbCdEf12": redirect("/rooms/7", 302),
    });
    const { id } = await resolveListingId("abnb.me/AbCdEf12", { fetchImpl });
    expect(id).toBe("7");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("plain http share links are fetched over https", async () => {
    const fetchImpl = fakeFetch({ "https://abnb.me/x1": redirect("https://www.airbnb.ch/rooms/9") });
    const { id } = await resolveListingId("http://abnb.me/x1", { fetchImpl });
    expect(id).toBe("9");
  });

  test("never requests an airbnb.<tld> domain that is not Airbnb's", async () => {
    const fetchImpl = jest.fn();
    for (const link of ["https://airbnb.lol/l/AbCdEf12", "https://x.airbnb.co.xx/l/AbCdEf12", "https://www.airbnb.dev/h/test"]) {
      await expect(resolveListingId(link, { fetchImpl })).resolves.toEqual({ id: null, shortLink: true });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("does not follow a redirect to an airbnb.<tld> domain that is not Airbnb's", async () => {
    const fetchImpl = fakeFetch({ "https://abnb.me/x1": redirect("https://airbnb.lol/l/abc") });
    const { id } = await resolveListingId("https://abnb.me/x1", { fetchImpl });
    expect(id).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("a redirect to a non-Airbnb host is never followed", async () => {
    const fetchImpl = fakeFetch({ "https://abnb.me/x1": redirect("http://169.254.169.254/latest/meta-data") });
    await expect(resolveListingId("https://abnb.me/x1", { fetchImpl })).resolves.toEqual({
      id: null,
      shortLink: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("a redirect to an Airbnb host with credentials or a port is never followed", async () => {
    const fetchImpl = fakeFetch({ "https://abnb.me/x1": redirect("https://www.airbnb.ch:8443/l/abc") });
    const { id } = await resolveListingId("https://abnb.me/x1", { fetchImpl });
    expect(id).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("redirect loops stop after a few hops", async () => {
    const fetchImpl = fakeFetch({
      "https://www.airbnb.ch/l/a": redirect("https://www.airbnb.ch/l/b"),
      "https://www.airbnb.ch/l/b": redirect("https://www.airbnb.ch/l/a"),
    });
    const { id } = await resolveListingId("https://www.airbnb.ch/l/a", { fetchImpl });
    expect(id).toBeNull();
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(5);
  });

  test("a share link that does not redirect gives no id", async () => {
    const fetchImpl = fakeFetch({ "https://www.airbnb.ch/l/gone": page() });
    const { id } = await resolveListingId("https://www.airbnb.ch/l/gone", { fetchImpl });
    expect(id).toBeNull();
  });

  test("a redirect to the Airbnb home page gives no id", async () => {
    const fetchImpl = fakeFetch({
      "https://abnb.me/unknown": redirect("https://www.airbnb.com"),
      "https://www.airbnb.com/": page(),
    });
    const { id } = await resolveListingId("https://abnb.me/unknown", { fetchImpl });
    expect(id).toBeNull();
  });

  test("network errors and timeouts give no id", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    const { id } = await resolveListingId("https://abnb.me/slow", { fetchImpl });
    expect(id).toBeNull();
  });
});
