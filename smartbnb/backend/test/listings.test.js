const request = require("supertest");

jest.mock("../src/services/listings.service", () => ({
  search: jest.fn(),
  getById: jest.fn(),
}));

const listingService = require("../src/services/listings.service");
const app = require("../src/server");

describe("Listings endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GET /listings return the search results and forwards query params", async () => {
    const exceptedResult = [
      {
        id: "53584592",
        name: "Petite chambre dans les combles, endroit calme",
        neighborhood: "Montreux",
        latitude: 46.4474,
        longitude: 6.89582,
        room_type: "Private room",
        accommodates: "2",
        price: 76,
        rating: 4.91,
        number_of_reviews_ltm: 111,
        host_is_superhost: true,
      },
      {
        id: "744638415023127097",
        name: "Chambre douillette.",
        neighborhood: "Yverdon-les-Bains",
        latitude: 46.7761346135852,
        longitude: 6.63708429783583,
        room_type: "Private room",
        accommodates: "2",
        price: 80,
        rating: 4.86,
        number_of_reviews_ltm: 91,
        host_is_superhost: true,
      },
    ];

    listingService.search.mockResolvedValue(exceptedResult);

    const response = await request(app).get("/api/listings").query({
      rating_min: 4.5,
      sort: "most_booked",
      limit: 2,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(exceptedResult);
    expect(listingService.search).toHaveBeenCalledWith({
      rating_min: "4.5",
      sort: "most_booked",
      limit: "2",
    });
  });

  test("GET /listings return the search results without query params", async () => {
    const exceptedResult = [
      {
        id: "7381",
        name: "Chalet Chocolat in medieval alpine village",
        neighborhood: "Ormont-Dessus",
        latitude: 46.35447,
        longitude: 7.13187,
        room_type: "Entire home/apt",
        accommodates: "3",
        price: 113,
        rating: 4.73,
        number_of_reviews_ltm: 4,
        host_is_superhost: false,
      },
      {
        id: "26809",
        name: "Quiet bedroom, private bathroom",
        neighborhood: "Pully",
        latitude: 46.52083,
        longitude: 6.66308,
        room_type: "Private room",
        accommodates: "2",
        price: null,
        rating: 4.9,
        number_of_reviews_ltm: 0,
        host_is_superhost: false,
      },
    ];

    listingService.search.mockResolvedValue(exceptedResult);

    const response = await request(app).get("/api/listings");
    expect(response.status).toBe(200);
    expect(response.body).toEqual(exceptedResult);
    expect(listingService.search).toHaveBeenCalledWith({});
  });

  test("GET /listings/:id return a listing by id", async () => {
    const exceptedResult = [
      {
        id: "129558",
        listing_url: "https://www.airbnb.com/rooms/129558",
        name: "Vos vacances à Lausanne",
        host_is_superhost: false,
        description: null,
        neighborhood_overview: null,
        neighborhood: "Lausanne",
        neighborhood_group: "Lausanne",
        room_type: "Private room",
        accommodates: "2",
        price: null,
        number_of_reviews_ltm: 0,
        reviews_per_month: null,
        review_scores_rating: null,
        median_price: 60,
        avg_price: 72.2905660377358,
        count_airbnb: 447,
        neighborhood_avg_rating: 4.72258,
        neighborhood_avg_reviews_per_month: 1.12,
        amenities: ["KITCHEN"],
        amenities_score: "9",
        amenities_min: "5",
        amenities_max: "52",
        missing_amenities: [
          "WIFI",
          "HEATING",
          "AC",
          "PARKING",
          "WASHER",
          "DRYER",
          "WORKSPACE",
          "ENTRANCE",
          "HOTTUB",
        ],
      },
    ];

    listingService.getById.mockResolvedValue(exceptedResult[0]);

    const response = await request(app).get("/api/listings/129558");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(exceptedResult[0]);
    expect(listingService.getById).toHaveBeenCalledWith("129558");
  });

  test("GET /listings/:id returns 404 if listing not found", async () => {
    listingService.getById.mockResolvedValue(null);

    const response = await request(app).get("/api/listings/999999999");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Listing not found" });
    expect(listingService.getById).toHaveBeenCalledWith("999999999");
  });
});
