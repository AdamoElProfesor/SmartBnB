const { computeRange, applyNormalization } = require("../src/utils/heatmap.utils");

const point = (price) => ({ lat: 46.5, lng: 6.6, weight: price });

describe("heatmap.utils", () => {
  test("clips the range at the 95th percentile from 20 points", () => {
    const points = Array.from({ length: 19 }, (_, i) => point(100 + i * 10)).concat(point(5000));

    const range = computeRange(points);

    expect(range.min).toBe(100);
    expect(range.max).toBe(5000);
    expect(range.maxUsed).toBe(280);
  });

  test("keeps the real maximum below 20 points", () => {
    const range = computeRange([point(100), point(200), point(900)]);

    expect(range.maxUsed).toBe(900);
  });

  test("clamps weights above the 95th percentile to 1 and keeps the real price", () => {
    const points = Array.from({ length: 19 }, (_, i) => point(100 + i * 10)).concat(point(5000));

    const { points: out } = applyNormalization(points, computeRange(points));

    out.forEach((p) => {
      expect(p.weight).toBeGreaterThanOrEqual(0);
      expect(p.weight).toBeLessThanOrEqual(1);
    });
    expect(out[0]).toMatchObject({ weight: 0, price: 100 });
    expect(out[19]).toMatchObject({ weight: 1, price: 5000 });
  });

  test("gives every point weight 0 when all prices are equal", () => {
    const points = [point(150), point(150)];

    const { points: out } = applyNormalization(points, computeRange(points));

    expect(out.map((p) => p.weight)).toEqual([0, 0]);
  });

  test("returns an empty list unchanged", () => {
    const range = computeRange([]);
    const { points } = applyNormalization([], range);

    expect(range.method).toBe("none");
    expect(points).toEqual([]);
  });
});
