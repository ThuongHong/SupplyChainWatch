from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest

from app.analysis.historical_risk import (
    build_risk_feature_snapshots,
    compute_data_coverage,
    generate_entity_risk_forecasts,
    generate_risk_story_events,
)
from app.collectors.portwatch import PortWatchCollector


class FakeResult:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def mappings(self) -> FakeResult:
        return self

    def all(self) -> list[dict[str, Any]]:
        return self.rows

    def first(self) -> dict[str, Any] | None:
        return self.rows[0] if self.rows else None

    def __iter__(self) -> object:
        return iter(self.rows)


class FakeDb:
    def __init__(self, rows_by_key: dict[str, list[dict[str, Any]]]) -> None:
        self.rows_by_key = rows_by_key
        self.merged: list[Any] = []
        self.added: list[Any] = []
        self.commits = 0

    def execute(self, statement: Any, params: dict[str, Any] | None = None) -> FakeResult:
        sql = str(statement)
        for key, rows in self.rows_by_key.items():
            if key in sql:
                return FakeResult(rows)
        return FakeResult([])

    def merge(self, row: Any) -> None:
        self.merged.append(row)

    def add(self, row: Any) -> None:
        self.added.append(row)

    def commit(self) -> None:
        self.commits += 1


def test_portwatch_collector_uses_configurable_history_window() -> None:
    requested_where: list[str] = []

    def handler(request: Any) -> Any:
        import httpx

        requested_where.append(request.url.params.get("where", ""))
        return httpx.Response(200, request=request, json={"features": []})

    import httpx

    client = httpx.Client(transport=httpx.MockTransport(handler))

    PortWatchCollector(client=client, history_days=14).run()

    assert requested_where
    assert "date >= " in requested_where[0]


def test_portwatch_collector_paginates_filtered_feature_queries() -> None:
    offsets: list[str] = []

    def handler(request: Any) -> Any:
        import httpx

        if not str(request.url).split("?")[0].endswith("/query"):
            return httpx.Response(
                200,
                request=request,
                json={
                    "objectIdField": "ObjectId",
                    "maxRecordCount": 1000,
                    "advancedQueryCapabilities": {
                        "supportsPagination": True,
                        "supportsOrderBy": True,
                    },
                    "fields": [
                        {"name": "ObjectId"},
                        {"name": "date"},
                        {"name": "portid"},
                        {"name": "portcalls"},
                    ],
                },
            )
        offset = request.url.params.get("resultOffset", "0")
        offsets.append(offset)
        date_value = "2026-05-20" if offset == "0" else "2026-05-21"
        payload = {
            "features": [
                {
                    "attributes": {
                        "portid": "port1201",
                        "portname": "Singapore",
                        "date": date_value,
                        "portcalls": 120,
                    }
                }
            ],
            "exceededTransferLimit": offset == "0",
        }
        return httpx.Response(200, request=request, json=payload)

    import httpx

    client = httpx.Client(transport=httpx.MockTransport(handler))

    records = PortWatchCollector(client=client, history_days=180).run()

    assert offsets[:2] == ["0", "1000"]
    assert len({record.observed_at.date() for record in records}) == 2


def test_compute_data_coverage_records_depth_and_gaps() -> None:
    now = datetime(2026, 5, 20, tzinfo=UTC)
    db = FakeDb(
        {
            "FROM portwatch_metrics": [
                {
                    "source": "portwatch_ports",
                    "entity_type": "port",
                    "entity_id": "port-sgsin",
                    "entity_name": "Singapore",
                    "first_observed_at": now - timedelta(days=9),
                    "latest_observed_at": now,
                    "observed_rows": 8,
                    "observed_days": 8,
                }
            ],
            "FROM collection_log": [
                {"source": "portwatch_ports", "status": "success", "finished_at": now}
            ],
        }
    )

    created = compute_data_coverage(db, expected_window_days=10)  # type: ignore[arg-type]

    assert created == 1
    row = db.merged[0]
    assert row.entity_id == "port-sgsin"
    assert row.expected_days == 10
    assert row.missing_days == 2
    assert row.last_collection_status == "success"


