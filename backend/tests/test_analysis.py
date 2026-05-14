from __future__ import annotations

import pytest

from app.analysis.anomaly import rolling_z_score, severity_from_z_score
from app.analysis.correlation import correlation_matrix, pearson_correlation
from app.analysis.forecast import _moving_average


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
