"""Data quality audit of a load (the "Audit" of Write-Audit-Publish).

load_data.py writes the new data inside one transaction, then calls
audit(): it measures the tables as the site would see them and checks the
measures against fixed thresholds and against the last published run. An
error rolls the transaction back, so the site keeps the previous data. A
warning lets the data through but is reported. Every run, with its metrics
and check results, is stored in public.etl_runs.

The checks themselves (evaluate) are plain Python on a dict of metrics, so
they are tested without a database (tests/test_quality.py).
"""

from dataclasses import dataclass

# Nightly prices outside this range are not used (load_data.py filters them
# out of current_prices). Below 20 CHF it is a parsing error, e.g. a monthly
# rent spread over the minimum stay, or the broken 2026 Inside Airbnb prices.
MIN_NIGHTLY_PRICE = 20
MAX_NIGHTLY_PRICE = 5000

KNOWN_ROOM_TYPES = ("Entire home/apt", "Private room", "Shared room", "Hotel room")

# Box around canton Vaud, with a margin
VAUD_BOX = {"lat_min": 46.1, "lat_max": 47.1, "lng_min": 6.0, "lng_max": 7.3}

# Metric name -> SQL returning one number, run on the loaded tables.
# "active" = listed in the latest Inside Airbnb scrape.
METRICS_SQL = {
    "active_listings": """
        SELECT COUNT(DISTINCT listing_id) FROM public.airbnb_snapshots
        WHERE scrape_id = (SELECT MAX(scrape_id) FROM public.airbnb_snapshots)""",
    "snapshot_age_days": """
        SELECT CURRENT_DATE - MAX(last_scraped) FROM public.airbnb_snapshots""",
    "priced_listings": "SELECT COUNT(*) FROM public.current_prices",
    "price_age_days": "SELECT CURRENT_DATE - MAX(price_date) FROM public.current_prices",
    "active_price_coverage": """
        SELECT AVG((cp.listing_id IS NOT NULL)::int)::float
        FROM (SELECT DISTINCT listing_id FROM public.airbnb_snapshots
              WHERE scrape_id = (SELECT MAX(scrape_id) FROM public.airbnb_snapshots)) a
        LEFT JOIN public.current_prices cp ON cp.listing_id = a.listing_id""",
    "median_price": """
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price) FROM public.current_prices""",
    "prices_out_of_range": """
        SELECT COUNT(*) FROM public.current_prices
        WHERE price < %(min_price)s OR price > %(max_price)s""",
    "excluded_price_observations": """
        SELECT COUNT(*) FROM public.price_observations
        WHERE status = 'ok' AND (nightly_price < %(min_price)s OR nightly_price > %(max_price)s)""",
    "price_observations_ok": "SELECT COUNT(*) FROM public.price_observations WHERE status = 'ok'",
    "unknown_room_types": """
        SELECT COUNT(*) FROM public.airbnb_vaud v
        WHERE v.room_type IS NOT NULL AND v.room_type <> ALL (%(room_types)s)""",
    "active_missing_coordinates": """
        SELECT COUNT(*) FROM public.airbnb_vaud v
        WHERE (v.latitude IS NULL OR v.longitude IS NULL)
          AND v.id IN (SELECT listing_id FROM public.airbnb_snapshots
                       WHERE scrape_id = (SELECT MAX(scrape_id) FROM public.airbnb_snapshots))""",
    "active_outside_vaud": """
        SELECT COUNT(*) FROM public.airbnb_vaud v
        WHERE NOT (v.latitude BETWEEN %(lat_min)s AND %(lat_max)s
                   AND v.longitude BETWEEN %(lng_min)s AND %(lng_max)s)
          AND v.id IN (SELECT listing_id FROM public.airbnb_snapshots
                       WHERE scrape_id = (SELECT MAX(scrape_id) FROM public.airbnb_snapshots))""",
    "price_stat_groups": "SELECT COUNT(*) FROM public.neighbourhood_room_type_stats",
    "small_group_share": """
        SELECT AVG((COALESCE(n.count_airbnb, 0) < 5)::int)::float
        FROM public.airbnb_vaud v
        LEFT JOIN public.neighbourhood_room_type_stats n
          ON n.neighbourhood = v.neighbourhood_cleansed AND n.room_type = v.room_type
        WHERE v.id IN (SELECT listing_id FROM public.airbnb_snapshots
                       WHERE scrape_id = (SELECT MAX(scrape_id) FROM public.airbnb_snapshots))""",
    "review_stat_neighbourhoods": "SELECT COUNT(*) FROM public.neighbourhood_stats",
    "amenity_scores": "SELECT COUNT(*) FROM public.airbnb_points",
}


@dataclass
class Result:
    name: str
    severity: str   # "error" blocks the publication, "warning" is reported
    passed: bool
    detail: str

    def as_dict(self):
        return {"name": self.name, "severity": self.severity, "passed": self.passed, "detail": self.detail}


