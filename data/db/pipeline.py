"""Runs the SmartBnB data pipeline: extract-load, transform, audit, publish.

  1. Extract-load (load_data.py): the published raw tables plus the new
     Inside Airbnb scrapes are written to the build schema, never to public.
  2. Transform (dbt, data/transform): `dbt build` turns them into the tables
     the site reads, still in the build schema, and runs the dbt tests on
     every model. A failing test stops here: nothing is published.
  3. Publish and audit (publish.py, quality.py): in one transaction the
     public tables are refilled from the build schema, then measured and
     checked. The transaction is committed only when no blocking check
     failed; otherwise it is rolled back and the site keeps the previous data.

This is Write-Audit-Publish: the site only ever sees data that passed every
check. Each run, its metrics and every check are stored in public.etl_runs.

Exit code: 0 published, 2 published with warnings, 1 blocked or failed.

Usage:
  python pipeline.py                  # add new scrapes found on disk
  python pipeline.py --fetch          # download the latest snapshot first
  python pipeline.py --reload 2026-06-15   # replace a republished file's scrape
  python pipeline.py --full           # rebuild everything from the files
  python pipeline.py --init           # recreate schema + seed, then --full
  python pipeline.py --dry-run        # everything, then roll the publication back

DATABASE_URL is read from the environment or data/db/.env.
"""

import argparse
import json
import os
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit

import psycopg
from psycopg.types.json import Jsonb

import load_data
import publish
import quality

HERE = Path(__file__).resolve().parent
TRANSFORM_DIR = HERE.parent / "transform"


def dbt_env(url):
    """The DBT_* variables of data/transform/profiles.yml, from a Postgres URL."""
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    return {
        "DBT_HOST": parts.hostname or "localhost",
        "DBT_PORT": str(parts.port or 5432),
        "DBT_USER": unquote(parts.username or ""),
        "DBT_PASSWORD": unquote(parts.password or ""),
        "DBT_DBNAME": parts.path.lstrip("/") or "postgres",
        "DBT_SSLMODE": query.get("sslmode", "prefer"),
    }


def dbt_results(run_results):
    """quality.Result for every dbt test or model that failed, plus one line
    counting the tests that passed. Nodes skipped because an upstream one
    failed are left out."""
    results, passed = [], 0
    for r in run_results:
        node, status = r.node, str(r.status)
        if status == "skipped":
            continue
        if node.resource_type in ("test", "unit_test"):
            if status == "pass":
                passed += 1
                continue
            # Unit tests have no severity: they always block
            warn = status == "warn" or str(getattr(node.config, "severity", "")).lower() == "warn"
            results.append(quality.Result(f"dbt {node.name}", "warning" if warn else "error", False,
                                          r.message or status))
        elif status == "error":
            results.append(quality.Result(f"dbt model {node.name}", "error", False, r.message or "error"))
    results.append(quality.Result("dbt_tests", "error", True, f"{passed} dbt tests passed"))
    return results


def transform(url, stats_months):
    """`dbt build` in the build schema. Returns the dbt checks as quality.Result."""
    from dbt.cli.main import dbtRunner  # heavy import, only when the pipeline runs

    os.environ.update(dbt_env(url))
    res = dbtRunner().invoke([
        "build",
        "--project-dir", str(TRANSFORM_DIR),
        "--profiles-dir", str(TRANSFORM_DIR),
        "--vars", json.dumps({"stats_window_months": stats_months}),
    ])
    if res.exception is not None:
        raise RuntimeError(f"dbt build could not run: {res.exception}")
    return dbt_results(res.result.results if res.result else [])


def init_schema(url):
    """Recreates every table (schema.sql) and the amenity weights (seed.sql)."""
    with psycopg.connect(url, prepare_threshold=None) as conn:
        conn.execute((HERE / "schema.sql").read_text(encoding="utf-8"))
        conn.execute((HERE / "seed.sql").read_text(encoding="utf-8"))
    print("Schema + seed applied")


def start_run(url, trigger, mode, dry_run):
    """Opens the run log: a separate autocommit connection, so the row stays
    even when the publication is rolled back. Returns (connection, run id),
    or (None, None) when the etl_runs table does not exist yet."""
    log = psycopg.connect(url, autocommit=True, prepare_threshold=None)
    try:
        run_id = log.execute(
            "INSERT INTO public.etl_runs (trigger, mode, dry_run) VALUES (%s, %s, %s) RETURNING id",
            (trigger, mode, dry_run)).fetchone()[0]
    except psycopg.errors.UndefinedTable:
        print("  warning: public.etl_runs does not exist (data/db/schema.sql), run not logged")
        log.close()
        return None, None
    return log, run_id


