# SmartBnB database

Everything needed to (re)build the SmartBnB Postgres database, on Supabase or locally.

| File | Role |
| --- | --- |
| `schema.sql` | Creates all tables (drops them first) |
| `seed.sql` | The 10 amenity categories and their score weights |
| `load_data.py` | Loads every CSV in `data/`, recomputes the stats tables, audits and publishes them |
| `quality.py` | The quality checks of each load (see [Data quality](#data-quality)) |
| `roles.sql` | Least-privilege roles for the backend, the backup and the loader (see below) |
| `tests/` | Tests of the loader and of the checks: `pip install -r requirements-dev.txt`, then `pytest` |

## Tables

| Table | Content |
| --- | --- |
| `airbnb_vaud` | One row per listing (static info from its latest scrape) |
| `airbnb_snapshots` | One row per listing per scrape: price, reviews, ratings |
| `amenity_references` / `amenity_points` | Amenity categories and their weight |
| `airbnb_amenities` | Which listing has which amenity category |
| `airbnb_points` | Amenities score per listing (sum of weights) |
| `neighbourhood_room_type_stats` | Avg / median price per neighbourhood and room type |
| `neighbourhood_stats` | Average review score and reviews per month per neighbourhood |
| `current_prices` | Latest plausible price per listing (last 6 months) |
| `etl_runs` | One row per run of `load_data.py`: metrics and quality check results |
| `raw_airbnb_vaud` | Legacy staging table from the old Airflow DAG (not used by `load_data.py`) |

The stats tables are computed over the last 3 months of scrapes (`--stats-months`).

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

echo DATABASE_URL=postgresql://... > .env
python load_data.py --init    # creates the schema, seeds, loads the CSVs
```

Then keep it up to date. There is no scheduled pipeline (the old Airflow DAG
was removed): run the loader by hand when InsideAirbnb publishes a new snapshot.

```bash
python load_data.py --fetch                  # download + add the latest InsideAirbnb snapshot
python load_data.py --dates 2025-07-04 ...   # download + add specific snapshots
python load_data.py --full                   # wipe and reload every file on disk
```

Snapshots come from `data/*.csv.gz`, every month since July 2024. They are all
kept in git so the database can be rebuilt from a clone, without depending
on InsideAirbnb keeping its archives online. `--fetch` and `--dates` save new downloads there,
so commit them after loading. By default only scrapes missing from the
database are added, so the history is never lost.

This folder is public, so the snapshots only keep the 26 columns the loader
reads (`PUBLISHED_COLS` in `load_data.py`), out of about 90 in an Inside
Airbnb file (data minimisation). It is an allow list: host names, host
profiles, the free text written by hosts (descriptions, which often name
them) and any column Inside Airbnb adds later are never published.
Downloads are minimized before they are saved, and CI fails if a file in
`data/` holds another column:

```bash
python load_data.py --check      # list the files with unpublished columns
python load_data.py --minimize   # rewrite them with PUBLISHED_COLS only
```

Prices below 5 CHF are treated as missing: the Swiss scrapes since June 2026
ship a broken price column. `current_prices` holds each listing's newest valid
price, from the snapshots or from the monthly price collection in
[`data/prices`](../prices/README.md), and the neighbourhood medians use one
price per listing.

## Data quality

Every load follows **Write-Audit-Publish**, in one transaction:

1. **Write**: new scrapes are added and the price and stats tables are
   recomputed. Prices outside 20 to 5,000 CHF a night are skipped (a
   listing then keeps its previous plausible price).
2. **Audit**: `quality.py` measures the result the way the site would see it
   and checks each measure.
3. **Publish**: the transaction is committed only if no blocking check
   failed. Otherwise it is rolled back and the site keeps the previous data.

| Kind | Checks | When it fails |
| --- | --- | --- |
| Volume | listings in the latest scrape, listings with a price | blocks |
| Validity | share of active listings with a price, median price 60 to 400 CHF, no price outside the range | blocks |
| Consistency | known room types, coordinates present and inside canton Vaud, stats tables not empty | blocks |
| Drift | listings or prices down more than 30% since the last published run | blocks |
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

`python load_data.py --dry-run` runs the whole load and audit, then rolls
back: a safe way to try a change against the real database. Exit code: 0
published, 2 published with warnings, 1 blocked or failed. The weekly
[Data refresh workflow](../../docs/operations.md#data-refresh) runs the load
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
| `smartbnb_loader` | Data refresh workflow (GitHub secret `LOADER_DATABASE_URL`) | read every table, rewrite the listing and stats tables, write `etl_runs`; no DDL, no write on `price_observations` |

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v app_password="$(openssl rand -hex 32)" \
  -v backup_password="$(openssl rand -hex 32)" \
  -v loader_password="$(openssl rand -hex 32)" \
  -f data/db/roles.sql
```

Run it once: `schema.sql` (and `load_data.py --init`) gives the grants and
policies back whenever it recreates the tables. On the Supabase pooler the
user name is `<role>.<project ref>`; the loader needs the session pooler
(port 5432). Keep `postgres` for `schema.sql`, `load_data.py --init` and
`scrape_prices.py`.