def test_build_risk_feature_snapshots_computes_baseline_zscore_and_missing_flags() -> None:
    start = datetime(2026, 5, 1, tzinfo=UTC)
    rows = [
        {
            "time": start + timedelta(days=i),
            "entity_type": "port",
            "entity_id": "port-sgsin",
            "entity_name": "Singapore",
            "score": score,
            "severity": "high" if score >= 70 else "medium",
            "component_scores": {"traffic_anomaly": score},
            "missing_components": ["ais_context"],
            "source_metrics": {"daily_vessel_calls": 100 + i},
            "freshness_status": "fresh",
            "as_of": start + timedelta(days=i),
        }
        for i, score in enumerate([40, 42, 44, 46, 80])
    ]
    db = FakeDb({"risk_union": rows})

    created = build_risk_feature_snapshots(db, baseline_window_days=4)  # type: ignore[arg-type]

    assert created == 5
    latest = db.merged[-1]
    assert latest.entity_id == "port-sgsin"
    assert latest.risk_score == 80
    assert latest.baseline_values["risk_score"] == pytest.approx(43)
    assert latest.z_scores["risk_score"] > 2
    assert "ais_context" in latest.missing_features


def test_build_risk_feature_snapshots_uses_daily_portwatch_history() -> None:
    rows = [
        {
            "observed_date": date(2026, 5, 1),
            "entity_type": "port",
            "entity_id": "port-sgsin",
            "entity_name": "Singapore",
            "metric_name": "portcalls",
            "metric_value": 90,
            "source": "portwatch_ports",
            "latest_observed_at": datetime(2026, 5, 1, tzinfo=UTC),
        },
        {
            "observed_date": date(2026, 5, 2),
            "entity_type": "port",
            "entity_id": "port-sgsin",
            "entity_name": "Singapore",
            "metric_name": "portcalls",
            "metric_value": 140,
            "source": "portwatch_ports",
            "latest_observed_at": datetime(2026, 5, 2, tzinfo=UTC),
        },
    ]
    db = FakeDb({"daily_portwatch": rows, "risk_union": []})

    created = build_risk_feature_snapshots(db)  # type: ignore[arg-type]

    assert created == 2
    assert [row.snapshot_date for row in db.merged] == [date(2026, 5, 1), date(2026, 5, 2)]
    assert db.merged[-1].feature_values["portcalls"] == 140


def test_build_risk_feature_snapshots_collapses_multiple_risk_runs_per_day() -> None:
    day = datetime(2026, 5, 1, tzinfo=UTC)
    rows = [
        {
            "time": day.replace(hour=1),
            "entity_type": "port",
            "entity_id": "port-sgsin",
            "entity_name": "Singapore",
            "score": 40,
            "severity": "medium",
            "component_scores": {"traffic_anomaly": 40},
            "missing_components": [],
            "source_metrics": {"daily_vessel_calls": 100},
            "freshness_status": "fresh",
            "as_of": day.replace(hour=1),
        },
        {
            "time": day.replace(hour=12),
            "entity_type": "port",
            "entity_id": "port-sgsin",
            "entity_name": "Singapore",
            "score": 65,
            "severity": "medium",
            "component_scores": {"traffic_anomaly": 65},
            "missing_components": [],
            "source_metrics": {"daily_vessel_calls": 150},
            "freshness_status": "fresh",
            "as_of": day.replace(hour=12),
        },
    ]
    db = FakeDb({"risk_union": rows})

    created = build_risk_feature_snapshots(db)  # type: ignore[arg-type]

    assert created == 1
    assert db.merged[0].risk_score == 65


def test_generate_risk_story_events_creates_worsening_event_and_insight() -> None:
    observed_at = date(2026, 5, 5)
    db = FakeDb(
        {
            "FROM risk_feature_snapshots": [
                {
                    "snapshot_date": observed_at,
                    "entity_type": "port",
                    "entity_id": "port-sgsin",
                    "entity_name": "Singapore",
                    "risk_score": 82,
                    "severity": "high",
                    "feature_values": {"risk_score": 82},
                    "baseline_values": {"risk_score": 43},
                    "z_scores": {"risk_score": 3.2},
                    "deltas": {"risk_score": 39, "risk_score_pct": 90.7},
                    "missing_features": [],
                    "driver_metadata": {"source_metrics": {"daily_vessel_calls": 150}},
                    "source_freshness": {"status": "fresh"},
                }
            ]
        }
    )

    created = generate_risk_story_events(db, z_threshold=2.0, percent_change_threshold=50)

    assert created == 1
    story = db.merged[0]
    assert story.event_type == "risk_worsening"
    assert "Singapore risk rose" in story.narrative
    assert db.added[0].event_type == "risk_worsening"


