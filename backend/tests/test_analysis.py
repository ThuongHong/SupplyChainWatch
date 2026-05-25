from __future__ import annotations

from pathlib import Path

import pytest

from app.analysis.anomaly import rolling_z_score, severity_from_z_score
from app.analysis.correlation import correlation_matrix, pearson_correlation
from app.analysis.forecast import _moving_average
from app.analysis.insight_generator import _generate_source_health_insights
from app.analysis.maritime_risk import (
    economic_pressure_context,
    score_components,
    weather_route_impact,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class FakeMappings:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def all(self) -> list[dict[str, object]]:
        return self.rows


class FakeResult:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def mappings(self) -> FakeMappings:
        return FakeMappings(self.rows)


class FakeInsightDb:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows
        self.added: list[object] = []
        self.params: dict[str, object] | None = None

    def execute(self, statement: object, params: dict[str, object]) -> FakeResult:
        self.params = params
        return FakeResult(self.rows)

    def add(self, row: object) -> None:
        self.added.append(row)


def test_pearson_correlation_detects_linear_relationship() -> None:
    assert pearson_correlation([1, 2, 3], [2, 4, 6]) == pytest.approx(1.0)
    assert pearson_correlation([1, 2, 3], [6, 4, 2]) == pytest.approx(-1.0)


def test_correlation_matrix_aligns_by_date() -> None:
    matrix = correlation_matrix(
        {
            "BDI": {"2026-01-01": 1.0, "2026-01-02": 2.0, "2026-01-03": 3.0},
            "FBX": {"2026-01-01": 2.0, "2026-01-02": 4.0, "2026-01-03": 6.0},
        }
    )

    bdi_fbx = next(cell for cell in matrix if cell["index_a"] == "BDI" and cell["index_b"] == "FBX")
    assert bdi_fbx["correlation"] == pytest.approx(1.0)
    assert bdi_fbx["overlap"] == 3


def test_rolling_z_score_uses_previous_window() -> None:
    values = [10.0] * 29 + [11.0, 20.0]

    score = rolling_z_score(values, window=30)

    assert score is not None
    assert score > 4


def test_severity_mapping() -> None:
    assert severity_from_z_score(2.8) == "low"
    assert severity_from_z_score(3.5) == "medium"
    assert severity_from_z_score(4.5) == "high"


def test_moving_average_uses_recent_window() -> None:
    assert _moving_average([1, 2, 3, 10, 20], window=2) == pytest.approx(15)


def test_portwatch_score_components_include_missing_metadata() -> None:
    components, missing, reasons = score_components(
        {"daily_vessel_calls": 120.0, "trade_volume_index": 65.0},
        entity_type="port",
        baselines={"daily_vessel_calls": 80.0, "trade_volume_index": 100.0},
    )

    assert components["traffic_anomaly"] == pytest.approx(100.0)
    assert "bottleneck_stress" in missing
    assert reasons


def test_portwatch_score_components_use_absolute_values_without_baseline() -> None:
    components, missing, reasons = score_components(
        {"daily_vessel_calls": 120.0, "trade_volume_index": 65.0},
        entity_type="port",
    )

    assert components["traffic_anomaly"] == pytest.approx(60.0)
    assert components["trade_flow_change"] == pytest.approx(65.0)
    assert components["derived_congestion_risk"] == pytest.approx(60.0)
    assert "bottleneck_stress" in missing
    assert reasons


def test_weather_and_economic_context_scores() -> None:
    weather = weather_route_impact(wave_m=3.0, wind_kph=40.0)
    economic = economic_pressure_context({"FBX": 6.0, "WCI": -4.0})

    assert weather["score"] == pytest.approx(50.0)
    assert economic["severity"] in {"medium", "high"}


def test_source_health_insights_explain_coverage_gaps() -> None:
    db = FakeInsightDb(
        [
            {
                "source": "portwatch_ports",
                "entity_type": "port",
                "entity_id": "port-sgsin",
                "entity_name": "Singapore",
                "observed_rows": 84,
                "expected_days": 90,
                "missing_days": 12,
                "freshness_status": "stale",
                "last_collection_status": "failed",
            }
        ]
    )

    created = _generate_source_health_insights(db, limit=3)  # type: ignore[arg-type]

    assert created == 1
    assert db.params == {"limit": 3}
    insight = db.added[0]
    assert insight.category == "data_quality"
    assert insight.event_type == "source_health"
    assert "missing 12 of 90 expected days" in insight.narrative
    assert insight.attention_level == "watch"


def test_analysis_and_llm_paths_do_not_query_aisstream_tables() -> None:
    forbidden_sql = (
        "FROM port_congestion",
        "JOIN port_congestion",
        "FROM vessel_positions",
        "JOIN vessel_positions",
        "FROM chokepoint_status",
        "JOIN chokepoint_status",
    )
    checked_files = [
        PROJECT_ROOT / "app" / "api" / "routes" / "stats.py",
        PROJECT_ROOT / "app" / "llm" / "story_mode.py",
        PROJECT_ROOT / "app" / "llm" / "narrator.py",
        PROJECT_ROOT / "app" / "llm" / "anomaly_explainer.py",
        PROJECT_ROOT / "app" / "llm" / "forecast_commenter.py",
    ]

    offenders = [
        f"{path.relative_to(PROJECT_ROOT)}: {needle}"
        for path in checked_files
        for needle in forbidden_sql
        if needle in path.read_text()
    ]

    assert offenders == []


def test_forecast_and_narrator_payloads_do_not_emit_ais_congestion_signal_names() -> None:
    checked_files = [
        PROJECT_ROOT / "app" / "llm" / "narrator.py",
        PROJECT_ROOT / "app" / "llm" / "anomaly_explainer.py",
        PROJECT_ROOT / "app" / "llm" / "forecast_commenter.py",
    ]
    offenders = [
        str(path.relative_to(PROJECT_ROOT))
        for path in checked_files
        if "average_port_congestion" in path.read_text()
    ]

    assert offenders == []


def test_compute_port_historical_anomalies() -> None:
    from datetime import UTC, datetime, timedelta

    from app.analysis.anomaly import compute_port_historical_anomalies

    now = datetime.now(UTC)
    # Mock rows represent portwatch_metrics-derived data (not port_congestion).
    # Column names match what compute_port_historical_anomalies reads from its
    # portwatch_metrics JOIN query (total_in_area, anchored_count, avg_dwell_hours,
    # median_speed are aliases for the PortWatch metric values).
    # AISStream tables (vessel_positions, port_congestion) are not consulted.
    rows = []
    for i in range(1, 10):
        rows.append(
            {
                "time": now - timedelta(days=10 - i),
                "port_id": 1,
                "port_name": "Test Port",
                "anchored_count": 5 + (i % 2),  # alternates 5 and 6
                "total_in_area": 10 + (i % 2),  # alternates 10 and 11
                "avg_dwell_hours": 12.0,
                "median_speed": 5.0,
            }
        )
    # Add a tenth point (today) with a high-anomaly spike
    rows.append(
        {
            "time": now,
            "port_id": 1,
            "port_name": "Test Port",
            "anchored_count": 35,
            "total_in_area": 40,
            "avg_dwell_hours": 48.0,
            "median_speed": 1.0,
        }
    )

    db = FakeInsightDb(rows)
    anomalies = compute_port_historical_anomalies(db, days=30)  # type: ignore[arg-type]

    # There should be detected anomalies
    assert len(anomalies) > 0
    latest_anomaly = anomalies[0]
    assert latest_anomaly["port_name"] == "Test Port"
    assert latest_anomaly["severity"] in ("medium", "high")
    assert latest_anomaly["anomaly_score"] > 2.0
    assert latest_anomaly["port_id"] == 1
