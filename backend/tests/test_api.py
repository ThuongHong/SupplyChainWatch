from __future__ import annotations

import asyncio
import inspect
from datetime import UTC, datetime, timedelta

from app.api.routes.health import health
from app.api.routes.insights import latest_insights
from app.api.routes.sync import force_sync, sync_status
from app.main import app


class FakeMappings:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def all(self) -> list[dict[str, object]]:
        return self.rows

    def first(self) -> dict[str, object] | None:
        return self.rows[0] if self.rows else None


class FakeResult:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def mappings(self) -> FakeMappings:
        return FakeMappings(self.rows)


class FakeInsightsDb:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows
        self.params: dict[str, object] | None = None
        self.statement = ""

    async def execute(self, statement: object, params: dict[str, object]) -> FakeResult:
        self.statement = str(statement)
        self.params = params
        return FakeResult(self.rows)


def test_health_endpoint() -> None:
    # (keeps original)
    response = asyncio.run(health())

    assert response["status"] == "ok"


def test_force_sync_returns_task_id(monkeypatch: object) -> None:
    class FakeTask:
        id = "task-123"

    class FakeCollectAll:
        @staticmethod
        def delay() -> FakeTask:
            return FakeTask()

    monkeypatch.setattr("app.api.routes.sync.collect_all", FakeCollectAll)

    payload = asyncio.run(force_sync())

    assert payload == {"status": "queued", "task_id": "task-123"}


def test_sync_status_reports_celery_state(monkeypatch: object) -> None:
    class FakeResult:
        status = "SUCCESS"
        result = {"portwatch": {"status": "success", "rows": 10, "error": None}}

        @staticmethod
        def ready() -> bool:
            return True

        @staticmethod
        def successful() -> bool:
            return True

        @staticmethod
        def failed() -> bool:
            return False

    def fake_async_result(task_id: str) -> FakeResult:
        assert task_id == "task-123"
        return FakeResult()

    monkeypatch.setattr("app.api.routes.sync.collect_all.AsyncResult", fake_async_result)

    payload = asyncio.run(sync_status("task-123"))

    assert payload == {
        "task_id": "task-123",
        "status": "success",
        "ready": True,
        "successful": True,
        "error": None,
    }


def test_openapi_exposes_week2_routes() -> None:
    # (keeps original)
    schema = app.openapi()
    paths = schema["paths"]

    assert "/api/indices" in paths
    assert "/api/vessels/snapshot" in paths
    assert "/api/ports/congestion" in paths
    assert "/api/ports/activity" in paths
    assert "/api/ports/comparison" in paths
    assert "/api/chokepoints" in paths
    assert "/api/insights/latest" in paths
    assert "/api/correlations" in paths
    assert "/api/story/analyze" in paths
    assert "/api/risk/ports" in paths
    assert "/api/risk/chokepoints" in paths
    assert "/api/risk/propagation" in paths
    assert "/api/risk/coverage" in paths
    assert "/api/risk/entities/{entity_id}/history" in paths
    assert "/api/risk/stories" in paths
    assert "/api/risk/entities/{entity_id}/forecast" in paths
    assert "/api/risk/watchlist" in paths
    assert "/api/risk/watchlist/{mmsi}/positions" in paths
    assert "/api/risk/watchlist/{mmsi}/enrichment" in paths
    assert "/api/risk/watchlist/{mmsi}/anomalies" in paths
    assert "/api/risk/watchlist/{mmsi}/eta-drift" in paths
    assert "/api/ports/{port_id}/switch_recommendation" in paths


def test_latest_insights_returns_risk_story_fields() -> None:
    # (keeps original)
    rows = [
        {
            "id": 1,
            "generated_at": datetime(2026, 5, 23, tzinfo=UTC),
            "category": "risk_story",
            "title": "Singapore risk worsening",
            "narrative": "Singapore risk rose to 82/100.",
            "narrative_llm": None,
            "narrative_model": None,
            "narrative_generated_at": None,
            "metrics": {"z_score": 3.2},
            "priority": 9,
            "event_type": "risk_worsening",
            "confidence": 0.87,
            "affected_entities": [{"type": "port", "id": "port-sgsin", "name": "Singapore"}],
            "source_metrics": {"daily_vessel_calls": 150},
            "attention_level": "urgent",
        }
    ]
    db = FakeInsightsDb(rows)

    payload = asyncio.run(latest_insights(db, limit=5))  # type: ignore[arg-type]

    assert db.params == {"limit": 5}
    assert "ROW_NUMBER() OVER" in db.statement
    assert "WHERE duplicate_rank = 1" in db.statement
    assert "event_type, confidence, affected_entities" in db.statement
    assert payload[0]["event_type"] == "risk_worsening"
    assert payload[0]["confidence"] == 0.87
    assert payload[0]["attention_level"] == "urgent"
    assert payload[0]["affected_entities"] == [
        {"type": "port", "id": "port-sgsin", "name": "Singapore"}
    ]


def test_anomalies_endpoint_with_port_id() -> None:
    from app.api.routes.insights import list_anomalies

    now = datetime.now(UTC)
    rows = []
    # 7 baseline points plus 1 current point to satisfy the min 7 points history requirement
    for offset in range(8):
        rows.append(
            {
                "time": now - timedelta(days=7 - offset),
                "port_id": 2,
                "port_name": "Rotterdam",
                "metric_name": "portcalls",
                "value": 20,
            }
        )
    db = FakeInsightsDb(rows)
    payload = asyncio.run(list_anomalies(db, days=30, port_id=2))  # type: ignore[arg-type]

    assert len(payload) == 1
    assert payload[0]["port_name"] == "Rotterdam"
    assert payload[0]["port_id"] == 2
    assert payload[0]["severity"] == "low"


