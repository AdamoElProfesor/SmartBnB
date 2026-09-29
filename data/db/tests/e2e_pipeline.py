"""End-to-end test of the pipeline on a throwaway database (CI).

Runs pipeline.py on synthetic snapshots (tests/fixture.py) and checks that:
  - a first run from an empty database publishes (exit 0);
  - a second run with no new file changes nothing (the load is idempotent);
  - a dry run changes nothing either;
  - the business rules held: no broken or out of range price is current.

DATABASE_URL must point to a database that may be wiped (--init).

  python tests/e2e_pipeline.py
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import psycopg

HERE = Path(__file__).resolve().parent
DB_DIR = HERE.parent
sys.path.insert(0, str(DB_DIR))

from fixture import write_fixture  # noqa: E402
from publish import PUBLISHED_TABLES  # noqa: E402


def pipeline(*args, env):
    print(f"$ pipeline.py {' '.join(args)}", flush=True)
    return subprocess.run([sys.executable, str(DB_DIR / "pipeline.py"), *args], env=env).returncode


def fingerprint(url):
    """md5 of the sorted content of every published table."""
    with psycopg.connect(url) as conn:
        return {
            t: conn.execute(
                f"SELECT count(*), md5(coalesce(string_agg(r::text, '|' ORDER BY r::text), '')) FROM public.{t} r"
            ).fetchone()
            for t in PUBLISHED_TABLES
        }


def main():
    url = os.environ["DATABASE_URL"]
    failures = []

    def expect(ok, what):
        print(f"  {'ok  ' if ok else 'FAIL'} {what}", flush=True)
        if not ok:
            failures.append(what)

    with tempfile.TemporaryDirectory() as snapshots:
        write_fixture(snapshots)
        env = {**os.environ, "SNAPSHOTS_DIR": snapshots}

        expect(pipeline("--init", "--trigger", "ci", env=env) == 0, "first run publishes without warning")
        first = fingerprint(url)
        expect(all(rows > 0 for rows, _ in first.values()), "every published table has rows")

        expect(pipeline("--trigger", "ci", env=env) == 0, "second run publishes")
        expect(fingerprint(url) == first, "a run without new files changes nothing (idempotent)")

        expect(pipeline("--dry-run", "--trigger", "ci", env=env) == 0, "dry run passes")
        expect(fingerprint(url) == first, "a dry run changes nothing")

    with psycopg.connect(url) as conn:
        q = lambda sql: conn.execute(sql).fetchone()[0]  # noqa: E731
        expect(q("SELECT count(*) FROM public.current_prices WHERE price < 20 OR price > 5000") == 0,
               "no current price outside 20-5000 CHF")
        expect(q("""SELECT count(*) FROM public.airbnb_snapshots s JOIN public.current_prices c
                    ON c.listing_id = s.listing_id AND c.price_date = s.last_scraped
                    WHERE s.price < 5""") == 0,
               "no price of the broken scrape is current")
        expect(q("SELECT count(*) FROM public.price_trends") > 0, "price trends are computed")
        last_runs = conn.execute("SELECT status FROM public.etl_runs ORDER BY id DESC LIMIT 3").fetchall()
        expect(last_runs == [("success",)] * 3, "the three runs are logged as success")

    if failures:
        raise SystemExit(f"{len(failures)} end-to-end check(s) failed")
    print("End-to-end pipeline test passed")


if __name__ == "__main__":
    main()
