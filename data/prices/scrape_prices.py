"""Collect current nightly prices of the Vaud listings from Airbnb.

Inside Airbnb's Swiss snapshots have no usable prices since June 2026, so this
script asks Airbnb for prices directly, in two passes, and stores one row per
listing in public.price_observations (the raw layer). load_data.py then turns
the newest observations into current_prices and the neighbourhood medians.

Price metric, the same for both passes and close to Inside Airbnb's own:
    nightly_price = (total - taxes) / nights
Swiss listings show cleaning and service fees inside the nightly rate, so the
total already includes them, and discounts (weekly, early booking) too.
Taxes are left out because they depend on the municipality, not the host.

Pass 1, search: the canton is cut into tiles and each tile is searched for
one reference stay (2 nights from a Friday about four weeks ahead). A tile
with too many results for one search is split in four. Every listing found
gets a price for the same dates.

Pass 2, listing: active listings the search did not return (longer minimum
stay, already booked that weekend...) are priced one by one, for their next
free stay at least a week ahead, of their minimum length (at least 2 nights).

Only prices are collected: no names, photos, hosts or reviews. Requests are
spaced out, and the run stops after repeated errors. A run is resumable: rows
already stored for the same --run-id are skipped.

Usage:
  python scrape_prices.py                  # full run, run id = today
  python scrape_prices.py --limit 20       # small test run
  python scrape_prices.py --skip-search    # only pass 2
"""

import argparse
import datetime as dt
import json
import random
import re
import sys
import time
from pathlib import Path

import psycopg
import pyairbnb
from pyairbnb import api, search, standardize, utils

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "db"))
from load_data import read_database_url  # noqa: E402

CURRENCY = "CHF"
ADULTS = 1
SEARCH_CAP = 240        # a search returns at most ~270 listings: split before
MIN_TILE_DEGREES = 0.01
TILE_DEGREES = 0.1
MAX_CONSECUTIVE_ERRORS = 5


class TooManyErrors(RuntimeError):
    pass


def reference_stay(today):
    """First Friday at least four weeks ahead, for 2 nights."""
    start = today + dt.timedelta(days=28)
    start += dt.timedelta(days=(4 - start.weekday()) % 7)
    return start, start + dt.timedelta(days=2)


def amount(text):
    """'Fr. 1’250.50' -> 1250.5, '-Fr. 63.00' -> -63.0"""
    if isinstance(text, (int, float)):
        return float(text)
    cleaned = re.sub(r"[’'\s ,]", "", str(text))
    match = re.search(r"-?\d+(?:\.\d+)?", cleaned)
    if not match:
        return None
    value = float(match.group())
    return -abs(value) if "-" in str(text) else value


def price_from_lines(lines, nights):
    """lines: [(label, amount)] from Airbnb's price breakdown."""
    lines = [(label, a) for label, a in lines if a is not None]
    totals = [a for label, a in lines if "total" in label.lower()]  # "Total", "Monthly total"
    items = [(label, a) for label, a in lines if "total" not in label.lower()]
    if not items or not nights:
        return None
    # Monthly stays show "Average monthly price" instead of "N nights x ..."
    nights_amount = sum(a for label, a in items if " x " in label or "monthly price" in label.lower())
    taxes = sum(a for label, a in items if "tax" in label.lower())
    # Some search results have no total line: it is then the sum of the items
    total = totals[-1] if totals else sum(a for _, a in items)
    return {
        "nights_amount": round(nights_amount, 2),
        "taxes": round(taxes, 2),
        "total": round(total, 2),
        "nightly_price": round((total - taxes) / nights, 2),
    }


# ---------------------------------------------------------------- storage

INSERT_SQL = """
INSERT INTO public.price_observations
  (run_id, listing_id, method, status, check_in, nights, adults,
   nights_amount, taxes, total, currency, nightly_price, breakdown)
VALUES (%(run_id)s, %(listing_id)s, %(method)s, %(status)s, %(check_in)s,
        %(nights)s, %(adults)s, %(nights_amount)s, %(taxes)s, %(total)s,
        %(currency)s, %(nightly_price)s, %(breakdown)s)
ON CONFLICT (run_id, listing_id) DO NOTHING
"""


