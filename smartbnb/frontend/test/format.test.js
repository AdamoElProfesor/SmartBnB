import { describe, expect, test } from "vitest";
import { amenityLabel, formatCHF, isNum, priceColor, roomTypeLabel } from "../src/lib/format";

describe("formatCHF", () => {
  test("formats a price without decimals", () => {
    expect(formatCHF(144.6)).toMatch(/^CHF\s145$/);
  });

  test("returns null for missing or invalid values", () => {
    expect(formatCHF(null)).toBeNull();
    expect(formatCHF(undefined)).toBeNull();
    expect(formatCHF("abc")).toBeNull();
  });
});

describe("isNum", () => {
  test("accepts numbers and numeric strings", () => {
    expect(isNum(0)).toBe(true);
    expect(isNum("4.8")).toBe(true);
  });

  test("rejects null, empty strings and text", () => {
    expect(isNum(null)).toBe(false);
    expect(isNum("")).toBe(false);
    expect(isNum("n/a")).toBe(false);
  });
});

describe("priceColor", () => {
  test("goes from green (cheap) to red (expensive)", () => {
    expect(priceColor(0)).toBe("rgba(63,122,58,1)");
    expect(priceColor(0.5)).toBe("rgba(217,164,65,1)");
    expect(priceColor(1)).toBe("rgba(192,67,46,1)");
  });

  test("clamps values outside 0 to 1 and applies the alpha", () => {
    expect(priceColor(-2)).toBe(priceColor(0));
    expect(priceColor(3, 0.9)).toBe("rgba(192,67,46,0.9)");
  });
});

describe("labels", () => {
  test("room types", () => {
    expect(roomTypeLabel("Entire home/apt")).toBe("entire home");
    expect(roomTypeLabel("Tiny House")).toBe("tiny house");
    expect(roomTypeLabel(null)).toBe("stay");
  });

  test("amenities", () => {
    expect(amenityLabel("WIFI")).toBe("Wi-Fi");
    expect(amenityLabel("SAUNA")).toBe("SAUNA");
  });
});
