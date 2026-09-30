# SmartBnB API endpoints

All endpoints live under `/api` and answer JSON. Errors share one shape:

```json
{ "ok": false, "error": "string" }
```

- `400 Bad Request` -> invalid parameter or body; `error` says which one
- `404 Not Found` -> unknown `/api` route (`"Not found"`) or unknown listing
- `429 Too Many Requests` -> `"Too many requests, please wait a minute and try
  again."`: every `/api` route except `/api/health` allows 120 requests per
  minute per visitor by default (`API_LIMIT_PER_MINUTE`)
- `500 Internal Server Error` -> `"Internal server error"` (the stack is only
  added outside production)

The data only changes when a snapshot is loaded, so the successful responses
of the read endpoints (`GET /api/listings`, `/api/listings/:id`,
`/api/heatmap`, `/api/histogram`) carry `Cache-Control: public, max-age=600`:
browsers and CDNs reuse them for 10 minutes (`READ_CACHE_TTL_MS`). Errors are
never cached.

## Health

### **`GET /api/health`**

Liveness and database check for uptime monitors. Runs `SELECT 1` and is never
cached (`Cache-Control: no-store`).

### Response

- `200 OK` -> `{ "ok": true }`
- `503 Service Unavailable` -> `{ "ok": false, "error": "Database unavailable" }`

## Listings

### **`GET /api/listings`**

Returns a filterable list of the Airbnb listings still active (in one of the
last 2 scrapes, `listing_activity` table), with the data of each one's latest
snapshot.

- `price_asc` leaves out long stays (`minimum_nights` of 28 or more): a monthly
  rent spread per night is not comparable with a holiday price.
- `rating_desc` ranks by a Bayesian average, so a perfect rating from a few
  guests does not beat a near perfect one from hundreds:
  `(n × rating + m × C) / (n + m)`, where `n` is the listing's number of
  reviews, `C` the mean rating of the active listings and
  `m = 40` (`RATING_PRIOR_REVIEWS`). Each rating counts as if it had 40 extra
  reviews at the mean, which matters for a listing with 5 reviews and barely
  for one with 400. `rating` in the response stays the raw average.

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
    "number_of_reviews": 0,
    "number_of_reviews_ltm": 0,
    "minimum_nights": 0,
    "long_stay": false,
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

