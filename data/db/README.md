# SmartBnB database

Everything needed to (re)build the SmartBnB Postgres database, on Supabase or locally.

| File | Role |
| --- | --- |
| `schema.sql` | Creates all tables (drops them first) |
| `seed.sql` | The 10 amenity categories and their score weights |
| `pipeline.py` | Runs the pipeline: extract-load, dbt build, publish, audit (see [Data quality](#data-quality)) |
| `load_data.py` | Extract and load: downloads the snapshots and loads them, typed but otherwise as received, into the `build` schema |
| `publish.py` | Copies the checked `build` tables into the `public` tables the site reads |
| `quality.py` | The audit of each run (see [Data quality](#data-quality)) |
| `roles.sql` | Least-privilege roles for the backend, the backup and the loader (see below) |
| `migrations/` | Changes to apply to an existing database, see [Migrations](#migrations) |
| `tests/` | Tests of the pipeline and of the checks: `pip install -r requirements-dev.txt`, then `pytest` (and `ruff check ..` for the lint rules of `data/ruff.toml`); `tests/e2e_pipeline.py` runs the whole pipeline on synthetic data (CI) |

The transformations (the T of ELT) are dbt models in
[`data/transform`](../transform/README.md): they turn the raw tables into the
tables the site reads, with the business rules, tests and documentation.

```
Inside Airbnb files ──> load_data.py ──> build.airbnb_* (raw)
price_observations ───────────────────┐        │
                                      dbt build: staging → intermediate → marts, tests
                                               │
                            publish.py + quality.py, one transaction
                                               │
                                       public.* (the site)
```

## Tables

| Table | Content |
| --- | --- |
| `airbnb_vaud` | One row per listing (static info from its latest scrape) |
| `airbnb_snapshots` | One row per listing per scrape: price, reviews, ratings |
| `amenity_references` / `amenity_points` | Amenity categories and their weight |
| `airbnb_amenities` | Which listing has which amenity category |
| `airbnb_points` | Amenities score per listing (sum of weights) |
| `neighbourhood_room_type_stats` | Avg / median price per neighbourhood and room type |
| `neighbourhood_stats` | Review baselines per neighbourhood: overall rating, reviews per month, sample sizes (see [Metrics](#metrics)) |
| `listing_activity` | Lifetime of each listing (first and last seen) and whether it is still on Airbnb (see [Metrics](#metrics)) |
| `current_prices` | Latest plausible price per active listing (last 6 months) |
| `price_trends` | Median price change per region of the same listings over the last 12 months, within one price definition (the site's "Price trends") |
| `etl_runs` | One row per run of `pipeline.py`: metrics and quality check results |
| `ai_analyses` | Cache of the AI analysis per listing, data version, model and language (filled by the backend) |

The first three are loaded by `load_data.py`; `airbnb_points`,
`current_prices` and the stats and trends tables are dbt marts. The stats
tables are computed over the last 3 months of scrapes (`--stats-months`).

The `build` schema holds the next version of all of them while a run
prepares it. The site never reads it, the backups skip it and the Supabase
API does not expose it.

## Setup

### 1. Get a database

**Supabase**: create a project, then copy the connection string from
*Connect → Connection string → Session pooler* (port 5432). Session mode is
needed for the loader; the backend can use either pooler.

**Local**:

```bash
docker run -d --name smartbnb-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17-alpine
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
```

### 2. Load the data

```bash
cd data/db
python -m venv .venv
.venv/Scripts/activate        # Windows (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt

git clone git@github.com:AdamoElProfesor/SmartBnB-data.git ../snapshots   # private
echo DATABASE_URL=postgresql://... > .env
python pipeline.py --init     # creates the schema, seeds, loads, transforms, publishes
```

Then keep it up to date. The weekly `data-refresh.yml` workflow does it (see
[operations.md](../../docs/operations.md#data-refresh)), or run the pipeline by hand:

```bash
python pipeline.py --fetch                  # download + add the latest InsideAirbnb snapshot
python pipeline.py --dates 2025-07-04 ...   # download + add specific snapshots
python pipeline.py --full                   # rebuild everything from the files on disk
```

Snapshots come from `data/snapshots/*.csv.gz`, every month since July 2024.
That folder is a clone of the private `SmartBnB-data` repository, ignored by
this one: the [Inside Airbnb data policies](https://insideairbnb.com/data-policies/)
ask not to republish the data, and CI fails if a data file is committed
here. The archive lets the database be rebuilt without depending on
Inside Airbnb keeping its archives online (only the last 12 months are free
to download). `--fetch` and `--dates` save new downloads there, so commit and
push them in `data/snapshots` after loading. By default only scrapes missing
from the database are added, so the history is never lost.

The snapshots only keep the 26 columns the loader reads (`PUBLISHED_COLS` in
`load_data.py`), out of about 90 in an Inside Airbnb file (data
minimisation). It is an allow list: host names, host profiles, the free text
written by hosts (descriptions, which often name them) and any column Inside
Airbnb adds later are never stored. Downloads are minimized before they are
saved:

```bash
python load_data.py --check      # list the files with unpublished columns
python load_data.py --minimize   # rewrite them with PUBLISHED_COLS only
```

Prices below 5 CHF are treated as missing (the `stg_snapshots` dbt model):
the Swiss scrapes of June to September 2026 first shipped a broken price
column. Inside Airbnb republished them with corrected prices; a republished
file keeps its scrape id, so it is loaded again with
`python pipeline.py --reload <date> ...`, which replaces that scrape before
the audit. `current_prices` holds each listing's newest valid price, from the
snapshots or from the monthly price collection in
[`data/prices`](../prices/README.md), and the neighbourhood medians use one
price per listing. These rules are the `vars` of
[`data/transform/dbt_project.yml`](../transform/dbt_project.yml).

## Metrics

What the score compares a listing with, and how each number is built. A
baseline is always measured the same way as the listing value it is compared
with, counts each listing once, and only counts the listings still on Airbnb.

**Active listings.** Of the 9,470 listings seen since 2024, about 5,500 are
still on Airbnb. One rule, computed once in `listing_activity`, decides which:
in one of the last 2 scrapes. The score, the price map, the Top 10 and every
statistic of the current market use it; a listing that left is not scored.
Requiring the latest scrape only would be exact, but a single partial file
(2026-01-15 had 3,851 rows instead of about 5,500) would then mark thousands
of real listings as gone; with 2 scrapes, a listing that left stays active
one more month at most. The audit warns when more than 10% of the active
listings are missing from the latest scrape, the sign of a partial file.
`price_trends` is the exception: it compares past scrapes, so it counts the
listings active at the time.

**Price trends.** Inside Airbnb changed how it reports prices between the
November 2025 and March 2026 scrapes: the same listings went up by a median
34% in one step and only 0.7% kept their price, while from one month to the
next the median listing does not move and 20 to 70% of the prices stay the
same. The old trend compared the median of all listings across that step and
showed every district at +30% to +65%. `price_trends` now compares like with
like: only the listings priced at both dates (a panel, so listings joining or
leaving do not move it), the median of their own price changes (robust to a
few extreme prices), and never across a change of definition, detected as a
step where the same listings move by more than 25% (`price_break_ratio`). In
September 2026 that gives March to September 2026, about +1.5% per district.
A district needs 20 such listings (`min_trend_listings`).

| Metric | Definition | Grain | Window | Empty values |
| --- | --- | --- | --- | --- |
| `listing_activity.is_active` | The listing is in one of the last 2 scrapes (`active_scrapes`), so presumably still on Airbnb | one row per listing ever seen | the last 2 scrapes | never empty |
| `current_prices.price` | Newest nightly price of the listing, 20 to 5,000 CHF | one row per listing | seen in the 6 months before the newest price | a price outside the range is skipped, the listing keeps its previous one |
| `current_prices.source` | Which price definition it comes from: `insideairbnb` (price column of the scrape), `scrape_search` (price scraper, a Friday, 2 nights, about 4 weeks ahead), `scrape_listing` (price scraper, next free stay of the minimum length) | per price | | never empty |
| `neighbourhood_room_type_stats.median_price`, `avg_price` | Median and mean of `current_prices.price` per neighbourhood and room type | one price per listing | prices of the last 3 months | listings without a current price are left out |
| `neighbourhood_stats.avg_reviews_per_month` | Mean `reviews_per_month` of the neighbourhood's listings | one row per listing: its latest snapshot | scrapes of the last 3 months | a listing with no review counts as 0, as on the listing side of the score (Inside Airbnb leaves the value empty exactly then) |
| `neighbourhood_stats.avg_rating` | Mean overall rating (`review_scores_rating`, 1 to 5), the metric shown for the listing | one row per listing: its latest snapshot | scrapes of the last 3 months | listings without a rating (no review) are left out |
| `neighbourhood_stats.n_listings`, `n_rated_listings` | Number of listings behind `avg_reviews_per_month` and behind `avg_rating` | | | |

The windows are the `vars` of
[`data/transform/dbt_project.yml`](../transform/dbt_project.yml) and the
definitions are tested by the dbt unit tests (a listing counts once in the
window, a listing without review counts as 0). In September 2026 half of the
neighbourhoods rested on fewer than 5 listings: `n_listings` says how far to
trust a baseline.

## Data quality

Every run follows **Write-Audit-Publish**: the site only ever sees data that
passed every check.

1. **Write**: `load_data.py` copies the published raw tables into the
   `build` schema and adds the new scrapes; `dbt build` turns them into the
   tables the site reads, still in `build`. Prices outside 20 to 5,000 CHF a
   night are skipped (a listing then keeps its previous plausible price).
2. **Audit, part 1**: `dbt build` tests every model as it builds it (keys
   unique and present, links between tables, accepted values, ranges, and
   unit tests of the business rules). A failing test stops the run.
3. **Publish and audit, part 2**: one transaction refills the public tables
   from `build`, then `quality.py` measures them the way the site will see
   them and checks each measure. The transaction is committed only if no
   blocking check failed. Otherwise it is rolled back and the site keeps the
   previous data.

The public tables are emptied and refilled, not dropped and recreated, so
they keep their keys, indexes, grants and row level security policies.

| Kind | Checks | When it fails |
| --- | --- | --- |
| Volume | listings in the latest scrape, listings with a price | blocks |
| Validity | share of active listings with a price, median price 60 to 400 CHF, no price outside the range | blocks |
| Consistency | known room types, coordinates present and inside canton Vaud, stats tables not empty | blocks |
| Model tests | every dbt test (see [data/transform](../transform/README.md#tests)) | blocks (a `warn` test warns) |
| Drift | listings or prices down more than 30% since the last published run, a scrape of the history lost | blocks |
| Drift | median price moved more than 20% since the last published run | warns |
| Freshness | newest scrape or newest price older than 45 days | warns |
| Reliability | more than 2% of collected prices dropped, more than 25% of listings compared with fewer than 5 similar ones | warns |

The thresholds are in `quality.evaluate` and are tested in
`tests/test_quality.py`. Each run is stored in `etl_runs` with its metrics
and the result of every check, blocked or not:

```sql
SELECT id, started_at, trigger, status, new_scrapes,
       metrics->>'median_price' AS median_price
FROM etl_runs ORDER BY id DESC LIMIT 10;
```

`python pipeline.py --dry-run` runs every step, then rolls the publication
back: a safe way to try a change against the real database (only the
`build` schema changes). Exit code: 0 published, 2 published with warnings,
1 blocked or failed. The weekly
[Data refresh workflow](../../docs/operations.md#data-refresh) runs the pipeline
in GitHub Actions and emails on anything but 0.

### 3. Point the backend at it

Put the same `DATABASE_URL` in `smartbnb/backend/.env`. SSL is enabled
automatically for remote hosts and disabled for `localhost`.

## Least-privilege roles

`schema.sql` enables row level security with no policy, so only the owner
(`postgres`) sees any row. Connecting the backend and the backup as `postgres`
works, but then a leaked credential can drop every table, including
`price_observations`, which cannot be rebuilt. `roles.sql` creates three
roles that can only do what their job needs:

| Role | Used by | Rights |
| --- | --- | --- |
| `smartbnb_app` | backend (Render `DATABASE_URL`) | read every table, insert into `ai_analyses` |
| `smartbnb_backup` | `pg_dump` (GitHub secret `BACKUP_DATABASE_URL`) | read every table and sequence |
| `smartbnb_loader` | Data refresh workflow (GitHub secret `LOADER_DATABASE_URL`) | read every table, create tables in the `build` schema only, refill the listing and stats tables, write `etl_runs`; no DDL on `public`, no write on `price_observations` |

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v app_password="$(openssl rand -hex 32)" \
  -v backup_password="$(openssl rand -hex 32)" \
  -v loader_password="$(openssl rand -hex 32)" \
  -f data/db/roles.sql
```

Run it once: `schema.sql` (and `pipeline.py --init`) gives the grants and
policies back whenever it recreates the tables. On the Supabase pooler the
user name is `<role>.<project ref>`; the loader needs the session pooler
(port 5432). Keep `postgres` for `schema.sql`, `pipeline.py --init` and
the price scraper. Run the other pipeline runs as `smartbnb_loader`: the
`build` tables belong to whoever created them, and the loader could not
replace tables that `postgres` created there.

## Migrations

`schema.sql` drops and recreates the tables, which is fine for a new
database but not for production, where `ai_analyses` and `price_observations`
hold data that cannot be reloaded. A change to an existing table therefore
also gets a script in `migrations/`, named by date, that brings a database
from the previous schema to the new one without losing rows. Each script can
be run twice without harm. Apply them in date order, as `postgres`, before
deploying the code that needs them:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/db/migrations/<file>.sql
```

| Migration | Change |
| --- | --- |
| `2026-09-29-ai-analyses-lang.sql` | `ai_analyses.lang` in the primary key: one cached analysis per language |
| `2026-09-30-build-schema.sql` | `build` schema for the pipeline (the loader may create tables there), legacy `raw_airbnb_vaud` dropped |
| `2026-09-30-baseline-columns.sql` | Expand step of #49: `neighbourhood_stats.avg_rating`, `n_listings`, `n_rated_listings` and `current_prices.source` |
| `2026-09-30-listing-activity.sql` | `listing_activity` table (#47), with its row level security, grants and policies |
| `2026-09-30-baseline-columns-contract.sql` | Contract step of #49: `neighbourhood_stats.avg_reviews` dropped, the new columns made `NOT NULL`, `current_prices.source` limited to its three values |
| `2026-09-30-price-trends-panel.sql` | `price_trends` on the same listings (#17): `start_median` and `end_median` dropped, `n_listings` added, the table emptied until the next run |
| `2026-09-30-price-scrape-tiles.sql` | `price_scrape_tiles`, the map tiles the price scraper has searched in a run, so an interrupted run resumes (#37) |

A column that changes name goes through **expand / contract**, so the site
keeps working at every step: the expand migration adds the new column, the
pipeline fills both and the backend switches to the new one; once that is
deployed, a contract migration drops the old column.
