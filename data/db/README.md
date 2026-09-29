# SmartBnB database

Everything needed to (re)build the SmartBnB Postgres database, on Supabase or locally.

| File | Role |
| --- | --- |
| `schema.sql` | Creates all tables (drops them first) |
| `seed.sql` | The 10 amenity categories and their score weights |
| `load_data.py` | Loads every CSV in `data/`, recomputes the stats tables, audits and publishes them |
| `quality.py` | The quality checks of each load (see [Data quality](#data-quality)) |
| `roles.sql` | Least-privilege roles for the backend, the backup and the loader (see below) |
| `migrations/` | Changes to apply to an existing database, see [Migrations](#migrations) |
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
| `price_trends` | Median price change per region over the last 12 months (the site's "Prices this year") |
| `etl_runs` | One row per run of `load_data.py`: metrics and quality check results |
| `ai_analyses` | Cache of the AI analysis per listing, data version, model and language (filled by the backend) |
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

git clone git@github.com:AdamoElProfesor/SmartBnB-data.git ../snapshots   # private
echo DATABASE_URL=postgresql://... > .env
python load_data.py --init    # creates the schema, seeds, loads the CSVs
```

Then keep it up to date. The weekly `data-refresh.yml` workflow does it (see
[operations.md](../../docs/operations.md#data-refresh)), or run the loader by hand:

```bash
python load_data.py --fetch                  # download + add the latest InsideAirbnb snapshot
python load_data.py --dates 2025-07-04 ...   # download + add specific snapshots
python load_data.py --full                   # wipe and reload every file on disk
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

Prices below 5 CHF are treated as missing: the Swiss scrapes of June to
September 2026 first shipped a broken price column. Inside Airbnb republished
them with corrected prices; a republished file keeps its scrape id, so it is
loaded again with `python load_data.py --reload <date> ...`, which replaces
that scrape in the same transaction as the audit. `current_prices` holds each listing's newest valid
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
the price scraper.

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