def finish_run(log, run_id, status, new_scrapes=None, metrics=None, results=(), error=None):
    if log is None:
        return
    log.execute(
        """UPDATE public.etl_runs
           SET finished_at = now(), status = %s, new_scrapes = %s,
               metrics = %s, checks = %s, error = %s
           WHERE id = %s""",
        (status, new_scrapes, Jsonb(metrics) if metrics is not None else None,
         Jsonb([r.as_dict() for r in results]), error, run_id))
    log.close()


def previous_metrics(cur):
    """Metrics of the last run that was published, or None."""
    cur.execute("""
        SELECT metrics FROM public.etl_runs
        WHERE status IN ('success', 'warning') AND NOT dry_run AND metrics IS NOT NULL
        ORDER BY finished_at DESC LIMIT 1""")
    row = cur.fetchone()
    return row[0] if row else None


def run(args):
    """Runs every step; returns (status, new scrapes, metrics, results)."""
    url = load_data.read_database_url()
    print("Extract-load into the build schema...")
    with psycopg.connect(url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            new_scrapes = load_data.load(cur, full=args.full or args.init, reload=args.reload)

    print("Transform: dbt build...")
    results = transform(url, args.stats_months)
    metrics = None
    if quality.summary(results) == "error":
        print("\n".join(quality.report(results)))
        print("Blocked: a dbt model or test failed, nothing was published "
              "and the site keeps the previous data.")
        return "blocked", new_scrapes, metrics, results

    with psycopg.connect(url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            print("Publishing in a transaction...")
            publish.publish(cur)
            previous = previous_metrics(cur)

            print("Auditing...")
            metrics = quality.measure(cur)
            results += quality.evaluate(metrics, previous)
            print("\n".join(quality.report(results)))
            outcome = quality.summary(results)

            if outcome == "error":
                conn.rollback()
                print("Blocked: a blocking check failed, nothing was published "
                      "and the site keeps the previous data.")
                return "blocked", new_scrapes, metrics, results
            if args.dry_run:
                conn.rollback()
                print("Dry run: rolled back, nothing was published.")
            else:
                print("Published." if outcome == "success" else "Published with warnings.")
    return outcome, new_scrapes, metrics, results


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--fetch", action="store_true", help="download the latest InsideAirbnb snapshot first")
    parser.add_argument("--dates", nargs="+", default=[], type=load_data.snapshot_date, metavar="YYYY-MM-DD", help="download these snapshots first")
    parser.add_argument("--reload", nargs="+", default=[], type=load_data.snapshot_date, metavar="YYYY-MM-DD", help="replace the scrapes of these files, e.g. after Inside Airbnb republished them")
    parser.add_argument("--full", action="store_true", help="rebuild everything from the files on disk")
    parser.add_argument("--init", action="store_true", help="recreate schema + seed (drops all tables), implies --full")
    parser.add_argument("--stats-months", type=int, default=3, help="window for neighbourhood stats (default 3)")
    parser.add_argument("--dry-run", action="store_true", help="run every step, then roll the publication back")
    parser.add_argument("--trigger", default="manual", help="who started the run, stored in etl_runs (default manual)")
    args = parser.parse_args()

    load_data.fetch(args.dates, args.fetch)
    url = load_data.read_database_url()
    if args.init:
        # Before the run log opens, so a new database logs its first run too
        init_schema(url)
    mode = "init" if args.init else "full" if args.full else "incremental"
    log, run_id = start_run(url, args.trigger, mode, args.dry_run)
    new_scrapes, metrics, results = 0, None, []
    try:
        status, new_scrapes, metrics, results = run(args)
    except BaseException as e:
        finish_run(log, run_id, "failed", new_scrapes, metrics, results, f"{type(e).__name__}: {e}"[:2000])
        raise

    finish_run(log, run_id, status, new_scrapes, metrics, results)
    if run_id:
        print(f"Run {run_id} logged in public.etl_runs as {status}.")
    raise SystemExit({"success": 0, "warning": 2}.get(status, 1))


if __name__ == "__main__":
    main()