def measure(cur):
    """Runs METRICS_SQL on the current transaction, returns {name: number}."""
    params = {"min_price": MIN_NIGHTLY_PRICE, "max_price": MAX_NIGHTLY_PRICE,
              "room_types": list(KNOWN_ROOM_TYPES), **VAUD_BOX}
    metrics = {}
    for name, sql in METRICS_SQL.items():
        cur.execute(sql, params)
        value = cur.fetchone()[0]
        metrics[name] = float(value) if value is not None else None
    return metrics


def _change(current, previous):
    """Relative change, None when it cannot be computed."""
    if current is None or not previous:
        return None
    return (current - previous) / previous


def evaluate(m, previous=None):
    """Checks a dict of metrics, optionally against the last published run's.

    Returns a list of Result. Thresholds are set from the real data (Sept.
    2026: about 5,300 active listings, 4,600 prices, median 150 CHF) with
    a wide margin, so they catch broken loads, not normal monthly moves.
    """
    results = []

    def check(name, severity, passed, detail):
        results.append(Result(name, severity, bool(passed), detail))

    def ratio(name):
        v = m.get(name)
        return f"{v:.0%}" if v is not None else "n/a"

    # Volume: an Inside Airbnb scrape of Vaud has about 5,000 listings
    active = m.get("active_listings") or 0
    check("active_listings", "error", active >= 2000,
          f"{active:.0f} listings in the latest scrape (min 2000)")
    priced = m.get("priced_listings") or 0
    check("priced_listings", "error", priced >= 1000,
          f"{priced:.0f} listings with a current price (min 1000)")

    # Validity: values the score relies on must be plausible
    coverage = m.get("active_price_coverage") or 0
    check("active_price_coverage", "error", coverage >= 0.4,
          f"{ratio('active_price_coverage')} of active listings have a price (min 40%)")
    median = m.get("median_price")
    check("median_price", "error", median is not None and 60 <= median <= 400,
          f"median nightly price {median or 0:.0f} CHF (expected 60 to 400)")
    check("prices_out_of_range", "error", (m.get("prices_out_of_range") or 0) == 0,
          f"{m.get('prices_out_of_range') or 0:.0f} current prices outside "
          f"{MIN_NIGHTLY_PRICE}-{MAX_NIGHTLY_PRICE} CHF")
    ok_obs = m.get("price_observations_ok") or 0
    excluded = m.get("excluded_price_observations") or 0
    check("excluded_price_observations", "warning", ok_obs == 0 or excluded / ok_obs <= 0.02,
          f"{excluded:.0f} of {ok_obs:.0f} collected prices dropped as implausible (max 2%)")

    # Schema drift and consistency
    check("unknown_room_types", "error", (m.get("unknown_room_types") or 0) == 0,
          f"{m.get('unknown_room_types') or 0:.0f} listings with a room type outside "
          f"{', '.join(KNOWN_ROOM_TYPES)}")
    missing = m.get("active_missing_coordinates") or 0
    check("active_missing_coordinates", "error", active == 0 or missing / active <= 0.01,
          f"{missing:.0f} active listings without coordinates (max 1%)")
    outside = m.get("active_outside_vaud") or 0
    check("active_outside_vaud", "error", active == 0 or outside / active <= 0.01,
          f"{outside:.0f} active listings outside canton Vaud (max 1%)")
    for name in ("price_stat_groups", "review_stat_neighbourhoods", "amenity_scores"):
        check(name, "error", (m.get(name) or 0) > 0, f"{m.get(name) or 0:.0f} rows (min 1)")
    check("small_group_share", "warning", (m.get("small_group_share") or 0) <= 0.25,
          f"{ratio('small_group_share')} of active listings compared with fewer than "
          f"5 similar listings (max 25%)")

    # Freshness: a new Inside Airbnb scrape and a new price run about monthly
    age = m.get("snapshot_age_days")
    check("snapshot_age_days", "warning", age is not None and age <= 45,
          f"newest Inside Airbnb scrape is {age or 0:.0f} days old (max 45)")
    price_age = m.get("price_age_days")
    check("price_age_days", "warning", price_age is not None and price_age <= 45,
          f"newest price is {price_age or 0:.0f} days old (max 45)")

    # Drift against the last published run
    if previous:
        for name in ("active_listings", "priced_listings"):
            change = _change(m.get(name), previous.get(name))
            check(f"{name}_change", "error", change is None or change >= -0.3,
                  f"{name} {_fmt_change(change)} since the last published run (max -30%)")
        change = _change(m.get("median_price"), previous.get("median_price"))
        check("median_price_change", "warning", change is None or abs(change) <= 0.2,
              f"median price {_fmt_change(change)} since the last published run (max ±20%)")

    return results


def _fmt_change(change):
    return "n/a" if change is None else f"{change:+.0%}"


def summary(results):
    """'error' if a blocking check failed, else 'warning' if any failed, else 'success'."""
    failed = [r for r in results if not r.passed]
    if any(r.severity == "error" for r in failed):
        return "error"
    return "warning" if failed else "success"


def report(results):
    """Lines for the terminal, failed checks first."""
    icon = {True: "ok  ", False: "FAIL"}
    ordered = sorted(results, key=lambda r: (r.passed, r.severity != "error"))
    return [f"  {icon[r.passed]} [{r.severity}] {r.name}: {r.detail}" for r in ordered]

