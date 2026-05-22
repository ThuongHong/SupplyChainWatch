from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app.tasks import jobs


def test_collect_portwatch_uses_explicit_demo_setting_and_chains_risk(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fallback_values: list[bool] = []
    chained: list[bool] = []

    monkeypatch.setattr(
        jobs,
        "get_settings",
        lambda: SimpleNamespace(backend_demo_fallback_enabled=False),
    )

    def fake_run_collector(collector: Any) -> int:
        fallback_values.append(bool(collector.use_demo_fallback))
        return 3

    monkeypatch.setattr(jobs, "_run_collector", fake_run_collector)
    monkeypatch.setattr(jobs, "_run_risk_derivation", lambda: chained.append(True))

    rows = jobs.collect_portwatch()

    assert rows == 3
    assert fallback_values == [False]
    assert chained == [True]


def test_risk_derivation_refreshes_downstream_outputs(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    db = object()

    class FakeSessionLocal:
        def __enter__(self) -> object:
            return db

        def __exit__(self, *args: object) -> None:
            return None

    monkeypatch.setattr(jobs, "SessionLocal", FakeSessionLocal)
    monkeypatch.setattr(
        jobs,
        "compute_maritime_risk_scores",
        lambda received: calls.append("risk") or 2,
    )
    monkeypatch.setattr(
        jobs,
        "compute_disruption_propagation",
        lambda received: calls.append("propagation") or 1,
    )
    monkeypatch.setattr(
        jobs,
        "refresh_watchlist_from_risk",
        lambda received: calls.append("watchlist") or 4,
    )
    monkeypatch.setattr(
        jobs,
        "generate_insights_job",
        lambda received: calls.append("insights") or 3,
    )

    result = jobs._run_risk_derivation()

    assert result == {
        "risk_rows": 2,
        "propagation_rows": 1,
        "watchlist_rows": 4,
        "insight_rows": 3,
    }
    assert calls == ["risk", "propagation", "watchlist", "insights"]


def test_risk_derivation_skips_downstream_outputs_when_no_risk_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = object()

    class FakeSessionLocal:
        def __enter__(self) -> object:
            return db

        def __exit__(self, *args: object) -> None:
            return None

    monkeypatch.setattr(jobs, "SessionLocal", FakeSessionLocal)
    monkeypatch.setattr(jobs, "compute_maritime_risk_scores", lambda received: 0)
    monkeypatch.setattr(
        jobs,
        "compute_disruption_propagation",
        lambda received: pytest.fail("propagation should not run"),
    )
    monkeypatch.setattr(
        jobs,
        "refresh_watchlist_from_risk",
        lambda received: pytest.fail("watchlist should not run"),
    )
    monkeypatch.setattr(
        jobs,
        "generate_insights_job",
        lambda received: pytest.fail("insights should not run"),
    )

    result = jobs._run_risk_derivation()

    assert result == {
        "risk_rows": 0,
        "propagation_rows": 0,
        "watchlist_rows": 0,
        "insight_rows": 0,
    }


def test_collect_all_reports_per_source_results_and_continues_after_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    monkeypatch.setattr(
        jobs,
        "get_settings",
        lambda: SimpleNamespace(fred_api_key=None, aisstream_api_key="ais-key"),
    )
    monkeypatch.setattr(jobs, "collect_ais_snapshot", lambda: calls.append("ais") or 1)
    monkeypatch.setattr(jobs, "collect_openmeteo", lambda: calls.append("openmeteo") or 2)
    monkeypatch.setattr(jobs, "collect_portwatch", lambda: calls.append("portwatch") or 3)
    monkeypatch.setattr(jobs, "scrape_bunker", lambda: calls.append("bunker") or 4)

    def fail_fbx() -> int:
        calls.append("fbx")
        raise RuntimeError("markup changed")

    monkeypatch.setattr(jobs, "scrape_fbx", fail_fbx)
    monkeypatch.setattr(jobs, "scrape_wci", lambda: calls.append("wci") or 5)

    result = jobs.collect_all()

    assert result["fred"] == {
        "status": "disabled",
        "rows": 0,
        "error": "FRED_API_KEY is not configured",
    }
    assert result["fbx"] == {"status": "failed", "rows": 0, "error": "markup changed"}
    assert result["wci"] == {"status": "success", "rows": 5, "error": None}
    assert calls == ["ais", "openmeteo", "portwatch", "bunker", "fbx", "wci"]
