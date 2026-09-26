"""Load InsideAirbnb snapshots of Vaud into the SmartBnB database.

Snapshots are read from data/*.csv.gz, all kept in git so the database can be
rebuilt from a clone. Downloaded snapshots are saved there too, to be
committed, with only the columns the loader uses (PUBLISHED_COLS). By default only scrapes that are not in the database yet are
added, so the history is never lost. Then, in the same transaction:
  - listings and amenities are refreshed from each listing's latest scrape
  - amenity points and neighbourhood stats are recomputed

Usage:
  python load_data.py                 # add new scrapes found on disk
  python load_data.py --fetch         # download the latest snapshot first
  python load_data.py --dates 2025-07-04 2025-08-03   # download these first
  python load_data.py --full          # wipe the data tables and reload all
  python load_data.py --init          # recreate schema + seed, then --full
  python load_data.py --minimize      # drop unused columns from data/*.csv.gz
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
DATA_DIR = HERE.parent

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
    "listing_id", "scrape_id", "last_scraped", "price", "number_of_reviews",
    "number_of_reviews_ltm", *REVIEW_COLS, "reviews_per_month",
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


# The only columns kept in data/*.csv.gz, which is public: the ones this
# loader reads. It is an allow list rather than a list of columns to remove,
# so host names, host descriptions, free text written by hosts (which often
# names them) and any column Inside Airbnb adds later never get published
# (data minimisation, GDPR / Swiss nLPD).
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
        raise SystemExit(f"No snapshot found in {DATA_DIR}")
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


# Some InsideAirbnb scrapes ship a broken price column (e.g. every value
# below 1 in mid-2026). A scrape whose median nightly price is below this is
# treated as having no price data.
MIN_PLAUSIBLE_MEDIAN_PRICE = 5


def build_snapshots(df):
    snap = df.rename(columns={"id": "listing_id"})[SNAPSHOT_COLS].copy()
    for col in ("price", "reviews_per_month", *REVIEW_COLS):
        snap[col] = to_number(snap[col])
    medians = snap.groupby("scrape_id")["price"].median()
    for scrape_id, median in medians.items():
        if pd.notna(median) and median < MIN_PLAUSIBLE_MEDIAN_PRICE:
            snap.loc[snap["scrape_id"] == scrape_id, "price"] = float("nan")
            print(f"  warning: scrape {scrape_id} has implausible prices "
                  f"(median {median}), prices ignored")
    # Remaining isolated values below a plausible nightly price are dropped too
    snap.loc[snap["price"] < MIN_PLAUSIBLE_MEDIAN_PRICE, "price"] = float("nan")
    for col in ("scrape_id", "number_of_reviews", "number_of_reviews_ltm"):
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


STAGE_SQL = """
CREATE TEMP TABLE stage_listings ON COMMIT DROP AS
  SELECT *, NULL::date AS last_scraped FROM public.airbnb_vaud WITH NO DATA;

CREATE TEMP TABLE stage_snapshots ON COMMIT DROP AS
  SELECT * FROM public.airbnb_snapshots WITH NO DATA;

CREATE TEMP TABLE stage_amenities ON COMMIT DROP AS
  SELECT * FROM public.airbnb_amenities WITH NO DATA
"""

_cols = ", ".join(LISTING_COLS)
_updates = ",\n  ".join(f"{c} = EXCLUDED.{c}" for c in LISTING_COLS if c != "id")

# Runs once the new rows are copied into the stage_* temp tables.
MERGE_SQL = f"""
-- Listings must exist before their snapshots (foreign key).
INSERT INTO public.airbnb_vaud ({_cols})
SELECT {_cols} FROM stage_listings
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.airbnb_snapshots ({", ".join(SNAPSHOT_COLS)})
SELECT {", ".join(SNAPSHOT_COLS)} FROM stage_snapshots
ON CONFLICT (listing_id, scrape_id) DO NOTHING;

