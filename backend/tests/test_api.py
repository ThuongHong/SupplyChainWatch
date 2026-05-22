from __future__ import annotations

import asyncio

from app.api.routes.health import health
from app.main import app


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
    assert "/api/risk/watchlist" in paths
    assert "/api/risk/watchlist/{mmsi}/positions" in paths
    assert "/api/risk/watchlist/{mmsi}/enrichment" in paths
    assert "/api/risk/watchlist/{mmsi}/anomalies" in paths
    assert "/api/risk/watchlist/{mmsi}/eta-drift" in paths
