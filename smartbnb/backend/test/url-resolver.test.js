const { extractListingId, isValidListingId } = require("../src/services/url-resolver.service");

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