-- Listings whose most recent scrape is one of the new ones.
CREATE TEMP TABLE fresh ON COMMIT DROP AS
SELECT st.id
FROM stage_listings st
WHERE st.last_scraped = (
  SELECT MAX(s.last_scraped) FROM public.airbnb_snapshots s WHERE s.listing_id = st.id
);

INSERT INTO public.airbnb_vaud ({_cols})
SELECT {", ".join("st." + c for c in LISTING_COLS)}
FROM stage_listings st JOIN fresh f ON f.id = st.id
ON CONFLICT (id) DO UPDATE SET
  {_updates};

DELETE FROM public.airbnb_amenities WHERE airbnb_id IN (SELECT id FROM fresh);

INSERT INTO public.airbnb_amenities (airbnb_id, amenity_id)
SELECT sa.airbnb_id, sa.amenity_id
FROM stage_amenities sa JOIN fresh f ON f.id = sa.airbnb_id
"""

DERIVED_SQL = """
TRUNCATE public.airbnb_points, public.current_prices,
         public.neighbourhood_room_type_stats, public.neighbourhood_stats;

-- Latest valid price of each listing, from the Inside Airbnb snapshots or
-- from data/prices/scrape_prices.py (price_observations), whichever is newer,
-- if seen in the 6 months before the newest price.
INSERT INTO public.current_prices (listing_id, price, price_date)
WITH prices AS (
  SELECT listing_id, price, last_scraped AS price_date
  FROM public.airbnb_snapshots
  WHERE price IS NOT NULL
  UNION ALL
  SELECT listing_id, nightly_price::double precision, observed_at::date
  FROM public.price_observations
  WHERE status = 'ok' AND nightly_price >= %(min_price)s
)
SELECT DISTINCT ON (p.listing_id) p.listing_id, p.price, p.price_date
FROM prices p
JOIN public.airbnb_vaud v ON v.id = p.listing_id
WHERE p.price_date >= (SELECT MAX(price_date) FROM prices) - interval '6 months'
ORDER BY p.listing_id, p.price_date DESC;

INSERT INTO public.airbnb_points (airbnb_id, total_points)
SELECT aa.airbnb_id, SUM(ap.point)
FROM public.airbnb_amenities aa
JOIN public.amenity_points ap ON ap.amenity_id = aa.amenity_id
GROUP BY aa.airbnb_id;

-- Price stats of the current market: one price per listing (its latest),
-- among prices seen in the last months before the newest one.
INSERT INTO public.neighbourhood_room_type_stats
  (neighbourhood, room_type, avg_price, median_price, count_airbnb)
SELECT
  v.neighbourhood_cleansed,
  v.room_type,
  AVG(cp.price),
  percentile_cont(0.5) WITHIN GROUP (ORDER BY cp.price),
  COUNT(*)
FROM public.current_prices cp
JOIN public.airbnb_vaud v ON v.id = cp.listing_id
WHERE cp.price_date >= (SELECT MAX(price_date) FROM public.current_prices)
                       - make_interval(months => %(months)s)
  AND v.neighbourhood_cleansed IS NOT NULL
  AND v.room_type IS NOT NULL
GROUP BY 1, 2;