def test_port_activity_endpoint() -> None:
    from app.api.routes.ports import port_activity

    now = datetime.now(UTC)
    rows = [
        {
            "port_id": 1,
            "port_name": "Singapore",
            "time": now,
            "metric_name": "vessel_count",
            "value": 120.0
        }
    ]
    db = FakeInsightsDb(rows)
    payload = asyncio.run(port_activity(db, port_id=1, days=30))  # type: ignore[arg-type]

    assert len(payload) == 1
    assert payload[0]["port_name"] == "Singapore"
    assert payload[0]["value"] == 120.0


def test_port_comparison_endpoint() -> None:
    from app.api.routes.ports import port_comparison

    rows = [
        {
            "port_id": 1,
            "port_name": "Singapore",
            "metric_name": "vessel_count",
            "value": 120.0
        }
    ]
    db = FakeInsightsDb(rows)
    payload = asyncio.run(port_comparison(db, days=30, metric="vessel_count"))  # type: ignore[arg-type]

    assert len(payload) == 1
    assert payload[0]["port_name"] == "Singapore"
    assert payload[0]["value"] == 120.0



def test_get_switch_recommendation_contract(monkeypatch: object) -> None:
    from app.analysis.port_switch import PortPressure, SwitchRecommendation
    from app.api.routes.ports import get_port_switch_recommendation

    class FakeSwitchDb:
        async def execute(self, statement: object, params: dict[str, object]) -> FakeResult:
            assert params == {"port_id": 10}
            return FakeResult([{"locode": "CNSHA"}])

        async def run_sync(self, fn: object) -> SwitchRecommendation:
            return fn(self)  # type: ignore[misc]

    now = datetime(2026, 5, 23, tzinfo=UTC)
    source = PortPressure(
        entity_id="port-cnsha",
        entity_name="Shanghai",
        port_id=10,
        asof=now,
        latest_vessel_calls=159.0,
        latest_anomaly_index=2.8,
        slope_7d_pct=4.5,
        slope_30d_pct=4.8,
        baseline_60d_mean=129.5,
        z_score_30d=1.8,
        anomaly_flag=False,
        projection_7d=166.0,
        freshness_status="fresh",
    )
    substitute = PortPressure(
        entity_id="port-cnngb",
        entity_name="Ningbo-Zhoushan",
        port_id=20,
        asof=now,
        latest_vessel_calls=80.0,
        latest_anomaly_index=0.2,
        slope_7d_pct=0.0,
        slope_30d_pct=0.0,
        baseline_60d_mean=80.0,
        z_score_30d=None,
        anomaly_flag=False,
        projection_7d=80.0,
        freshness_status="fresh",
    )
    rec = SwitchRecommendation(
        source=source,
        substitutes=[substitute],
        recommendation=substitute,
        headline="Pressure at Shanghai: consider Ningbo-Zhoushan.",
        reason=None,
        generated_at=now,
    )

    async def fake_get_cached_json(key: str) -> object | None:
        assert key == "port_switch:10"
        return None

    async def fake_set_cached_json(key: str, value: object, ttl_seconds: int = 60) -> None:
        assert key == "port_switch:10"
        assert ttl_seconds == 60

    monkeypatch.setattr("app.api.routes.ports.get_cached_json", fake_get_cached_json)
    monkeypatch.setattr("app.api.routes.ports.set_cached_json", fake_set_cached_json)
    monkeypatch.setattr("app.api.routes.ports.recommend_switch", lambda db, entity_id: rec)

    payload = asyncio.run(
        get_port_switch_recommendation(10, FakeSwitchDb())  # type: ignore[arg-type]
    )

    assert payload["source"]["entity_id"] == "port-cnsha"
    assert payload["recommendation"]["entity_id"] == "port-cnngb"
    assert payload["substitutes"][0]["projection_7d"] == 80.0
    assert payload["headline"] == "Pressure at Shanghai: consider Ningbo-Zhoushan."
    assert payload["caveats"]

def test_portwatch_demo_rows_are_filtered_from_port_api_queries() -> None:
    from app.api.routes import ports

    checked_functions = [
        ports.current_port_congestion,
        ports.port_congestion_timeline,
        ports.port_activity,
        ports.port_comparison,
    ]

    for function in checked_functions:
        source = inspect.getsource(function)
        assert "portwatch_demo" in source


def test_portwatch_demo_rows_are_filtered_from_port_anomaly_queries() -> None:
    from app.analysis import anomaly

    checked_functions = [
        anomaly.compute_port_historical_anomalies,
        anomaly.compute_port_historical_anomalies_async,
    ]

    for function in checked_functions:
        source = inspect.getsource(function)
        assert "pm.source <> 'portwatch_demo'" in source


def test_port_anomaly_query_does_not_alias_trade_flow_as_physical_congestion() -> None:
    from app.analysis import anomaly

    source = inspect.getsource(anomaly.compute_port_historical_anomalies_async)

    assert "AS anchored_count" not in source
    assert "AS avg_dwell_hours" not in source
    assert "metric_name IN ('import'" not in source
    assert "metric_name IN ('export'" not in source
