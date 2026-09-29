"""Extract and load step of the SmartBnB pipeline (the E and L of ELT).

Snapshots are read from data/snapshots/*.csv.gz, a clone of the private
SmartBnB-data repository (the Inside Airbnb data policies ask not to
republish the data), so the database can be rebuilt from it. Downloaded
snapshots are saved there too, to be committed to that repository, with only
the columns the loader uses (PUBLISHED_COLS).

The rows are loaded typed but otherwise as received: the business rules
(which prices are plausible, time windows) live in the dbt models of
data/transform. Nothing is written to the public schema the site reads: the
load fills a candidate copy of the raw tables in the build schema (the
published tables plus the new scrapes), which dbt transforms and tests there.
data/db/pipeline.py then audits it and publishes it (Write-Audit-Publish).
By default only scrapes that are not published yet are added, so the history
is never lost.

Usage (pipeline.py runs this step; alone it only fills the build schema):
  python load_data.py                 # add new scrapes found on disk
  python load_data.py --fetch         # download the latest snapshot first
  python load_data.py --dates 2025-07-04 2025-08-03   # download these first
  python load_data.py --reload 2026-06-15   # replace a republished file's scrape
  python load_data.py --full          # start from the files only
  python load_data.py --minimize      # drop unused columns from the snapshots
  python load_data.py --check         # fail if a file has unused columns

DATABASE_URL is read from the environment or data/db/.env.
"""

import argparse
import ast
import csv
import gzip
import io
import os
import re
import urllib.request
from pathlib import Path

import pandas as pd
import psycopg

HERE = Path(__file__).resolve().parent
# SNAPSHOTS_DIR lets the CI run the pipeline on synthetic files
DATA_DIR = Path(os.environ.get("SNAPSHOTS_DIR") or HERE.parent / "snapshots")

# Where the candidate data is built before it is published
BUILD_SCHEMA = "build"
# Tables this step loads, in foreign key order (listings first)
RAW_TABLES = ("airbnb_vaud", "airbnb_snapshots", "airbnb_amenities")

INSIDE_AIRBNB_PAGE = "https://insideairbnb.com/get-the-data/"
SNAPSHOT_URL = "https://data.insideairbnb.com/switzerland/vd/vaud/{date}/data/listings.csv.gz"

LISTING_COLS = [
    "id", "listing_url", "name", "picture_url", "host_is_superhost", "neighbourhood_cleansed",
    "neighbourhood_group_cleansed", "latitude", "longitude", "room_type",
    "accommodates",
]

REVIEW_COLS = [
    "review_scores_rating", "review_scores_accuracy",
    "review_scores_cleanliness", "review_scores_checkin",
    "review_scores_communication", "review_scores_location",
    "review_scores_value",
]

SNAPSHOT_COLS = [
    "listing_id", "scrape_id", "last_scraped", "price", "minimum_nights",
    "number_of_reviews", "number_of_reviews_ltm", *REVIEW_COLS,
    "reviews_per_month",
]

# Amenity category id (see seed.sql) -> regex matched on the lowercased
# amenity label. Word boundaries matter: a plain substring test on "ac"
# used to tag "dedicated workspace" or "backyard" as air conditioning.
AMENITY_PATTERNS = {
    1: r"\bwi-?fi\b",
    2: r"\b(kitchen|kitchenette|oven|microwave|stove|dishwasher|refrigerator|coffee maker)\b",
    3: r"\b(heating|radiator)\b",
    4: r"\b(air conditioning|ac|cooling)\b",
    5: r"\b(parking|garage|driveway)\b",
    6: r"\b(washer|laundry)\b",
    7: r"(?<!hair )\bdryer\b",
    8: r"\b(workspace|desk)\b",
    9: r"\bentrance\b",
    10: r"\b(hot tub|jacuzzi)\b",
}
AMENITY_REGEXES = {k: re.compile(p) for k, p in AMENITY_PATTERNS.items()}


def read_database_url():
    url = os.environ.get("DATABASE_URL")
    env_file = HERE / ".env"
    if not url and env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            key, _, value = line.partition("=")
            if key.strip() == "DATABASE_URL":
                url = value.strip().strip('"').strip("'")
    if not url:
        raise SystemExit("DATABASE_URL is not set (env var or data/db/.env)")
    return url


def to_number(series):
    """'$1,234.00' -> 1234.0, anything unparsable -> NaN."""
    cleaned = series.astype("string").str.replace(r"[^\d.\-]", "", regex=True)
    return pd.to_numeric(cleaned, errors="coerce")


# A Vaud snapshot is about 3 MB: anything far bigger is not what we expect
MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024


