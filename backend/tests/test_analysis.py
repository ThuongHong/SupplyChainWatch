from __future__ import annotations

import pytest

from app.analysis.anomaly import rolling_z_score, severity_from_z_score
from app.analysis.correlation import correlation_matrix, pearson_correlation
from app.analysis.forecast import _moving_average
from app.analysis.maritime_risk import (
    economic_pressure_context,
    score_components,
    weather_route_impact,
)


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