def test_generate_risk_story_events_creates_driver_change_story() -> None:
    db = FakeDb(
        {
            "FROM risk_feature_snapshots": [
                {
                    "snapshot_date": date(2026, 5, 4),
                    "entity_type": "port",
                    "entity_id": "port-sgsin",
                    "entity_name": "Singapore",
                    "risk_score": 62,
                    "severity": "medium",
                    "feature_values": {"risk_score": 62},
                    "baseline_values": {"risk_score": 60},
                    "z_scores": {"risk_score": 0.2},
                    "deltas": {"risk_score": 2, "risk_score_pct": 3.3},
                    "missing_features": [],
                    "driver_metadata": {
                        "component_scores": {"traffic_anomaly": 80, "trade_flow_change": 30},
                        "source_metrics": {"daily_vessel_calls": 110},
                    },
                    "source_freshness": {"status": "fresh"},
                },
                {
                    "snapshot_date": date(2026, 5, 5),
                    "entity_type": "port",
                    "entity_id": "port-sgsin",
                    "entity_name": "Singapore",
                    "risk_score": 64,
                    "severity": "medium",
                    "feature_values": {"risk_score": 64},
                    "baseline_values": {"risk_score": 62},
                    "z_scores": {"risk_score": 0.4},
                    "deltas": {"risk_score": 2, "risk_score_pct": 3.2},
                    "missing_features": [],
                    "driver_metadata": {
                        "component_scores": {"traffic_anomaly": 20, "trade_flow_change": 90},
                        "source_metrics": {"trade_volume_index": 55},
                    },
                    "source_freshness": {"status": "fresh"},
                },
            ]
        }
    )

    created = generate_risk_story_events(db, z_threshold=2.0, percent_change_threshold=50)

    assert created == 1
    story = db.merged[0]
    assert story.event_type == "driver_change"
    assert story.metric == "top_driver"
    assert "risk driver changed from traffic_anomaly to trade_flow_change" in story.narrative
    assert db.added[0].event_type == "driver_change"


def test_generate_entity_risk_forecasts_gates_on_history_and_records_baseline_output() -> None:
    start = date(2026, 5, 1)
    rows = [
        {
            "snapshot_date": start + timedelta(days=i),
            "entity_type": "port",
            "entity_id": "port-sgsin",
            "entity_name": "Singapore",
            "risk_score": 50 + i,
            "feature_values": {"risk_score": 50 + i},
            "missing_features": [] if i % 4 else ["ais_context"],
            "source_freshness": {"status": "fresh"},
            "driver_metadata": {"top_driver": "traffic_anomaly"},
        }
        for i in range(20)
    ]
    db = FakeDb({"FROM risk_feature_snapshots": rows})

    created = generate_entity_risk_forecasts(
        db, minimum_history_days=14, horizon_days=7, max_gap_rate=0.5
    )

    assert created == 1
    forecast = db.merged[0]
    assert forecast.entity_id == "port-sgsin"
    assert forecast.data_sufficiency_status == "sufficient"
    assert forecast.horizon_days == 7
    assert len(forecast.predictions) == 7
    assert forecast.model_name == "risk_moving_average_baseline"


def test_forecast_allows_optional_missing_features_with_confidence_penalty() -> None:
    start = date(2026, 5, 1)
    rows = [
        {
            "snapshot_date": start + timedelta(days=i),
            "entity_type": "port",
            "entity_id": "port-sgsin",
            "entity_name": "Singapore",
            "risk_score": 45 + i,
            "feature_values": {"risk_score": 45 + i},
            "missing_features": ["bottleneck_stress"],
            "source_freshness": {"status": "stale"},
            "driver_metadata": {"top_driver": "traffic_anomaly"},
        }
        for i in range(20)
    ]
    db = FakeDb({"FROM risk_feature_snapshots": rows})

    created = generate_entity_risk_forecasts(
        db, minimum_history_days=14, horizon_days=7, max_gap_rate=0.2
    )

    assert created == 1
    forecast = db.merged[0]
    assert forecast.data_sufficiency_status == "sufficient"
    assert forecast.confidence < 0.85
    assert len(forecast.predictions) == 7
