from __future__ import annotations

import asyncio
import ssl
from datetime import UTC, datetime

import httpx
import pytest

from app.collectors.aisstream import (
    AISStreamCollector,
    _parse_position_message,
    _parse_static_message,
    _parse_static_position_message,
    _parse_timestamp,
    is_relevant_ais_row,
)
from app.collectors.base import BaseCollector, CollectorError
from app.collectors.bunker_scraper import parse_bunker_prices
from app.collectors.fbx_scraper import parse_index_value
from app.collectors.fred import FRED_SERIES, FREDCollector
from app.collectors.openmeteo import ROUTE_POINTS, OpenMeteoMarineCollector
from app.collectors.portwatch import normalize_feature
from app.config import get_settings
from app.schemas.records import FreightIndexRecord
from app.scripts.backfill_freight_indices import parse_manual_freight_backfill


class DummyCollector(BaseCollector[FreightIndexRecord]):
    source = "dummy"
    record_model = FreightIndexRecord

    def collect(self) -> list[dict[str, object]]:
        return [
            {
                "time": datetime(2026, 5, 14, tzinfo=UTC),
                "index_name": "BDI",
                "value": 1000.0,
                "source": self.source,
            }
        ]


def test_base_collector_validates_records() -> None:
    records = DummyCollector().run()

    assert len(records) == 1
    assert records[0].index_name == "BDI"


def test_parse_bunker_prices_from_table() -> None:
    html = """
    <table>
      <tr><td>SGP</td><td>VLSFO</td><td>$610.50</td></tr>
      <tr><td>RTM</td><td>MGO</td><td>790</td></tr>
    </table>
    """

    rows = parse_bunker_prices(html)

    assert rows[0]["port_code"] == "SGP"
    assert rows[0]["fuel_type"] == "VLSFO"
    assert rows[0]["price_usd_per_ton"] == 610.50
    assert len(rows) == 2


def test_parse_public_index_value_from_data_attribute() -> None:
    rows = parse_index_value('<span data-index-value="2510.45"></span>', "FBX_GLOBAL", "test")

    assert rows[0]["index_name"] == "FBX_GLOBAL"
    assert rows[0]["value"] == pytest.approx(2510.45)


