# Price collection

From June to September 2026, the Inside Airbnb snapshots for Switzerland had
no usable prices (every value was below 1 CHF) until Inside Airbnb republished
them. A price scraper collects current nightly prices of the Vaud listings
from Airbnb directly, once a month, so prices stay fresh between snapshots.

## Where the scraper lives

The scraper is kept in the private `SmartBnB-data` repository (`prices/`),
next to the snapshot archive. This repository only documents the pipeline and
the table it fills.

Why: Airbnb's terms of service do not allow automated collection, and this
repository is public. Publishing a working scraper would hand out a tool that
breaks those terms, whatever safeguards it has. Two other options were
considered (#36):

- **Keep it public with explicit safeguards**: the code would stay a working
  tool anyone can reuse, and the safeguards only bind this project.
- **Stop collecting prices** and show the last valid Inside Airbnb price with
  its date: simpler, but prices get up to a month old between snapshots.

## Pipeline

```
Airbnb search + listing pages
        │  price scraper         (extract, private repository)
        ▼
price_observations               raw layer: one row per listing and run,
        │                        with the full price breakdown
        │  dbt models            (transform, data/transform)
        ▼
current_prices                   newest price per listing (snapshots or
        │                        observations, whichever is newer)
        ▼
price_baselines                  median price of the similar stays of each
                                 listing, one price per listing
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

## What a run collects

1. **Search pass.** One reference stay for every listing found on the map:
   2 nights from the first Friday at least four weeks ahead, 1 adult, in CHF.
2. **Listing pass.** Active listings the search did not return (longer
   minimum stay, already booked that weekend) are priced for their next free
   stay of their minimum length. Listings with no free dates in the next year
   are stored as `unavailable`.

## Rules

- Only prices are collected: no names, photos, hosts or reviews.
- Collected prices stay in the database and are not committed to any
  repository.
- The volume is kept low (requests spaced out, the run stops after repeated
  errors), and collection stops if Airbnb asks.