def http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "SmartBnB data loader"})
    with urllib.request.urlopen(req, timeout=120) as res:
        body = res.read(MAX_DOWNLOAD_BYTES + 1)
    if len(body) > MAX_DOWNLOAD_BYTES:
        raise SystemExit(f"Download larger than {MAX_DOWNLOAD_BYTES} bytes, stopped: {url}")
    return body


# The only columns kept in the snapshot files: the ones this loader reads.
# It is an allow list rather than a list of columns to remove, so host names,
# host descriptions, free text written by hosts (which often names them) and
# any column Inside Airbnb adds later are never stored (data minimisation,
# GDPR / Swiss nLPD).
PUBLISHED_COLS = frozenset(
    [*LISTING_COLS, *(c for c in SNAPSHOT_COLS if c != "listing_id"), "amenities"]
)


def minimize_csv(csv_bytes):
    """Returns the CSV with only PUBLISHED_COLS, in their original order and
    with their values untouched."""
    rows = csv.reader(io.StringIO(csv_bytes.decode("utf-8"), newline=""))
    header = next(rows)
    keep = [i for i, name in enumerate(header) if name in PUBLISHED_COLS]
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(header[i] for i in keep)
    for row in rows:
        writer.writerow(row[i] if i < len(row) else "" for i in keep)
    return out.getvalue().encode("utf-8")


def snapshot_files():
    files = sorted(DATA_DIR.glob("*.csv.gz"))
    if not files:
        raise SystemExit(f"No snapshot found in {DATA_DIR} (clone SmartBnB-data there)")
    return files


def extra_columns(path):
    """Columns of a snapshot file that are not in PUBLISHED_COLS."""
    with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
        header = next(csv.reader(f))
    return [c for c in header if c not in PUBLISHED_COLS]


def write_snapshot(dest, csv_bytes):
    """Writes a minimized snapshot, under a temporary name first so a failure
    never leaves a broken file that later loads would pick up."""
    tmp = dest.with_name(dest.name + ".part")
    tmp.write_bytes(gzip.compress(minimize_csv(csv_bytes), mtime=0))
    tmp.replace(dest)


def minimize_files():
    for path in snapshot_files():
        if not extra_columns(path):
            print(f"  {path.name}: already minimized")
            continue
        write_snapshot(path, gzip.decompress(path.read_bytes()))
        print(f"  {path.name}: minimized")


def check_files():
    bad = {p.name: extra_columns(p) for p in snapshot_files()}
    bad = {name: cols for name, cols in bad.items() if cols}
    for name, cols in bad.items():
        print(f"  {name}: {len(cols)} unpublished columns, e.g. {', '.join(cols[:5])}")
    if bad:
        raise SystemExit("Run python data/db/load_data.py --minimize and commit the files")
    print("  every snapshot holds only published columns")


def snapshot_date(value):
    """argparse type: only YYYY-MM-DD, since the date goes into a path and a URL."""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise argparse.ArgumentTypeError(f"not a YYYY-MM-DD date: {value!r}")
    return value


def latest_snapshot_date():
    """Date of the newest Vaud snapshot listed on InsideAirbnb."""
    html = http_get(INSIDE_AIRBNB_PAGE).decode("utf-8", "replace")
    dates = re.findall(r"switzerland/vd/vaud/(\d{4}-\d{2}-\d{2})/data/listings\.csv\.gz", html)
    if not dates:
        raise SystemExit("Could not find the Vaud snapshot on InsideAirbnb")
    return max(dates)


def fetch_snapshots(dates):
    for date in dates:
        dest = DATA_DIR / f"{date}.csv.gz"
        if dest.exists():
            print(f"  {date}: already on disk")
            continue
        body = http_get(SNAPSHOT_URL.format(date=date))
        # Check the archive is complete before it lands in data/
        try:
            raw = gzip.decompress(body)
        except (OSError, EOFError) as e:
            raise SystemExit(f"  {date}: download is not a valid gzip file ({e})")
        if not raw.startswith(b"id,"):
            raise SystemExit(f"  {date}: download is not an InsideAirbnb listings CSV")
        write_snapshot(dest, raw)
        print(f"  {date}: downloaded")


def scrape_ids(dates):
    """Scrape ids found in the snapshot files of these dates."""
    ids = set()
    for date in dates:
        path = DATA_DIR / f"{date}.csv.gz"
        if not path.exists():
            raise SystemExit(f"  {date}: no file {path.name} to reload")
        col = pd.read_csv(path, usecols=["scrape_id"])["scrape_id"]
        ids |= set(pd.to_numeric(col, errors="coerce").dropna().astype(int))
    return ids


def read_csvs():
    frames = []
    for f in snapshot_files():
        df = pd.read_csv(f, usecols=lambda c: c in PUBLISHED_COLS, low_memory=False)
        print(f"  {f.name}: {len(df)} rows")
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    df["last_scraped"] = pd.to_datetime(df["last_scraped"], errors="coerce")
    return df.sort_values(["id", "last_scraped"])


