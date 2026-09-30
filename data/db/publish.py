"""Publish step of the SmartBnB pipeline (the P of Write-Audit-Publish).

load_data.py and dbt build the candidate data in the build schema. publish()
copies it into the public tables the site reads, inside the caller's
transaction: pipeline.py then audits the public tables in that same
transaction and commits only if no blocking check fails, so the site never
sees data that did not pass the audit.

The public tables are emptied and refilled rather than dropped and
recreated: they keep their keys, indexes, grants and row level security
policies, and the loader role needs no right to create or drop tables.
"""

from load_data import BUILD_SCHEMA, RAW_TABLES

# dbt marts that the site reads, published under the same names
MART_TABLES = (
    "listing_activity", "airbnb_points", "current_prices",
    "neighbourhood_room_type_stats", "neighbourhood_stats", "price_trends",
)
# Foreign key order: listings first
PUBLISHED_TABLES = (*RAW_TABLES, *MART_TABLES)


def columns(cur, schema, table):
    cur.execute(
        """SELECT column_name FROM information_schema.columns
           WHERE table_schema = %s AND table_name = %s ORDER BY ordinal_position""",
        (schema, table))
    return [row[0] for row in cur.fetchall()]


def copy_sql(table, public_columns, build_columns, source_schema=BUILD_SCHEMA):
    """INSERT that refills a public table from its build twin, by column name.
    Raises when the build table lacks a column of the public one."""
    if not build_columns:
        raise RuntimeError(f"{source_schema}.{table} does not exist: nothing to publish")
    missing = [c for c in public_columns if c not in build_columns]
    if missing:
        raise RuntimeError(f"{source_schema}.{table} has no column {', '.join(missing)}")
    cols = ", ".join(public_columns)
    return f"INSERT INTO public.{table} ({cols}) SELECT {cols} FROM {source_schema}.{table}"


def publish(cur, source_schema=BUILD_SCHEMA):
    """Replaces the content of every published table with its build version,
    in the current transaction. Returns {table: rows}."""
    statements = [
        copy_sql(t, columns(cur, "public", t), columns(cur, source_schema, t), source_schema)
        for t in PUBLISHED_TABLES
    ]
    cur.execute("TRUNCATE " + ", ".join(f"public.{t}" for t in PUBLISHED_TABLES))
    counts = {}
    for table, statement in zip(PUBLISHED_TABLES, statements, strict=True):
        cur.execute(statement)
        counts[table] = cur.rowcount
        print(f"  public.{table}: {cur.rowcount} rows")
    return counts
