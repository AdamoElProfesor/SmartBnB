# Price collection

Since June 2026, the Inside Airbnb snapshots for Switzerland have no usable
prices (every value is below 1 CHF). `scrape_prices.py` collects current
nightly prices of the Vaud listings from Airbnb instead, once a month.

## Pipeline

```
Airbnb search + listing pages
        │  scrape_prices.py      (extract)
        ▼
price_observations               raw layer: one row per listing and run,
        │                        with the full price breakdown
        │  load_data.py          (transform + load)
        ▼
current_prices                   newest price per listing (snapshots or
        │                        observations, whichever is newer)
        ▼
neighbourhood_room_type_stats    median price per neighbourhood and room
                                 type, one price per listing
```

## Price metric

```
nightly_price = (total - taxes) / nights
```

- Swiss listings show cleaning and service fees inside the nightly rate, so
  the total already includes them, as well as discounts (weekly, early
  booking, last minute).
- Taxes are left out: they depend on the municipality, not on the host.
- Checked against the last valid Inside Airbnb prices (April and May 2026):
  median ratio 1.01 on 171 Lausanne listings, so both series can be compared.

## How a run works

1. **Search pass.** The box around the active listings is cut into
   0.1° tiles. Each tile is searched for one reference stay: 2 nights from
   the first Friday at least four weeks ahead, 1 adult, in CHF. A tile with
   240 results or more is split in four, because one search returns at most
   about 270 listings. Every listing found gets a price for the same dates.
2. **Listing pass.** Active listings the search did not return (minimum stay
   longer than 2 nights, already booked that weekend) are priced one by one,
   for their next free stay at least a week ahead, of their minimum length
   (at least 2 nights). Listings with no free dates in the next year are
   stored as `unavailable`.

Requests are spaced out (2 to 3 seconds), and the run stops after five errors
in a row. It is resumable: rerunning with the same `--run-id` skips the
listings already stored.

## Run it

```bash
pip install -r data/prices/requirements.txt
python data/prices/scrape_prices.py          # a few hours, run id = today
python data/db/load_data.py                  # refresh current_prices and medians
```

`DATABASE_URL` is read like `load_data.py` does (environment variable or
`data/db/.env`). Test with `--limit 20` and a small `--bounds` box first.

## Rules

- Only prices are collected: no names, photos, hosts or reviews.
- Collected prices stay in the database and are not committed to this
  repository.
- Airbnb's terms of service do not allow automated collection. The volume is
  kept low, and collection stops if Airbnb asks.
- The scraper relies on [pyairbnb](https://github.com/johnbalvin/pyairbnb),
  which follows Airbnb's internal API. When Airbnb changes it, update the
  pinned version in `requirements.txt`.