Computes the SmartBnB score for an Airbnb URL and returns a summary. It never
waits for the AI: the written analysis comes with the score only when it is
already cached, otherwise the client asks for it with
[`POST /api/score/analysis`](#post-apiscoreanalysis).

Rate limited per visitor: 30 checks per minute by default
(`CHECK_LIMIT_PER_MINUTE`), on top of the limit of every `/api` route.

### Body (JSON)

- `airbnbUrl`: the listing to analyze. Accepts a bare listing id, a full
  listing URL (`/rooms/<id>`), or a share link from the Airbnb app
  (`airbnb.<tld>/l/<code>`, `airbnb.<tld>/h/<name>`, `abnb.me/<code>`).
  Share links are resolved by following their redirects, only to Airbnb
  hosts over https, with a 3 second timeout.
- `lang` (optional): language of the AI analysis, `en` (default) or `fr`.
  Any other value answers `400` with `"lang must be one of en, fr"`. The
  site sends the language the visitor picked.

### Response

- `200 OK` ->
```json
{
  "ok": true,
  "listing_id": "string",
  "active": true,
  "last_seen": "YYYY-MM-DD",
  "smart_score": 0,
  "breakdown": [
    {
      "part": "price",
      "points": 0,
      "max": 45,
      "status": "ok",
      "inputs": {
        "price": 0, "median_price": 0, "avg_price": 0, "comparables": 0,
        "level": "neighbourhood", "area": "string", "capacity_band": "3-4"
      }
    },
    {
      "part": "reviews",
      "points": 0,
      "max": 15,
      "status": "ok",
      "inputs": { "reviews_per_month": 0, "area_reviews_per_month": 0, "comparables": 0 }
    },
    {
      "part": "rating",
      "points": 0,
      "max": 15,
      "status": "ok",
      "inputs": { "rating": 0, "number_of_reviews": 0, "adjusted_rating": 0, "area_rating": 0 }
    },
    { "part": "amenities", "points": 0, "max": 15, "status": "ok", "inputs": { "amenities_score": 0, "min": 0, "max": 0 } },
    { "part": "superhost", "points": 0, "max": 10, "status": "ok", "inputs": { "host_is_superhost": true } }
  ],
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
    "price_baseline": { "level": "neighbourhood", "area": "string", "capacity_band": "3-4", "n_listings": 0 },
    "number_of_reviews": 0,
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
  "analysis_cached": false,
  "analysis_pending": true
}
```

  `analysis` is the cached analysis in `lang`, or `null`. `analysis_pending`
  is `true` when an AI is configured and the analysis is not cached yet: ask
  for it with `POST /api/score/analysis`. `analysis_cached` is `true` when
  `analysis` is set.
  `active` is `false` when the listing is no longer on Airbnb (missing from
  the last 2 scrapes); `last_seen` is the day of its latest scrape. Such a
  listing is not scored: `smart_score`, `breakdown` and `analysis` are `null`,
  `analysis_pending` is `false`, and no AI call is made. The listing's data is
  still returned.

  `breakdown` says where the score comes from, one entry per part in this
  order: `points` earned out of `max` (the part's weight), whole numbers that
  add up exactly to `smart_score` (largest remainder rounding). `status` is
  `ok`, `neutral_missing_data` when the part lacked data and counts as a
  middle value (half its points; for the rating, the canton's mean rating),
  or `low_sample` when its baseline rests on fewer than 5 listings.

  - `price`: the listing's price against the median of similar stays (same
    room type and capacity band `1-2`, `3-4`, `5-6`, `7+`), in the
    neighbourhood when it has at least 5 of them, else the district, else
    the canton (`level`, `area`). `comparables` is their number.
  - `reviews`: reviews per month against the neighbourhood average;
    `comparables` is the number of listings behind that average.
  - `rating`: a Bayesian average, the rating pulled towards the canton's mean
    (`area_rating`) as if the listing had 10 more reviews at that mean
    (`adjusted_rating`); 4.5 or less gives no point, 5.0 all 15.

  `listing.price_baseline` repeats where `median_price` comes from.
  `breakdown` is `null` for a listing that is not scored.

  Fields without data are `null`.

- `400 Bad Request` -> `"Invalid Airbnb URL"` (missing, empty or not a
  listing URL) or `"lang must be one of en, fr"`
- `404 Not Found` -> `"Listing not found"` (the id is not in the Vaud data)
- `422 Unprocessable Entity` -> `"Share link could not be resolved"` (a share
  link was recognised but did not redirect to a listing: expired code,
  timeout, or redirect outside Airbnb)
- `429 Too Many Requests` -> `"Too many checks, please wait a minute and try
  again."`

### **`POST /api/score/analysis`**

Returns the written AI analysis of a listing: from the `ai_analyses` cache,
or written by the AI model when it is not cached yet (this can take several
seconds). Parallel requests for the same listing share one AI call.

Rate limited per visitor, since it spends the shared daily AI quota: 10
requests per minute and 60 per day by default (`SCORE_LIMIT_PER_MINUTE`,
`SCORE_LIMIT_PER_DAY`).

### Body (JSON)

- `listingId`: the `listing_id` returned by `POST /api/score` (digits).
- `lang` (optional): `en` (default) or `fr`, as for `POST /api/score`.

### Response

- `200 OK` ->
```json
{
  "ok": true,
  "listing_id": "string",
  "analysis": { "pros": ["..."], "cons": ["..."], "summary": "string" },
  "analysis_cached": false
}
```

  `analysis` holds at most 4 pros and 4 cons, written in `lang`.
  `analysis_cached` is `true` when it comes from the cache instead of a new
  AI call. Each language is cached separately. `analysis` is empty
  (`pros: [], cons: [], summary: ""`) when no AI key is set, the AI call
  fails (the listing is then not retried for 5 minutes), or the daily AI
  budget is spent (`AI_DAILY_CALL_LIMIT`, 500 calls by default); it is `null`
  for a listing no longer on Airbnb. Each call logs its duration, whether it
  came from the cache and whether it is empty.

- `400 Bad Request` -> `"Invalid listing id"` or `"lang must be one of en, fr"`
- `404 Not Found` -> `"Listing not found"`
- `429 Too Many Requests` -> `"Too many checks, please wait a minute and try
  again."` or `"Daily limit of listing checks reached, please come back
  tomorrow."`

## Visualizations

### **`GET /api/heatmap`**

Returns the price map points: one point per active listing (same rule as `/api/listings`) that
has coordinates and a current price. The response is cached in memory for 10
minutes (`READ_CACHE_TTL_MS`), since it only changes when a snapshot is loaded.

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

Returns, per region, the median change in percent of the nightly price of the
listings priced both in the first priced scrape of the last 12 months and in
the latest one. The comparison never crosses a change in how Inside Airbnb
reports prices: the first date is then the first scrape after that change.
The values are precomputed at each data refresh (`price_trends` table, see
`data/transform/models/marts/price_trends.sql`) and cached in memory like the heatmap.

### Response

- `200 OK` ->
```json
{
  "ok": true,
  "data": [
    { "region": "string", "pct": 0, "start_date": "2026-03-16", "end_date": "2026-09-14", "n_listings": 0 }
  ]
}
```

  `start_date` and `end_date` are the days of the two scrapes compared (the
  same for every region), and `n_listings` the number of listings behind
  `pct`. Regions with fewer than 20 such listings are left out, and `data` is
  empty when there is nothing to compare yet.
