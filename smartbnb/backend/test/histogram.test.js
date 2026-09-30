jest.mock("../src/repositories/factory", () => {
  return {
    histogram: {
      getHistogramBase: jest.fn(),
    },
  };
});

const repoFactory = require("../src/repositories/factory");
const service = require("../src/services/histogram.service");

describe("histogram.controller.base", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GET /histogram returns price percentage difference per region", async () => {
    const exceptedResult = [
      { region: "Morges", pct: 3.44, start_date: "2026-03-16", end_date: "2026-09-14", n_listings: 126 },
      { region: "Lausanne", pct: -5.88, start_date: "2026-03-16", end_date: "2026-09-14", n_listings: 568 },
    ];

    repoFactory.histogram.getHistogramBase.mockResolvedValue(exceptedResult);

    const response = await service.getHistogramBase();
    expect(repoFactory.histogram.getHistogramBase).toHaveBeenCalled();
    expect(response).toEqual({ ok: true, data: exceptedResult });
  });
});
