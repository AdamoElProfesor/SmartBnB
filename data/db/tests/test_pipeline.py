from types import SimpleNamespace

import pytest

import pipeline
import publish
import quality


def test_dbt_env_splits_a_database_url():
    env = pipeline.dbt_env("postgresql://smartbnb_loader.ref:p%40ss@pooler.example.com:5432/postgres?sslmode=require")
    assert env == {
        "DBT_HOST": "pooler.example.com",
        "DBT_PORT": "5432",
        "DBT_USER": "smartbnb_loader.ref",
        "DBT_PASSWORD": "p@ss",
        "DBT_DBNAME": "postgres",
        "DBT_SSLMODE": "require",
    }


def test_dbt_env_defaults():
    env = pipeline.dbt_env("postgresql://postgres@localhost/")
    assert (env["DBT_PORT"], env["DBT_PASSWORD"], env["DBT_DBNAME"], env["DBT_SSLMODE"]) == ("5432", "", "postgres", "prefer")


def node_result(resource_type, name, status, severity=None, message=None):
    config = SimpleNamespace(severity=severity) if severity else SimpleNamespace()
    node = SimpleNamespace(resource_type=resource_type, name=name, config=config)
    return SimpleNamespace(node=node, status=status, message=message)


def test_dbt_results_block_on_failed_tests_and_models():
    results = pipeline.dbt_results([
        node_result("model", "current_prices", "success"),
        node_result("test", "unique_current_prices_listing_id", "pass", "ERROR"),
        node_result("unit_test", "broken_scrape_prices_are_dropped", "pass"),
        node_result("test", "not_null_current_prices_price", "fail", "ERROR", "Got 3 results"),
        node_result("test", "some_warning_test", "warn", "WARN", "Got 1 result"),
        node_result("model", "price_trends", "error", message="syntax error"),
        node_result("test", "unique_price_trends_region", "skipped", "ERROR"),
    ])
    by_name = {r.name: r for r in results}
    assert by_name["dbt not_null_current_prices_price"].severity == "error"
    assert by_name["dbt some_warning_test"].severity == "warning"
    assert not by_name["dbt model price_trends"].passed
    assert by_name["dbt_tests"].detail == "2 dbt tests passed"
    assert "dbt unique_price_trends_region" not in by_name
    assert quality.summary(results) == "error"


def test_dbt_results_pass_when_everything_passes():
    results = pipeline.dbt_results([node_result("test", "t", "pass", "ERROR")])
    assert quality.summary(results) == "success"


def test_publish_copies_by_column_name():
    sql = publish.copy_sql("current_prices", ["listing_id", "price", "price_date"],
                           ["price_date", "price", "listing_id", "source"])
    assert sql == ("INSERT INTO public.current_prices (listing_id, price, price_date) "
                   "SELECT listing_id, price, price_date FROM build.current_prices")


def test_publish_refuses_a_build_table_missing_a_column():
    with pytest.raises(RuntimeError, match="no column price_date"):
        publish.copy_sql("current_prices", ["listing_id", "price", "price_date"], ["listing_id", "price"])
    with pytest.raises(RuntimeError, match="does not exist"):
        publish.copy_sql("current_prices", ["listing_id"], [])


def test_published_tables_start_with_the_listings():
    # The other tables refer to airbnb_vaud, so it is refilled first
    assert publish.PUBLISHED_TABLES[0] == "airbnb_vaud"
    assert set(publish.MART_TABLES) <= set(publish.PUBLISHED_TABLES)


def test_price_range_comes_from_the_dbt_project():
    assert (quality.MIN_NIGHTLY_PRICE, quality.MAX_NIGHTLY_PRICE) == (20, 5000)
