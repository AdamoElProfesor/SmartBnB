jest.mock("../src/repositories/factory", () => {
  const heatmap = {
    getHeatMap: jest.fn(),
  };
  return {
    heatmap,
  };
});

const repoFactory = require("../src/repositories/factory");
const { getHeatMap } = require("../src/services/heatmap.service");

describe("heatmap.service.getHeatMap)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GET /heatmap returns normalized points", async () => {
    repoFactory.heatmap.getHeatMap.mockResolvedValue([
      {
        lat: 46.35447,
        lng: 7.13187,
        weight: 0.15331807780320367,
      },
      {
        lat: 46.47582,
        lng: 6.32948,
        weight: 1.6750572082379862,
      },
    ]);

    const response = await getHeatMap();

    expect(response.ok).toBe(true);
    expect(response.points).toHaveLength(2);
    response.points.forEach((p) => expect(p.weight).toBeGreaterThanOrEqual(0));
    response.points.forEach((p) => expect(p.weight).toBeLessThanOrEqual(1));
    expect(response.meta).toHaveProperty("normalization");
    expect(response.meta.normalization).toEqual(
      expect.objectContaining({
        min: expect.any(Number),
        max: expect.any(Number),
      })
    );
  });
});
