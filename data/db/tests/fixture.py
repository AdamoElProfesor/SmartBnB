"""Synthetic Inside Airbnb snapshots, to run the whole pipeline without the
real files (they live in the private SmartBnB-data repository and must never
reach this public one). Deterministic: the same call writes the same files.

Four monthly scrapes, dated from today so the freshness checks pass, with
the traps of the real data: a scrape whose prices are all broken (below
1 CHF), isolated prices below 5 CHF or above 5000 CHF, listings that join
later and listings that leave before the latest scrape.

  python tests/fixture.py <directory>
"""

import csv
import io
import random
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from load_data import write_snapshot  # noqa: E402

# Municipality, district, centre
PLACES = [
    ("Lausanne", "Lausanne", 46.52, 6.63),
    ("Montreux", "Riviera-Pays-d'Enhaut", 46.43, 6.91),
    ("Vevey", "Riviera-Pays-d'Enhaut", 46.46, 6.84),
    ("Nyon", "Nyon", 46.38, 6.24),
    ("Morges", "Morges", 46.51, 6.50),
    ("Yverdon-les-Bains", "Jura-Nord vaudois", 46.78, 6.64),
]
ROOM_TYPES = [("Entire home/apt", 70), ("Private room", 26), ("Shared room", 2), ("Hotel room", 2)]
AMENITIES = ["Wifi", "Kitchen", "Heating", "Air conditioning", "Free parking on premises", "Washer",
             "Dryer", "Dedicated workspace", "Private entrance", "Hot tub", "Hair dryer", "TV"]
REVIEW_COLS = ["review_scores_rating", "review_scores_accuracy", "review_scores_cleanliness",
               "review_scores_checkin", "review_scores_communication", "review_scores_location",
               "review_scores_value"]
HEADER = ["id", "listing_url", "scrape_id", "last_scraped", "name", "picture_url", "host_is_superhost",
          "neighbourhood_cleansed", "neighbourhood_group_cleansed", "latitude", "longitude", "room_type",
          "accommodates", "amenities", "price", "minimum_nights", "number_of_reviews",
          "number_of_reviews_ltm", *REVIEW_COLS, "reviews_per_month"]

# Days before today of each scrape; the third one has a broken price column
SCRAPE_DAYS = [330, 150, 35, 5]
BROKEN_SCRAPE = 35
LISTINGS = 2600


def listing(listing_id):
    """Static attributes of a listing, the same in every scrape."""
    rng = random.Random(listing_id)
    town, district, lat, lng = rng.choice(PLACES)
    room_type = rng.choices([r for r, _ in ROOM_TYPES], [w for _, w in ROOM_TYPES])[0]
    return {
        "id": listing_id,
        "listing_url": f"https://www.airbnb.com/rooms/{listing_id}",
        "name": f"Test stay {listing_id} in {town}",
        "picture_url": "",
        "host_is_superhost": "t" if rng.random() < 0.3 else "f",
        "neighbourhood_cleansed": town,
        "neighbourhood_group_cleansed": district,
        "latitude": round(lat + rng.uniform(-0.02, 0.02), 5),
        "longitude": round(lng + rng.uniform(-0.02, 0.02), 5),
        "room_type": room_type,
        "accommodates": rng.randint(1, 8),
        "amenities": str(rng.sample(AMENITIES, rng.randint(2, 9))).replace("'", '"'),
        "base_price": rng.lognormvariate(5.0, 0.4),
        "minimum_nights": rng.choice([1, 1, 2, 2, 3, 30]),
    }


def price(listing_id, base, days_ago):
    rng = random.Random(listing_id * 1000 + days_ago)
    if days_ago == BROKEN_SCRAPE:
        return f"${rng.uniform(0.1, 0.9):.2f}"
    if listing_id % 97 == 0:
        return "$2.00"  # parsing error, dropped by stg_snapshots
    if listing_id % 211 == 0:
        return "$9,000.00"  # out of range, left out of current_prices
    return f"${base * (1 + (330 - days_ago) / 1500) * rng.uniform(0.95, 1.05):,.2f}"


def in_scrape(listing_id, days_ago):
    if listing_id > 2400 and days_ago > 150:
        return False  # joined later
    if listing_id <= 150 and days_ago == 5:
        return False  # left before the latest scrape
    return True


def snapshot(days_ago, today):
    day = today - timedelta(days=days_ago)
    scrape_id = int(day.strftime("%Y%m%d")) * 1_000_000 + 1
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(HEADER)
    for listing_id in range(1, LISTINGS + 1):
        if not in_scrape(listing_id, days_ago):
            continue
        row = listing(listing_id)
        rng = random.Random(listing_id * 7 + days_ago)
        reviews = rng.randint(0, 300)
        scores = {c: (round(rng.uniform(4.0, 5.0), 2) if reviews else "") for c in REVIEW_COLS}
        row.update(
            scrape_id=scrape_id,
            last_scraped=day.isoformat(),
            price=price(listing_id, row["base_price"], days_ago),
            number_of_reviews=reviews,
            number_of_reviews_ltm=min(reviews, rng.randint(0, 60)),
            reviews_per_month=round(rng.uniform(0.1, 4.0), 2) if reviews else "",
            **scores,
        )
        writer.writerow(row[c] for c in HEADER)
    return day, out.getvalue().encode("utf-8")


def write_fixture(directory, today=None):
    """Writes the synthetic snapshots into directory; returns their paths."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    paths = []
    for days_ago in SCRAPE_DAYS:
        day, body = snapshot(days_ago, today or date.today())
        path = directory / f"{day.isoformat()}.csv.gz"
        write_snapshot(path, body)
        paths.append(path)
    return paths


if __name__ == "__main__":
    for p in write_fixture(sys.argv[1]):
        print(p)