def store(cur, run_id, listing_id, method, status, check_in=None, nights=None,
          price=None, lines=None):
    price = price or {}
    cur.execute(INSERT_SQL, {
        "run_id": run_id, "listing_id": int(listing_id), "method": method,
        "status": status, "check_in": check_in, "nights": nights, "adults": ADULTS,
        "nights_amount": price.get("nights_amount"), "taxes": price.get("taxes"),
        "total": price.get("total"), "currency": CURRENCY,
        "nightly_price": price.get("nightly_price"),
        "breakdown": json.dumps(lines, ensure_ascii=False) if lines else None,
    })


# ---------------------------------------------------------------- pass 1

def search_tile(key, tile, check_in, check_out, pause):
    """All results of one bounding box, following pagination."""
    sw_lat, sw_lng, ne_lat, ne_lng = tile
    results, cursor = [], ""
    while True:
        raw = search.get(key, cursor, check_in.isoformat(), check_out.isoformat(),
                         ne_lat, ne_lng, sw_lat, sw_lng, 13, CURRENCY, "", 0, 0, [],
                         False, ADULTS, 0, 0, 0, 0, 0, "en", "", "")
        page = standardize.from_search(raw)
        results.extend(page)
        info = utils.get_nested_value(raw, "data.presentation.staysSearch.results.paginationInfo", {})
        cursor = (info or {}).get("nextPageCursor")
        time.sleep(pause + random.random())
        if not page or not cursor:
            return results


def split(tile):
    sw_lat, sw_lng, ne_lat, ne_lng = tile
    mid_lat, mid_lng = (sw_lat + ne_lat) / 2, (sw_lng + ne_lng) / 2
    return [(sw_lat, sw_lng, mid_lat, mid_lng), (sw_lat, mid_lng, mid_lat, ne_lng),
            (mid_lat, sw_lng, ne_lat, mid_lng), (mid_lat, mid_lng, ne_lat, ne_lng)]


def grid(bounds):
    sw_lat, sw_lng, ne_lat, ne_lng = bounds
    tiles, lat = [], sw_lat
    while lat < ne_lat:
        lng = sw_lng
        while lng < ne_lng:
            tiles.append((lat, lng, min(lat + TILE_DEGREES, ne_lat), min(lng + TILE_DEGREES, ne_lng)))
            lng += TILE_DEGREES
        lat += TILE_DEGREES
    return tiles


def search_pass(conn, key, run_id, bounds, check_in, check_out, pause, limit):
    nights = (check_out - check_in).days
    queue, found, searches, errors = grid(bounds), 0, 0, 0
    print(f"Pass 1: {len(queue)} tiles, stay {check_in} to {check_out}")
    while queue:
        tile = queue.pop(0)
        try:
            results = search_tile(key, tile, check_in, check_out, pause)
            errors = 0
        except Exception as e:  # network errors, blocks, API changes
            errors += 1
            print(f"  tile {tile}: {type(e).__name__}: {str(e)[:120]}")
            if errors >= MAX_CONSECUTIVE_ERRORS:
                raise TooManyErrors("search keeps failing, stopping (blocked or API changed?)")
            time.sleep(pause * 5)
            queue.append(tile)
            continue
        searches += 1
        if len(results) >= SEARCH_CAP and tile[2] - tile[0] > MIN_TILE_DEGREES:
            queue[:0] = split(tile)
            continue
        with conn.cursor() as cur:
            for r in results:
                lines = [(b.get("description", ""), amount(b.get("amount")))
                         for b in (r.get("price") or {}).get("break_down") or []]
                price = price_from_lines(lines, nights)
                store(cur, run_id, r["room_id"], "search", "ok" if price else "error",
                      check_in, nights, price, lines)
                found += 1
        conn.commit()
        if limit and found >= limit:
            break
    print(f"  {searches} searches, {found} listings priced")


# ---------------------------------------------------------------- pass 2

def next_stay(calendar, today, lead_days=7):
    days = [d for month in calendar for d in month.get("days", [])]
    by_date = {d["calendarDate"]: d for d in days}
    for d in days:
        start = dt.date.fromisoformat(d["calendarDate"])
        if start < today + dt.timedelta(days=lead_days) or not d.get("availableForCheckin"):
            continue
        nights = max(2, d.get("minNights") or 1)
        if all(by_date.get((start + dt.timedelta(days=i)).isoformat(), {}).get("available")
               for i in range(nights)):
            return start, nights
    return None


