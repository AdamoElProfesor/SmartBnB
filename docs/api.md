# SmartBnB API endpoints

All endpoints live under `/api` and answer JSON. Errors share one shape:

```json
{ "ok": false, "error": "string" }
```

- `400 Bad Request` -> invalid parameter or body; `error` says which one
- `404 Not Found` -> unknown `/api` route (`"Not found"`) or unknown listing
- `500 Internal Server Error` -> `"Internal server error"` (the stack is only
  added outside production)

## Health

### **`GET /api/health`**

Liveness and database check for uptime monitors. Runs `SELECT 1` and is never
cached (`Cache-Control: no-store`).

### Response

- `200 OK` -> `{ "ok": true }`
- `503 Service Unavailable` -> `{ "ok": false, "error": "Database unavailable" }`

## Listings

### **`GET /api/listings`**

Returns a filterable list of Airbnb listings still active in the latest scrape.

### Query parameters

All are optional. An invalid value answers `400`.

- `rating_min`: minimum average rating, a number from 0 to 5 (default 0)
- `sort`: one of `price_asc`, `most_booked`, `rating_desc`, `listing_id_asc`
  (default)
- `limit`: number of listings, an integer from 1 to 100 (default 10)

### Response

- `200 OK` ->
```json
[
  {
    "id": "string",
    "name": "string",
    "neighborhood": "string",
    "latitude": 0,
    "longitude": 0,
    "room_type": "string",
    "accommodates": 0,
    "price": 0,
    "rating": 0,
    "number_of_reviews_ltm": 0,
    "host_is_superhost": true
  }
]
```

- `400 Bad Request` -> e.g. `"limit must be an integer from 1 to 100"`,
  `"rating_min must be a number from 0 to 5"`, `"sort must be one of ..."`

### **`GET /api/listings/:id`**

Returns full details for a single listing (latest snapshot, neighbourhood
stats, amenities).

### Response

- `200 OK` -> `object`
- `400 Bad Request` -> `{ "ok": false, "error": "Invalid listing id" }`
- `404 Not Found` -> `{ "ok": false, "error": "Listing not found" }`

## Scoring

### **`POST /api/score`**

Computes the SmartBnB score for an Airbnb URL and returns a summary.

Rate limited per visitor: 10 checks per minute and 60 per day by default
(`SCORE_LIMIT_PER_MINUTE`, `SCORE_LIMIT_PER_DAY`).

### Body (JSON)

- `airbnbUrl`: the listing to analyze. Accepts a bare listing id, a full
  listing URL (`/rooms/<id>`), or a share link from the Airbnb app
  (`airbnb.<tld>/l/<code>`, `airbnb.<tld>/h/<name>`, `abnb.me/<code>`).
  Share links are resolved by following their redirects, only to Airbnb
  hosts over https, with a 3 second timeout.

### Response

- `200 OK` ->
```json
{
  "ok": true,
  "listing_id": "string",
  "smart_score": 0,
  "listing": {
    "id": "string",
    "name": "string",
    "neighborhood": "string",
    "neighborhood_group": "string",
    "room_type": "string",
    "accommodates": 0,
    "price": 0,
    "price_date": "YYYY-MM-DD",
    "median_price": 0,
    "avg_price": 0,
    "rating": 0,
    "neighborhood_avg_rating": 0,
    "reviews_per_month": 0,
    "number_of_reviews_ltm": 0,
    "neighborhood_avg_reviews_per_month": 0,
    "host_is_superhost": true,
    "amenities_score": 0,
    "amenities": [],
    "missing_amenities": []
  },
  "analysis": {
    "pros": ["..."],
    "cons": ["..."],
    "summary": "string"
  },
  "analysis_cached": false
}
```

  `analysis` is empty (`pros: [], cons: [], summary: ""`) when no AI key is
  set or the AI call fails. `analysis_cached` is `true` when it comes from the
  `ai_analyses` cache instead of a new AI call. Fields without data are `null`.

- `400 Bad Request` -> `"Invalid Airbnb URL"` (missing, empty or not a
  listing URL)
- `404 Not Found` -> `"Listing not found"` (the id is not in the Vaud data)
- `422 Unprocessable Entity` -> `"Share link could not be resolved"` (a share
  link was recognised but did not redirect to a listing: expired code,
  timeout, or redirect outside Airbnb)
- `429 Too Many Requests` -> `"Too many checks, please wait a minute and try
  again."` or `"Daily limit of listing checks reached, please come back
  tomorrow."`

## Visualizations

### **`GET /api/heatmap`**

Returns the price map points: one point per listing of the latest scrape that
has coordinates and a current price.

### Response

- `200 OK` ->
```json
{
  "ok": true,
  "points": [ { "lat": 0, "lng": 0, "weight": 0, "price": 0 } ],
  "meta": {
    "mode": "listing",
    "normalization": { "min": 0, "max": 0 }
  }
}
```

  `price` is the nightly price in CHF. `weight` is that price scaled between 0
  and 1 with `(price - min) / (max - min)`, where `max` is the 95th percentile
  of prices (the real maximum with fewer than 20 points). The 5% most
  expensive listings are clamped to 1.

### **`GET /api/histogram`**

Returns the change of the median nightly price per region, in percent, between
the first priced scrape of the last 12 months and the latest priced scrape.

### Response

- `200 OK` ->
```json
{ "ok": true, "data": [ { "region": "string", "pct": 0 } ] }
```

  Regions without prices at both dates are left out, and `data` is empty when
  only one scrape has prices (nothing to compare). `pct` is `null` when the
  starting median is 0.
