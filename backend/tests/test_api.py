from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint() -> None:
    client = TestClient(app)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_openapi_exposes_week2_routes() -> None:
    client = TestClient(app)

    schema = client.get("/openapi.json").json()
    paths = schema["paths"]

    assert "/api/indices" in paths
    assert "/api/vessels/snapshot" in paths
    assert "/api/ports/congestion" in paths
    assert "/api/chokepoints" in paths
    assert "/api/insights/latest" in paths
    assert "/api/correlations" in paths
    assert "/api/story/analyze" in paths
