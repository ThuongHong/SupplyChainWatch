from __future__ import annotations

from app.llm.story_mode import _compute_relationship


def test_story_mode_computes_correlation_and_lag() -> None:
    series_a = {
        "2026-01-01": 1.0,
        "2026-01-02": 2.0,
        "2026-01-03": 3.0,
        "2026-01-04": 4.0,
    }
    series_b = {
        "2026-01-01": 2.0,
        "2026-01-02": 4.0,
        "2026-01-03": 6.0,
        "2026-01-04": 8.0,
    }

    result = _compute_relationship(
        {"type": "index", "id": "BDI"},
        {"type": "index", "id": "FBX_GLOBAL"},
        series_a,
        series_b,
        90,
    )

    assert result["overlap_points"] == 4
    assert result["pearson_correlation_raw"] == 1.0
    assert result["optimal_lag_days"] is not None