def build_listings(df):
    latest = df.drop_duplicates("id", keep="last")[[*LISTING_COLS, "last_scraped"]].copy()
    latest["host_is_superhost"] = latest["host_is_superhost"].map({"t": True, "f": False})
    for col in ("latitude", "longitude"):
        latest[col] = to_number(latest[col])
    latest["accommodates"] = pd.to_numeric(latest["accommodates"], errors="coerce").astype("Int64")
    latest["last_scraped"] = latest["last_scraped"].dt.date
    return latest


def build_snapshots(df):
    """Typed snapshot rows. Prices stay as scraped: which ones are plausible
    is decided by the stg_snapshots dbt model."""
    snap = df.rename(columns={"id": "listing_id"})[SNAPSHOT_COLS].copy()
    for col in ("price", "reviews_per_month", *REVIEW_COLS):
        snap[col] = to_number(snap[col])
    for col in ("scrape_id", "minimum_nights", "number_of_reviews", "number_of_reviews_ltm"):
        snap[col] = pd.to_numeric(snap[col], errors="coerce").astype("Int64")
    snap["last_scraped"] = snap["last_scraped"].dt.date
    return snap.drop_duplicates(["listing_id", "scrape_id"], keep="last")


def parse_amenities(raw):
    if not isinstance(raw, str) or not raw.strip():
        return []
    try:
        return ast.literal_eval(raw.replace('""', '"'))
    except (ValueError, SyntaxError):
        return []


def amenity_category(label):
    label = label.lower()
    for category, regex in AMENITY_REGEXES.items():
        if regex.search(label):
            return category
    return None


def build_amenities(df):
    latest = df.drop_duplicates("id", keep="last")[["id", "amenities"]]
    pairs = set()
    for listing_id, raw in latest.itertuples(index=False):
        for label in parse_amenities(raw):
            category = amenity_category(str(label))
            if category:
                pairs.add((int(listing_id), category))
    return sorted(pairs)


def clean_rows(df):
    """DataFrame -> list of tuples with NaN/NA converted to None."""
    df = df.astype(object).where(df.notna(), None)
    return list(df.itertuples(index=False, name=None))


def copy_rows(cur, table, columns, rows):
    with cur.copy(f"COPY {table} ({', '.join(columns)}) FROM STDIN") as copy:
        for row in rows:
            copy.write_row(row)


STAGE_SQL = f"""
CREATE TEMP TABLE stage_listings ON COMMIT DROP AS
  SELECT *, NULL::date AS last_scraped FROM {BUILD_SCHEMA}.airbnb_vaud WITH NO DATA;

CREATE TEMP TABLE stage_snapshots ON COMMIT DROP AS
  SELECT * FROM {BUILD_SCHEMA}.airbnb_snapshots WITH NO DATA;

CREATE TEMP TABLE stage_amenities ON COMMIT DROP AS
  SELECT * FROM {BUILD_SCHEMA}.airbnb_amenities WITH NO DATA
"""

_cols = ", ".join(LISTING_COLS)
_updates = ",\n  ".join(f"{c} = EXCLUDED.{c}" for c in LISTING_COLS if c != "id")

# Runs once the new rows are copied into the stage_* temp tables.
MERGE_SQL = f"""
-- Listings first, as their snapshots refer to them.
INSERT INTO {BUILD_SCHEMA}.airbnb_vaud ({_cols})
SELECT {_cols} FROM stage_listings
ON CONFLICT (id) DO NOTHING;

INSERT INTO {BUILD_SCHEMA}.airbnb_snapshots ({", ".join(SNAPSHOT_COLS)})
SELECT {", ".join(SNAPSHOT_COLS)} FROM stage_snapshots
ON CONFLICT (listing_id, scrape_id) DO NOTHING;

-- Listings whose most recent scrape is one of the new ones.
CREATE TEMP TABLE fresh ON COMMIT DROP AS
SELECT st.id
FROM stage_listings st
WHERE st.last_scraped = (
  SELECT MAX(s.last_scraped) FROM {BUILD_SCHEMA}.airbnb_snapshots s WHERE s.listing_id = st.id
);

INSERT INTO {BUILD_SCHEMA}.airbnb_vaud ({_cols})
SELECT {", ".join("st." + c for c in LISTING_COLS)}
FROM stage_listings st JOIN fresh f ON f.id = st.id
ON CONFLICT (id) DO UPDATE SET
  {_updates};

DELETE FROM {BUILD_SCHEMA}.airbnb_amenities WHERE airbnb_id IN (SELECT id FROM fresh);

INSERT INTO {BUILD_SCHEMA}.airbnb_amenities (airbnb_id, amenity_id)
SELECT sa.airbnb_id, sa.amenity_id
FROM stage_amenities sa JOIN fresh f ON f.id = sa.airbnb_id
"""


