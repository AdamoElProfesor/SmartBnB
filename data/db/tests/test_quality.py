import pytest

import quality

# Metrics of a healthy load (close to the real ones in September 2026)
HEALTHY = {
    "active_listings": 5257,
    "snapshot_age_days": 12,
    "priced_listings": 4556,
    "price_age_days": 1,
    "active_price_coverage": 0.75,
    "median_price": 171,
    "prices_out_of_range": 0,
    "excluded_price_observations": 20,
    "price_observations_ok": 6843,
    "unknown_room_types": 0,
    "active_missing_coordinates": 0,
    "active_outside_vaud": 0,
    "price_stat_groups": 358,
    "small_group_share": 0.12,
    "review_stat_neighbourhoods": 243,
    "amenity_scores": 9431,
}


def failed(results):
    return {r.name for r in results if not r.passed}


def test_healthy_load_is_published():
    results = quality.evaluate(HEALTHY, previous=HEALTHY)
    assert failed(results) == set()
    assert quality.summary(results) == "success"


def test_first_run_skips_the_drift_checks():
    names = {r.name for r in quality.evaluate(HEALTHY)}
    assert "median_price_change" not in names


@pytest.mark.parametrize("change, check", [
    ({"prices_out_of_range": 3}, "prices_out_of_range"),
    ({"median_price": 12}, "median_price"),
    ({"active_listings": 300}, "active_listings"),
    ({"active_price_coverage": 0.1}, "active_price_coverage"),
    ({"unknown_room_types": 40}, "unknown_room_types"),
    ({"active_outside_vaud": 200}, "active_outside_vaud"),
    ({"price_stat_groups": 0}, "price_stat_groups"),
    ({"median_price": None}, "median_price"),
])
def test_broken_load_is_blocked(change, check):
    results = quality.evaluate({**HEALTHY, **change})
    assert check in failed(results)
    assert quality.summary(results) == "error"


@pytest.mark.parametrize("change, check", [
    ({"snapshot_age_days": 60}, "snapshot_age_days"),
    ({"price_age_days": 90}, "price_age_days"),
    ({"small_group_share": 0.4}, "small_group_share"),
    ({"excluded_price_observations": 500}, "excluded_price_observations"),
])
def test_suspicious_load_is_published_with_warnings(change, check):
    results = quality.evaluate({**HEALTHY, **change})
    assert failed(results) == {check}
    assert quality.summary(results) == "warning"


def test_sudden_drop_against_the_last_run_is_blocked():
    current = {**HEALTHY, "priced_listings": 2000}
    results = quality.evaluate(current, previous=HEALTHY)
    assert "priced_listings_change" in failed(results)
    assert quality.summary(results) == "error"


def test_median_price_jump_is_a_warning():
    # A new price methodology moves the median: worth a look, not a block
    current = {**HEALTHY, "median_price": 230}
    results = quality.evaluate(current, previous=HEALTHY)
    assert failed(results) == {"median_price_change"}
    assert quality.summary(results) == "warning"


def test_report_lists_failed_checks_first():
    results = quality.evaluate({**HEALTHY, "prices_out_of_range": 3})
    lines = quality.report(results)
    assert lines[0].startswith("  FAIL [error] prices_out_of_range")
