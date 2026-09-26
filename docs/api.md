# SmartBnB API endpoints

## Listings
### **`GET /api/listings`**

Returns a filterable list of airbnb listings still active in the latest scrape

### Query parameters
- `rating_min` : minimum average rating to include
- `sort` : one of price_asc, most_booked, rating_desc, listing_id_asc (default)
- `limit` : can choose the limit of outputed listings (default 10)

### Response
- `200 OK` -> `Array<object>`

### **`GET /api/listings/:id`**

Returns full details for a single listing

### Response

- `200 OK` -> `object`
- `404 Not Found`-> `{ "error": "Listing not found" }`

## Scoring
### **`POST /api/score`**

Computes the SmartBnB score for an Airbnb URL and returns a summary

### Body (JSON)
B
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
    "title": "string",
    "price": 0,
    "rating": 0,
    "amenities": [],
    "missing_amenities": []
  },
  "analysis": {
    "pros": ["..."],
    "cons": ["..."],
    "explanation": "string"
  }
}
```

- `400 Bad Request`-> invalid or missing URL

- `404 Not Found` -> listing could not be matched from the provided URL

- `422 Unprocessable Entity` -> a share link was recognised but did not
  redirect to a listing (expired code, timeout, or redirect outside Airbnb)

## Visualizations

### **`GET /api/listings/:id`**

Returns heatmap data for listings

### Response

- `200 OK` ->
```json
{
  "ok": true,
  "points": [ /* mapped & normalized points */ ],
  "meta": {
    "mode": "listing",
    "normalization": { "min": 0, "max": 0 }
  }
}
````

### **`GET /api/histogram`**

Returns base histogram data (price evolution percent by region)

### Response

- ``200 OK``->
```json
{ "ok": true, "data": [ { "region": "string", "pct": 0 } ] }
```


