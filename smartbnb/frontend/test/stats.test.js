import { describe, expect, test } from "vitest";
import { median } from "../src/lib/stats";

describe("median", () => {
  test("middle value of an odd list, in any order", () => {
    expect(median([300, 100, 200])).toBe(200);
  });

  test("mean of the two middle values of an even list", () => {
    expect(median([100, 400, 200, 300])).toBe(250);
  });

  test("0 for an empty list, without changing the input", () => {
    const input = [3, 1, 2];
    median(input);
    expect(median([])).toBe(0);
    expect(input).toEqual([3, 1, 2]);
  });
});