def listing_pass(conn, key, run_id, pause, limit):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT s.listing_id
            FROM public.airbnb_snapshots s
            WHERE s.scrape_id = (SELECT MAX(scrape_id) FROM public.airbnb_snapshots)
              AND NOT EXISTS (SELECT 1 FROM public.price_observations o
                              WHERE o.run_id = %s AND o.listing_id = s.listing_id)
            ORDER BY s.listing_id
        """, (run_id,))
        todo = [row[0] for row in cur.fetchall()]
    if limit:
        todo = todo[:limit]
    print(f"Pass 2: {len(todo)} active listings not found by the search")
    today, errors, priced = dt.date.today(), 0, 0
    for i, listing_id in enumerate(todo, 1):
        try:
            calendar = pyairbnb.get_calendar(api_key=key, room_id=str(listing_id), proxy_url="")
            stay = next_stay(calendar, today)
            with conn.cursor() as cur:
                if not stay:
                    store(cur, run_id, listing_id, "listing", "unavailable")
                else:
                    time.sleep(pause + random.random())
                    check_in, nights = stay
                    res = pyairbnb.get_price(str(listing_id), check_in, check_in + dt.timedelta(days=nights),
                                             adults=ADULTS, currency=CURRENCY, api_key=key,
                                             cookies=[], proxy_url=None)
                    details = ((res or {}).get("main") or {}).get("details") or {}
                    lines = [(label, amount(value)) for label, value in details.items()]
                    price = price_from_lines(lines, nights)
                    store(cur, run_id, listing_id, "listing", "ok" if price else "error",
                          check_in, nights, price, lines)
                    priced += bool(price)
            errors = 0
        except Exception as e:
            message = f"{type(e).__name__}: {str(e)[:120]}"
            # Airbnb refuses some date ranges (e.g. check-out rules): not a block
            if "check-out" in message or "Unavailable" in message:
                with conn.cursor() as cur:
                    store(cur, run_id, listing_id, "listing", "unavailable")
            else:
                errors += 1
                print(f"  {listing_id}: {message}")
                if errors >= MAX_CONSECUTIVE_ERRORS:
                    conn.commit()
                    raise TooManyErrors("listing requests keep failing, stopping")
        if i % 20 == 0:
            conn.commit()
            print(f"  {i}/{len(todo)} done, {priced} priced")
        time.sleep(pause + random.random())
    conn.commit()
    print(f"  {priced} of {len(todo)} priced")


# ---------------------------------------------------------------- main

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run-id", default=dt.date.today().isoformat(),
                        help="rows of the same run are not collected twice (default: today)")
    parser.add_argument("--pause", type=float, default=2.0, help="seconds between requests (default 2)")
    parser.add_argument("--limit", type=int, default=0, help="stop each pass after this many listings")
    parser.add_argument("--skip-search", action="store_true", help="skip pass 1")
    parser.add_argument("--skip-listings", action="store_true", help="skip pass 2")
    parser.add_argument("--bounds", type=float, nargs=4, metavar=("SW_LAT", "SW_LNG", "NE_LAT", "NE_LNG"),
                        help="search this box only (default: box around the active listings)")
    args = parser.parse_args()

    check_in, check_out = reference_stay(dt.date.today())
    key = api.get("")
    with psycopg.connect(read_database_url(), prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT MIN(latitude) - 0.02, MIN(longitude) - 0.02,
                       MAX(latitude) + 0.02, MAX(longitude) + 0.02
                FROM public.airbnb_vaud v
                WHERE v.id IN (SELECT listing_id FROM public.airbnb_snapshots
                               WHERE scrape_id = (SELECT MAX(scrape_id) FROM public.airbnb_snapshots))
            """)
            bounds = tuple(args.bounds) if args.bounds else cur.fetchone()
        print(f"Run {args.run_id}, bounds {tuple(round(b, 3) for b in bounds)}")
        try:
            if not args.skip_search:
                search_pass(conn, key, args.run_id, bounds, check_in, check_out, args.pause, args.limit)
            if not args.skip_listings:
                listing_pass(conn, key, args.run_id, args.pause, args.limit)
        except TooManyErrors as e:
            sys.exit(f"Stopped: {e}. Rerun later with the same --run-id to resume.")
        with conn.cursor() as cur:
            cur.execute("""
                SELECT status, method, COUNT(*) FROM public.price_observations
                WHERE run_id = %s GROUP BY 1, 2 ORDER BY 1, 2
            """, (args.run_id,))
            for status, method, count in cur.fetchall():
                print(f"  {method:8} {status:12} {count}")
    print("Done. Run data/db/load_data.py to refresh current_prices and the medians.")


if __name__ == "__main__":
    main()
