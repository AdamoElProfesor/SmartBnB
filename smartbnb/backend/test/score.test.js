const request = require("supertest");

jest.mock("../src/services/score.service", () => ({
  computeFromUrl: jest.fn(),
}));

const scoreService = require("../src/services/score.service");
const app = require("../src/server");

describe("Score endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("POST /score returns 200 with analysis", async () => {
    scoreService.computeFromUrl.mockResolvedValue({
      ok: true,
      listing_id: "53584592",
      smart_score: 97,
      listing: {
        id: "53584592",
        name: "Petite chambre dans les combles, endroit calme",
        neighborhood: "Montreux",
        neighborhood_group: "Riviera-Pays-d'Enhaut",
        room_type: "Private room",
        accommodates: "2",
        price: 76,
        median_price: 93.5,
        avg_price: 127.090909090909,
        rating: 4.91,
        reviews_per_month: 9.45,
        number_of_reviews_ltm: 111,
        neighborhood_avg_rating: 4.75433,
        neighborhood_avg_reviews_per_month: 1.35,
        host_is_superhost: true,
        amenities_score: "44",
        amenities: ["AC", "DRYER", "HEATING", "KITCHEN", "PARKING", "WIFI"],
        missing_amenities: ["WASHER", "WORKSPACE", "ENTRANCE", "HOTTUB"],
      },
      analysis: {
        pros: [
          "Prix inférieur à la médiane du quartier, offrant un bon rapport qualité-prix.",
          "Évaluation élevée de 4.91, indiquant une satisfaction client forte.",
          "Superhost, garantissant un service de qualité.",
          "Emplacement calme, idéal pour se reposer.",
        ],
        cons: [
          "Manque d'équipements tels qu'un espace de travail et une machine à laver.",
          "Pas d'accès à un jacuzzi, ce qui pourrait être un inconvénient pour certains voyageurs.",
        ],
        summary:
          "Cette chambre privée à Montreux offre un bon rapport qualité-prix avec une excellente note de satisfaction. Cependant, certains équipements manquent pour un confort optimal.",
      },
    });

    const response = await request(app).post("/api/score").send({
      airbnbUrl: "https://www.airbnb.com/rooms/53584592",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        ok: true,
        listing_id: expect.any(String),
        smart_score: expect.any(Number),
        listing: expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          neighborhood: expect.any(String),
          room_type: expect.any(String),
          price: expect.any(Number),
          median_price: expect.any(Number),
          avg_price: expect.any(Number),
          rating: expect.any(Number),
          reviews_per_month: expect.any(Number),
          number_of_reviews_ltm: expect.any(Number),
          host_is_superhost: expect.any(Boolean),
          amenities: expect.any(Array),
          missing_amenities: expect.any(Array),
        }),
        analysis: expect.objectContaining({
          pros: expect.any(Array),
          cons: expect.any(Array),
          summary: expect.any(String),
        }),
      })
    );
    expect(response.body.smart_score).toBeGreaterThanOrEqual(0);
    expect(response.body.smart_score).toBeLessThanOrEqual(100);
  });

  test("POST /score returns 400 for invalid URL", async () => {
    scoreService.computeFromUrl.mockResolvedValue({
      ok: false,
      error: "Invalid Airbnb URL",
    });

    const response = await request(app).post("/api/score").send({
      airbnbUrl: "invalid-url",
    });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      ok: false,
      error: "Invalid Airbnb URL",
    });
  });

  test("POST /score returns 422 when a share link cannot be resolved", async () => {
    scoreService.computeFromUrl.mockResolvedValue({
      ok: false,
      error: "Share link could not be resolved",
    });

    const response = await request(app).post("/api/score").send({
      airbnbUrl: "https://abnb.me/AbCdEf12",
    });
    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      ok: false,
      error: "Share link could not be resolved",
    });
  });

  test("POST /score returns 404 if listing not found", async () => {
    scoreService.computeFromUrl.mockResolvedValue({
      ok: false,
      error: "Listing not found",
    });

    const response = await request(app)
      .post("/api/score")
      .send({ airbnbUrl: "https://airbnb.com/rooms/0" });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ ok: false, error: "Listing not found" });
  });
});