def test_fred_collector_normalizes_observations(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRED_API_KEY", "test-key")
    get_settings.cache_clear()

    def fake_request(self: httpx.Client, method: str, url: str, **kwargs: object) -> httpx.Response:
        request = httpx.Request(method, url)
        return httpx.Response(
            200,
            request=request,
            json={
                "observations": [
                    {"date": "2026-05-14", "value": "1400.5"},
                    {"date": "2026-05-13", "value": "."},
                ]
            },
        )

    monkeypatch.setattr(httpx.Client, "request", fake_request)

    records = FREDCollector(series={"BDI": "BDIY"}).run()

    assert len(records) == 1
    assert records[0].index_name == "BDI"
    assert records[0].value == 1400.5
    get_settings.cache_clear()


def test_fred_default_series_include_ui_and_analysis_names() -> None:
    required_names = {"BDI", "DCOILBRENTEU", "DTWEXBGS", "INDPRO"}

    assert required_names.issubset(FRED_SERIES)
    assert FRED_SERIES["BDI"] == "BDIY"


def test_openmeteo_collector_validates_no_key_weather_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENMETEO_API_KEY", raising=False)

    def fake_request(self: httpx.Client, method: str, url: str, **kwargs: object) -> httpx.Response:
        request = httpx.Request(method, url)
        return httpx.Response(
            200,
            request=request,
            json={
                "hourly": {
                    "time": ["2026-05-14T00:00"],
                    "wave_height": [2.4],
                    "wind_wave_height": [1.2],
                }
            },
        )

    monkeypatch.setattr(httpx.Client, "request", fake_request)

    records = OpenMeteoMarineCollector().run()

    assert len(records) == len(ROUTE_POINTS) * 2
    assert any(record.index_name.startswith("WAVE_HEIGHT_") for record in records)
    assert any(record.index_name.startswith("WIND_WAVE_HEIGHT_") for record in records)
    assert all(record.source == "openmeteo_marine" for record in records)
    assert all(
        record.metadata and record.metadata["api_key_required"] is False for record in records
    )


def test_manual_fbx_wci_backfill_parser_keeps_provenance() -> None:
    records = parse_manual_freight_backfill(
        "\n".join(
            [
                "time,index_name,value,source,source_url,provenance,note,provider_release_date",
                (
                    "2026-05-21,WCI_GLOBAL,2135.50,manual_drewry_wci,"
                    "https://www.drewry.co.uk/,Drewry weekly public update,"
                    "weekly close,2026-05-21"
                ),
                (
                    "2026-05-21T00:00:00Z,FBX_GLOBAL,2510.45,manual_freightos_fbx,"
                    "https://fbx.freightos.com/,Freightos public FBX page,"
                    "manual class backfill,2026-05-21"
                ),
            ]
        )
    )

    assert [record.index_name for record in records] == ["WCI_GLOBAL", "FBX_GLOBAL"]
    assert records[0].time == datetime(2026, 5, 21, tzinfo=UTC)
    assert records[0].source == "manual_drewry_wci"
    assert records[0].metadata is not None
    assert records[0].metadata["ingest_method"] == "manual_csv"
    assert records[0].metadata["provenance"] == "Drewry weekly public update"
    assert records[0].metadata["source_url"] == "https://www.drewry.co.uk/"


def test_manual_backfill_rejects_unsupported_index() -> None:
    with pytest.raises(ValueError, match="index_name must be one of"):
        parse_manual_freight_backfill("time,index_name,value\n2026-05-21,SCFI,1000\n")


def test_aisstream_tls_failure_stays_verified(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    def fake_connect(*args: object, **kwargs: object) -> object:
        calls.append(dict(kwargs))
        raise ssl.SSLCertVerificationError("certificate verify failed")

    monkeypatch.setattr("app.collectors.aisstream.websockets.connect", fake_connect)

    with pytest.raises(CollectorError, match="aisstream websocket failed"):
        asyncio.run(
            AISStreamCollector()._collect_websocket(
                api_key="test-key",
                sample_seconds=0.1,
                max_records=1,
            )
        )

    assert calls == [{"open_timeout": 10}]


def test_aisstream_position_message_parser() -> None:
    row = _parse_position_message(
        {
            "MessageType": "PositionReport",
            "MetaData": {"MMSI": 368207620, "time_utc": "2026-05-15T02:00:00Z"},
            "Message": {
                "PositionReport": {
                    "UserID": 368207620,
                    "Latitude": 1.25,
                    "Longitude": 103.8,
                    "Sog": 12.3,
                    "Cog": 180.0,
                    "NavigationalStatus": 0,
                }
            },
        }
    )

    assert row is not None
    assert row["mmsi"] == 368207620
    assert row["lat"] == 1.25
    assert row["lon"] == 103.8
    assert row["sog"] == 12.3


def test_aisstream_ignores_non_watchlist_outside_risk_area() -> None:
    row = {"mmsi": 123456789, "lat": 20.0, "lon": 20.0, "_risk_area": False}

    assert not is_relevant_ais_row(row, {987654321})
    assert is_relevant_ais_row(row, {123456789})


def test_aisstream_timestamp_parser_handles_stream_format() -> None:
    parsed = _parse_timestamp("2026-05-15 02:20:38.650236754 +0000 UTC")

    assert parsed == datetime(2026, 5, 15, 2, 20, 38, 650236, tzinfo=UTC)


def test_aisstream_static_message_parser() -> None:
    row = _parse_static_message(
        {
            "MessageType": "ShipStaticData",
            "MetaData": {
                "MMSI": 477722600,
                "ShipName": "CSSC LE HAVRE       ",
                "time_utc": "2026-05-15 02:38:04.02637196 +0000 UTC",
            },
            "Message": {
                "ShipStaticData": {
                    "UserID": 477722600,
                    "ImoNumber": 9853931,
                    "Name": "CSSC LE HAVRE       ",
                    "Type": 70,
                    "Dimension": {"A": 216, "B": 38, "C": 17, "D": 26},
                }
            },
        }
    )

    assert row is not None
    assert row["mmsi"] == 477722600
    assert row["imo"] == 9853931
    assert row["name"] == "CSSC LE HAVRE"
    assert row["type"] == 70
    assert row["type_label"] == "Cargo"
    assert row["length"] == 254.0
    assert row["width"] == 43.0


def test_aisstream_static_position_message_parser() -> None:
    row = _parse_static_position_message(
        {
            "MessageType": "ShipStaticData",
            "MetaData": {
                "MMSI": 477722600,
                "latitude": 1.15299,
                "longitude": 103.77828,
                "time_utc": "2026-05-15 02:38:04.02637196 +0000 UTC",
            },
            "Message": {
                "ShipStaticData": {
                    "UserID": 477722600,
                    "Type": 70,
                }
            },
        }
    )

    assert row is not None
    assert row["mmsi"] == 477722600
    assert row["lat"] == 1.15299
    assert row["lon"] == 103.77828


def test_portwatch_normalizes_feature_metrics() -> None:
    rows = normalize_feature(
        {
            "attributes": {
                "portid": "SGSIN",
                "portname": "Singapore",
                "date": "2026-05-20T00:00:00Z",
                "daily_vessel_calls": 120,
                "trade_volume_index": "91.5",
            }
        },
        entity_hint="port",
        source="portwatch_ports",
    )

    assert {row["metric_name"] for row in rows} == {"daily_vessel_calls", "trade_volume_index"}
    assert rows[0]["entity_id"] == "port-sgsin"
    assert rows[0]["source"] == "portwatch_ports"


def test_portwatch_normalizes_documented_chokepoint_fields() -> None:
    rows = normalize_feature(
        {
            "attributes": {
                "portid": "Suez",
                "portname": "Suez Canal",
                "date": "2026-05-20",
                "n_total": 76,
                "capacity": 900000,
            }
        },
        entity_hint="chokepoint",
        source="portstraitwatch_chokepoints",
    )

    assert {row["metric_name"] for row in rows} == {"n_total", "capacity"}
    assert rows[0]["entity_id"] == "cp-suez"
