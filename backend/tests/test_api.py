from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from app.api.routes.insights import latest_insights
from app.api.routes.health import health
from app.main import app


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
    response = asyncio.run(health())

    assert response["status"] == "ok"


def test_openapi_exposes_week2_routes() -> None:
    schema = app.openapi()
    paths = schema["paths"]

    assert "/api/indices" in paths
    assert "/api/vessels/snapshot" in paths
    assert "/api/ports/congestion" in paths
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


def test_latest_insights_returns_risk_story_fields() -> None:
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
