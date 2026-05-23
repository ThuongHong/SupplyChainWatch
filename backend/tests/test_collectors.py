from __future__ import annotations

import asyncio
import json
import ssl
from datetime import UTC, datetime
from typing import Any, cast

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
from app.collectors.fbx_scraper import parse_fbx_index_value, parse_index_value
from app.collectors.fred import FRED_SERIES, FREDCollector
from app.collectors.openmeteo import ROUTE_POINTS, OpenMeteoMarineCollector
from app.collectors.portwatch import normalize_feature
from app.collectors.wci_scraper import parse_wci_index_value
from app.config import get_settings
from app.schemas.records import FreightIndexRecord
from app.scripts.backfill_freight_indices import parse_manual_freight_backfill
from app.scripts.seed_public_freight_history import (
    _extract_infogram_live_key,
    _parse_fbx_live_data,
    _parse_mts_wci,
    _parse_stockq_bdi,
)


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


def test_base_collector_marks_unexpected_exception_failed() -> None:
    class ExplodingCollector(DummyCollector):
        source = "exploding"

        def collect(self) -> list[dict[str, Any]]:
            raise RuntimeError("unexpected transport failure")

    class FakeDb:
        def __init__(self) -> None:
            self.row: object | None = None
            self.commits = 0

        def add(self, row: object) -> None:
            self.row = row

        def commit(self) -> None:
            self.commits += 1

        def refresh(self, row: object) -> None:
            self.row = row

    db = FakeDb()

    with pytest.raises(RuntimeError, match="unexpected transport failure"):
        ExplodingCollector().run(db=db)  # type: ignore[arg-type]

    log_row = cast(Any, db.row)
    assert log_row is not None
    assert log_row.status == "failed"
    assert log_row.finished_at is not None
    assert log_row.error == "unexpected transport failure"


def test_parse_bunker_prices_from_table() -> None:
    html = """
    <table caption="VLSFO summary">
      <tr><th>Singapore</th><td>$610.50</td><td>+2.00</td></tr>
      <tr><th>Rotterdam</th><td>590</td><td>-1.00</td></tr>
    </table>
    <table caption="MGO summary">
      <tr><th>Singapore</th><td>790</td><td>+1.50</td></tr>
    </table>
    """

    rows = parse_bunker_prices(html)

    assert rows[0]["port_code"] == "SINGAPORE"
    assert rows[0]["fuel_type"] == "VLSFO"
    assert rows[0]["price_usd_per_ton"] == 610.50
    assert rows[2]["fuel_type"] == "MGO"
    assert len(rows) == 3


def test_parse_public_index_value_from_data_attribute() -> None:
    rows = parse_index_value('<span data-index-value="2510.45"></span>', "FBX_GLOBAL", "test")

    assert rows[0]["index_name"] == "FBX_GLOBAL"
    assert rows[0]["value"] == pytest.approx(2510.45)


def test_parse_public_index_value_ignores_full_page_numbers() -> None:
    rows = parse_index_value(
        "<html><body>May 2026 chart 2,510.45 footer 2025</body></html>",
        "FBX_GLOBAL",
        "test",
    )

    assert rows == []


def test_parse_fbx_public_ticker_data() -> None:
    rows = parse_fbx_index_value(
        """
        <script>
        window.frProductIntroTickerData['x'] = [
          {"label":"FBX","value":"$2,000","change":"+0.94%","positive":true},
          {"label":"FBX01","value":"$2,814","change":"-0.51%","positive":false}
        ];
        </script>
        """,
        "freightos_fbx",
    )

    assert rows[0]["index_name"] == "FBX_GLOBAL"
    assert rows[0]["value"] == 2000.0
    assert rows[0]["metadata"]["parser"] == "freightos_ticker"


def test_parse_wci_weekly_update_text() -> None:
    rows = parse_wci_index_value(
        """
        <p>Our detailed assessment for Thursday, 21 May 2026 The Drewry World
        Container Index (WCI) increased 6% to $2,712 per 40ft container.</p>
        """,
        "drewry_wci",
    )

    assert rows[0]["index_name"] == "WCI_GLOBAL"
    assert rows[0]["value"] == 2712.0
    assert rows[0]["time"] == datetime(2026, 5, 21, tzinfo=UTC)
    assert rows[0]["metadata"]["parser"] == "drewry_weekly_update"


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


def test_manual_backfill_accepts_bdi_rows() -> None:
    records = parse_manual_freight_backfill(
        "\n".join(
            [
                "time,index_name,value,source,source_url,provenance,note,provider_release_date",
                (
                    "2026-05-22,BDI,2991,public_stockq_bdi,"
                    "https://en.stockq.org/index/BDI.php,StockQ Baltic Dry index public table,"
                    "recent-history table,2026-05-22"
                ),
            ]
        )
    )

    assert records[0].index_name == "BDI"
    assert records[0].value == 2991
    assert records[0].metadata is not None
    assert records[0].metadata["source_url"] == "https://en.stockq.org/index/BDI.php"


def test_public_seed_parsers_extract_major_freight_indices() -> None:
    bdi_rows = _parse_stockq_bdi(
        "2026/05/22 Baltic Dry 2991.00 2026/05/21 Baltic Dry 2964.00"
    )
    assert bdi_rows == [
        (datetime(2026, 5, 21).date(), 2964.0),
        (datetime(2026, 5, 22).date(), 2991.0),
    ]

    live_key = _extract_infogram_live_key(
        "<script>window.infographicData="
        + json.dumps(
            {
                "elements": {
                    "content": {
                        "content": {
                            "entities": {
                                "chart": {
                                    "props": {
                                        "chartData": {
                                            "custom": {
                                                "live": {
                                                    "provider": "atlas_google_drive",
                                                    "key": "live-key",
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        )
        + ";</script>"
    )
    assert live_key == "live-key"

    fbx_rows = _parse_fbx_live_data(
        {
            "data": [
                [
                    ["Date", "FBX", "FBX01"],
                    ["2026-05-15", "$2,000.50", "$3,000.00"],
                    ["2026-05-22", "$2,191", "$3,100.00"],
                ]
            ]
        }
    )
    assert fbx_rows == [
        (datetime(2026, 5, 15).date(), 2000.5),
        (datetime(2026, 5, 22).date(), 2191.0),
    ]

    wci_rows = _parse_mts_wci(
        """
        2026-05-21 · 09:45 Drewry World Container Index: Week of May 21st
        The Drewry World Container Index (WCI) increased 6% to $2,712 per 40ft container.
        2026-05-14 · 09:45 Drewry World Container Index: Week of May 14th
        The Drewry World Container Index (WCI) surged 12% to $2,553 per 40ft container.
        © 2026 MTS Insights.
        """
    )
    assert wci_rows == [
        (datetime(2026, 5, 14).date(), 2553.0),
        (datetime(2026, 5, 21).date(), 2712.0),
    ]


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
