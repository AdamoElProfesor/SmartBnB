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
      { region: "Morges", pct: 3.44 },
      { region: "Lausanne", pct: -5.88 },
    ];

    repoFactory.histogram.getHistogramBase.mockResolvedValue(exceptedResult);

    const response = await service.getHistogramBase();
    expect(repoFactory.histogram.getHistogramBase).toHaveBeenCalled();
    expect(response).toEqual({ ok: true, data: exceptedResult });
  });
});
