import csv
import io

import load_data


def rows(csv_bytes):
    return list(csv.reader(io.StringIO(csv_bytes.decode("utf-8"), newline="")))


def test_published_columns_hold_no_host_data():
    personal = {"host_id", "host_name", "host_about", "host_picture_url",
                "host_location", "description", "neighborhood_overview"}
    assert not personal & load_data.PUBLISHED_COLS


def test_minimize_keeps_only_published_columns_and_values():
    source = (
        b'id,host_name,name,description,price\n'
        b'1,Marie,"Studio, lake view","Hi, I am Marie\nWelcome",$120.00\n'
    )
    out = rows(load_data.minimize_csv(source))
    assert out == [["id", "name", "price"], ["1", "Studio, lake view", "$120.00"]]


def test_minimize_is_idempotent():
    source = b"id,host_name,name\n1,Marie,Studio\n"
    once = load_data.minimize_csv(source)
    assert load_data.minimize_csv(once) == once


def test_minimize_pads_short_rows():
    out = rows(load_data.minimize_csv(b"id,name,price\n1,Studio\n"))
    assert out[1] == ["1", "Studio", ""]


def test_scrape_ids_reads_the_files_to_reload(tmp_path, monkeypatch):
    monkeypatch.setattr(load_data, "DATA_DIR", tmp_path)
    load_data.write_snapshot(tmp_path / "2026-06-15.csv.gz", b"id,scrape_id\n1,20260615\n2,20260615\n")
    assert load_data.scrape_ids(["2026-06-15"]) == {20260615}