def prepare_build(cur, full):
    """Starts the candidate raw tables in the build schema: a copy of the
    published tables, or empty ones for a full reload. They have the columns,
    keys and indexes of the public tables, so publishing them is a plain copy."""
    cur.execute("SELECT 1 FROM pg_namespace WHERE nspname = %s", (BUILD_SCHEMA,))
    if cur.fetchone() is None:
        # The loader role cannot create schemas: the migration creates this one
        cur.execute(f"CREATE SCHEMA {BUILD_SCHEMA}")
    for table in RAW_TABLES:
        # CASCADE also drops the dbt staging views on it; the next dbt build recreates them
        cur.execute(f"DROP TABLE IF EXISTS {BUILD_SCHEMA}.{table} CASCADE")
        cur.execute(f"""CREATE TABLE {BUILD_SCHEMA}.{table}
                        (LIKE public.{table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)""")
        if not full:
            cur.execute(f"INSERT INTO {BUILD_SCHEMA}.{table} SELECT * FROM public.{table}")


def load(cur, full=False, reload=()):
    """Fills the build schema with the published raw data plus the new scrapes
    found on disk, in the current transaction. Returns the number of new scrapes."""
    prepare_build(cur, full)
    cur.execute(f"SELECT DISTINCT scrape_id FROM {BUILD_SCHEMA}.airbnb_snapshots")
    known = {row[0] for row in cur.fetchall()}
    if reload:
        # Republished files keep their scrape id: forget those scrapes so
        # they are loaded again from the new files
        reloaded = scrape_ids(reload)
        cur.execute(f"DELETE FROM {BUILD_SCHEMA}.airbnb_snapshots WHERE scrape_id = ANY(%s)",
                    (sorted(reloaded),))
        print(f"Reloading {len(reloaded)} scrape(s): {cur.rowcount} old rows removed")
        known -= reloaded

    print("Reading snapshots...")
    df = read_csvs()
    df = df[~pd.to_numeric(df["scrape_id"], errors="coerce").isin(known)]
    new_scrapes = int(df["scrape_id"].nunique())
    if df.empty:
        print("No new scrape")
    else:
        print(f"Adding {new_scrapes} new scrape(s), "
              f"{df['last_scraped'].min():%Y-%m-%d} to {df['last_scraped'].max():%Y-%m-%d}")
        cur.execute(STAGE_SQL)
        copy_rows(cur, "stage_listings", [*LISTING_COLS, "last_scraped"], clean_rows(build_listings(df)))
        copy_rows(cur, "stage_snapshots", SNAPSHOT_COLS, clean_rows(build_snapshots(df)))
        copy_rows(cur, "stage_amenities", ["airbnb_id", "amenity_id"], build_amenities(df))
        cur.execute(MERGE_SQL)

    for table in RAW_TABLES:
        cur.execute(f"SELECT COUNT(*) FROM {BUILD_SCHEMA}.{table}")
        print(f"  {BUILD_SCHEMA}.{table}: {cur.fetchone()[0]} rows")
    return new_scrapes


def fetch(dates, latest=False):
    """Downloads the snapshots of these dates, and the newest one if latest."""
    dates = list(dates)
    if latest:
        dates.append(latest_snapshot_date())
    if dates:
        print("Fetching snapshots...")
        fetch_snapshots(dates)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--fetch", action="store_true", help="download the latest InsideAirbnb snapshot first")
    parser.add_argument("--dates", nargs="+", default=[], type=snapshot_date, metavar="YYYY-MM-DD", help="download these snapshots first")
    parser.add_argument("--reload", nargs="+", default=[], type=snapshot_date, metavar="YYYY-MM-DD", help="replace the scrapes of these files, e.g. after Inside Airbnb republished them")
    parser.add_argument("--full", action="store_true", help="start from the files only, not from the published tables")
    parser.add_argument("--minimize", action="store_true", help="drop the unpublished columns from the snapshot files, then stop")
    parser.add_argument("--check", action="store_true", help="fail if a snapshot file has unpublished columns (no database needed)")
    args = parser.parse_args()

    if args.minimize:
        print("Minimizing snapshots...")
        minimize_files()
        return
    if args.check:
        print("Checking snapshots...")
        check_files()
        return

    fetch(args.dates, args.fetch)
    with psycopg.connect(read_database_url(), prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            load(cur, full=args.full, reload=args.reload)
    print(f"Loaded into the {BUILD_SCHEMA} schema. Run pipeline.py to transform, audit and publish.")


if __name__ == "__main__":
    main()
