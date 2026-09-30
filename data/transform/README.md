# SmartBnB transformations (dbt)

The T of the pipeline's ELT: [dbt](https://docs.getdbt.com) models that turn
the raw Inside Airbnb tables into the tables the site reads, with their
business rules, tests and documentation. `data/db/load_data.py` extracts and
loads the raw data, `data/db/pipeline.py` runs `dbt build`, then publishes
and audits the result (see [data/db](../db/README.md#data-quality)).

Everything is built in the `build` schema, never in `public`: the marts
reach the site only once every test and the audit have passed.

## Layers

```
sources          raw.airbnb_vaud, raw.airbnb_snapshots, raw.airbnb_amenities   (build schema, from load_data.py)
                 app.price_observations, app.amenity_points                     (public schema, read only)
staging          stg_listings, stg_snapshots, stg_amenities, stg_price_observations      views
intermediate     int_active_listings, int_listing_prices, int_listing_latest_snapshots    views
marts            listing_activity, current_prices, airbnb_points,                         tables
                 price_baselines, neighbourhood_room_type_stats, neighbourhood_stats, price_trends
```

- **Staging**: one model per source, renamed and cleaned. `stg_snapshots`
  holds the price validity rule (a scrape whose median price is below 5 CHF
  shipped a broken price column, and a single price below 5 CHF is a parsing
  error).
- **Intermediate**: `int_listing_prices` puts the three price definitions
  together (the Inside Airbnb scrapes and the two passes of the price
  scraper), with a `source` column that `current_prices` keeps, and keeps
  the plausible nightly prices (20 to 5,000 CHF). `int_listing_latest_snapshots`
  keeps each listing's latest snapshot of the stats window, so a listing
  counts once in the neighbourhood baselines.
- **Marts**: the tables the backend reads, with the names and columns of the
  public tables. `listing_activity` gives each listing its lifetime and the
  one definition of "still on Airbnb" (in one of the last 2 scrapes), which
  `int_active_listings` applies to the prices and the neighbourhood baselines.

The business rules (price range, time windows) are the `vars` of
[`dbt_project.yml`](dbt_project.yml); `data/db/quality.py` reads the price
range from there too.

## Tests

`dbt build` runs every test right after building the model it checks, and
skips the models downstream of a failure.

- Generic tests on every model: keys `unique` and `not_null`,
  `relationships` to `stg_listings`, `accepted_values` on the room type and
  the price source, and `in_range` (in `tests/generic`) on prices, medians,
  counts and review scores.
- `unique_columns` (in `tests/generic`) on composite keys, such as a listing
  per scrape.
- A singular test (`tests/price_trends_cover_a_period.sql`).
- Unit tests of the business rules, on fixed input rows (in the model YAML
  files): broken scrape prices are dropped, the current price is the newest
  one in the window, a price is compared as locally as the data allows,
  price trends never cross a change of price definition,
  a listing counts once in the stats window, a listing without review counts
  as 0 in the reviews baseline, and a listing stays active through one
  partial scrape but not two missed ones.

Staging casts prices and scores to `double precision`: the production table
stores some of them as `real`, and the unit tests caught that the results
depended on it.

## Run it

The pipeline sets the connection from `DATABASE_URL` (see
[`profiles.yml`](profiles.yml)). To run dbt alone, from this folder:

```bash
pip install -r ../db/requirements.txt
export DBT_HOST=localhost DBT_USER=postgres DBT_PASSWORD=postgres   # PowerShell: $env:DBT_HOST = "localhost" ...
dbt build --profiles-dir .              # models and tests, in the build schema
dbt docs generate --static --profiles-dir .   # target/static_index.html
```

`build` must already hold the raw tables: run `python data/db/load_data.py`
first, or the whole pipeline.

## Documentation and lineage

`dbt docs generate --static` writes a single HTML page with the description
of every model and column, and the lineage graph (which table feeds which).
The CI builds it on synthetic data at every run: download `dbt-docs` from
the artifacts of a [CI run](../../.github/workflows/ci.yml), open
`static_index.html`, and click the graph icon for the lineage.