-- Per neighbourhood: mean of each snapshot's average review score, and
-- mean reviews_per_month (the baseline for the score's reviews component).
INSERT INTO public.neighbourhood_stats
  (neighbourhood, avg_reviews, avg_reviews_per_month)
SELECT v.neighbourhood_cleansed, AVG(r.row_avg), AVG(s.reviews_per_month)
FROM public.airbnb_snapshots s
JOIN public.airbnb_vaud v ON v.id = s.listing_id
CROSS JOIN LATERAL (
  SELECT AVG(x) AS row_avg
  FROM unnest(ARRAY[
    s.review_scores_rating, s.review_scores_accuracy,
    s.review_scores_cleanliness, s.review_scores_checkin,
    s.review_scores_communication, s.review_scores_location,
    s.review_scores_value
  ]) AS x
) r
WHERE s.last_scraped >= (SELECT MAX(last_scraped) FROM public.airbnb_snapshots)
                        - make_interval(months => %(months)s)
  AND v.neighbourhood_cleansed IS NOT NULL
GROUP BY 1;
"""


def run_statements(cur, sql, params=None):
    for statement in sql.split(";\n\n"):
        cur.execute(statement, params)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--fetch", action="store_true", help="download the latest InsideAirbnb snapshot first")
    parser.add_argument("--dates", nargs="+", default=[], type=snapshot_date, metavar="YYYY-MM-DD", help="download these snapshots first")
    parser.add_argument("--full", action="store_true", help="wipe the data tables and reload every file on disk")
    parser.add_argument("--init", action="store_true", help="recreate schema + seed (drops all tables), implies --full")
    parser.add_argument("--stats-months", type=int, default=3, help="window for neighbourhood stats (default 3)")
    parser.add_argument("--minimize", action="store_true", help="drop the unpublished columns from data/*.csv.gz, then stop")
    parser.add_argument("--check", action="store_true", help="fail if a file in data/ has unpublished columns (no database needed)")
    args = parser.parse_args()

    if args.minimize:
        print("Minimizing snapshots...")
        minimize_files()
        return
    if args.check:
        print("Checking snapshots...")
        check_files()
        return

    dates = list(args.dates)
    if args.fetch:
        dates.append(latest_snapshot_date())
    if dates:
        print("Fetching snapshots...")
        fetch_snapshots(dates)

    with psycopg.connect(read_database_url(), prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            if args.init:
                cur.execute((HERE / "schema.sql").read_text(encoding="utf-8"))
                cur.execute((HERE / "seed.sql").read_text(encoding="utf-8"))
                print("Schema + seed applied")
            if args.full or args.init:
                cur.execute("""
                    TRUNCATE public.airbnb_vaud, public.airbnb_snapshots,
                             public.airbnb_amenities, public.airbnb_points,
                             public.current_prices,
                             public.neighbourhood_room_type_stats,
                             public.neighbourhood_stats
                """)
                known = set()
            else:
                cur.execute("SELECT DISTINCT scrape_id FROM public.airbnb_snapshots")
                known = {row[0] for row in cur.fetchall()}

            print("Reading snapshots...")
            df = read_csvs()
            df = df[~pd.to_numeric(df["scrape_id"], errors="coerce").isin(known)]
            if df.empty:
                print("No new scrape, refreshing derived tables only")
            else:
                print(f"Adding {df['scrape_id'].nunique()} new scrape(s), "
                      f"{df['last_scraped'].min():%Y-%m-%d} to {df['last_scraped'].max():%Y-%m-%d}")
                run_statements(cur, STAGE_SQL)
                copy_rows(cur, "stage_listings", [*LISTING_COLS, "last_scraped"], clean_rows(build_listings(df)))
                copy_rows(cur, "stage_snapshots", SNAPSHOT_COLS, clean_rows(build_snapshots(df)))
                copy_rows(cur, "stage_amenities", ["airbnb_id", "amenity_id"], build_amenities(df))
                run_statements(cur, MERGE_SQL)

            run_statements(cur, DERIVED_SQL, {"months": args.stats_months,
                                          "min_price": MIN_PLAUSIBLE_MEDIAN_PRICE})

            for table in ("airbnb_vaud", "airbnb_snapshots", "airbnb_amenities", "airbnb_points",
                          "current_prices", "neighbourhood_room_type_stats", "neighbourhood_stats"):
                cur.execute(f"SELECT COUNT(*) FROM public.{table}")
                print(f"  {table}: {cur.fetchone()[0]} rows")

    print("Done.")


if __name__ == "__main__":
    main()
