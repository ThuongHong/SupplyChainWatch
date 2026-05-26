from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from pydantic import BaseModel, ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.analysis.maritime_risk import (
    compute_disruption_propagation,
    deterministic_risk_text,
    economic_pressure_context,
    weather_route_impact,
)
from app.analysis.vessel_monitoring import course_delta_degrees, eta_drift_minutes
from app.api.routes.risk import monitored_entity_detail, watched_vessel_eta_drift
from app.collectors.base import BaseCollector
from app.collectors.portwatch import PortWatchCollector, normalize_feature
from app.db.models import CollectionLog
from app.schemas.records import PortWatchMetricRecord
from app.services.enrichment import enrich_watchlist_vessel
from app.services.watchlist import MAJOR_ROUTE_RULES
from app.tasks import jobs


class BadPortWatchCollector(BaseCollector[BaseModel]):
    source = "portwatch"
    record_model = PortWatchCollector.record_model

    def collect(self) -> list[dict[str, object]]:
        return [{"entity_id": "port-sgsin"}]


def sqlite_collection_session() -> Any:
    engine = create_engine("sqlite:///:memory:")
    CollectionLog.__table__.create(engine)
    return sessionmaker(bind=engine)()


def test_portwatch_collector_success_logs_collection() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.params.get("returnCountOnly") == "true":
            return httpx.Response(200, request=request, json={"count": 0})
        payload = {
            "features": [
                {
                    "attributes": {
                        "portid": "SGSIN",
                        "portname": "Singapore",
                        "date": "2026-05-20",
                        "portcalls": 120,
                    }
                }
            ]
        }
        return httpx.Response(200, request=request, json=payload)

    db = sqlite_collection_session()
    client = httpx.Client(transport=httpx.MockTransport(handler))

    records = PortWatchCollector(client=client, use_portid_filter=False).run(db=db)
    log = db.query(CollectionLog).one()

    assert len(records) == 2
    assert records[0].entity_id == "port-sgsin"
    assert log.source == "portwatch"
    assert log.status == "success"
    assert log.rows_collected == 2


def test_portwatch_collector_fetches_recent_object_ids() -> None:
    requested_ids: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.params.get("returnCountOnly") == "true":
            return httpx.Response(200, request=request, json={"count": 205})
        requested_ids.append(request.url.params.get("objectIds", ""))
        payload = {
            "features": [
                {
                    "attributes": {
                        "portid": "SGSIN",
                        "portname": "Singapore",
                        "date": "2026-05-20",
                        "portcalls": 120,
                    }
                }
            ]
        }
        return httpx.Response(200, request=request, json=payload)

    client = httpx.Client(transport=httpx.MockTransport(handler))

    records = PortWatchCollector(client=client, use_portid_filter=False).run()

    assert records
    assert requested_ids
    assert requested_ids[0].startswith("6,7,8")


def test_portwatch_collector_uses_portid_filter() -> None:
    requested_params: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
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
        requested_params.append(dict(request.url.params))
        payload = {
            "features": [
                {
                    "attributes": {
                        "portid": "port1201",
                        "portname": "Singapore",
                        "date": "2026-05-20",
                        "portcalls": 120,
                    }
                }
            ]
        }
        return httpx.Response(200, request=request, json=payload)

    client = httpx.Client(transport=httpx.MockTransport(handler))

    records = PortWatchCollector(client=client, use_portid_filter=True).run()

    assert records
    assert len(requested_params) == 2
    assert "portid IN" in requested_params[0]["where"]
    assert "port1201" in requested_params[0]["where"]
    assert "port1188" in requested_params[0]["where"]
    assert "port2027" in requested_params[0]["where"]
    assert "port1114" in requested_params[0]["where"]
    assert "port664" in requested_params[0]["where"]
    assert "date >= " in requested_params[0]["where"]
    assert "chokepoint1" in requested_params[1]["where"]
    assert "chokepoint2" in requested_params[1]["where"]
    assert "chokepoint3" in requested_params[1]["where"]
    assert "chokepoint4" in requested_params[1]["where"]
    assert "chokepoint5" in requested_params[1]["where"]
    assert "chokepoint28" in requested_params[1]["where"]


def test_portwatch_collector_uses_layer_metadata_for_stable_pagination() -> None:
    requested_query_params: list[dict[str, Any]] = []
    metadata_paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if not str(request.url).split("?")[0].endswith("/query"):
            metadata_paths.append(request.url.path)
            return httpx.Response(
                200,
                request=request,
                json={
                    "objectIdField": "ObjectId",
                    "maxRecordCount": 25,
                    "advancedQueryCapabilities": {
                        "supportsPagination": True,
                        "supportsOrderBy": True,
                    },
                    "fields": [
                        {"name": "ObjectId", "type": "esriFieldTypeOID"},
                        {"name": "date", "type": "esriFieldTypeDateOnly"},
                        {"name": "portid", "type": "esriFieldTypeString"},
                        {"name": "portcalls", "type": "esriFieldTypeInteger"},
                    ],
                    "dateFieldsTimeReference": {"timeZone": "UTC"},
                },
            )

        requested_query_params.append(dict(request.url.params))
        payload = {"features": []}
        if "Daily_Ports_Data" in str(request.url):
            payload = {
                "features": [
                    {
                        "attributes": {
                            "portid": "port1201",
                            "portname": "Singapore",
                            "date": "2026-05-20",
                            "portcalls": 120,
                        }
                    }
                ]
            }
        return httpx.Response(200, request=request, json=payload)

    client = httpx.Client(transport=httpx.MockTransport(handler))

    records = PortWatchCollector(client=client, use_portid_filter=True).run()

    assert records
    assert metadata_paths
    assert requested_query_params[0]["resultRecordCount"] == "25"
    assert requested_query_params[0]["orderByFields"] == "ObjectId ASC"


def test_portwatch_matches_known_source_id_without_display_name() -> None:
    rows = normalize_feature(
        {
            "attributes": {
                "portid": "port1201",
                "date": "2026-05-20",
                "portcalls": 120,
            }
        },
        entity_hint="port",
        source="portwatch_ports",
    )

    assert rows
    assert rows[0]["entity_id"] == "port-sgsin"
    assert rows[0]["entity_name"] == "Singapore"


def test_portwatch_matches_bab_el_mandeb_dash_variant() -> None:
    rows = normalize_feature(
        {
            "attributes": {
                "portid": "chokepoint3",
                "portname": "Bab el-Mandeb Strait",
                "date": "2026-05-20",
                "n_total": 76,
            }
        },
        entity_hint="chokepoint",
        source="portstraitwatch_chokepoints",
    )

    assert rows
    assert rows[0]["entity_id"] == "region-red-sea"
    assert rows[0]["entity_name"] == "Red Sea"


def test_portwatch_collector_aggregates_duplicate_normalized_metrics() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.params.get("returnCountOnly") == "true":
            return httpx.Response(200, request=request, json={"count": 0})
        if "Daily_Ports_Data" not in str(request.url):
            return httpx.Response(200, request=request, json={"features": []})
        return httpx.Response(
            200,
            request=request,
            json={
                "features": [
                    {
                        "attributes": {
                            "portid": "port1188",
                            "date": "2026-05-20",
                            "portcalls": 7,
                        }
                    },
                    {
                        "attributes": {
                            "portid": "port2027",
                            "date": "2026-05-20",
                            "portcalls": 11,
                        }
                    },
                ]
            },
        )

    client = httpx.Client(transport=httpx.MockTransport(handler))

    records = PortWatchCollector(client=client, use_portid_filter=True).run()

    assert len(records) == 1
    assert records[0].entity_id == "port-cnsha"
    assert records[0].metric_name == "portcalls"
    assert records[0].metric_value == pytest.approx(18)
    assert records[0].metadata["source_entity_ids"] == ["port1188", "port2027"]


class FakePortWatchPersistenceDb:
    def __init__(self) -> None:
        self.added: list[Any] = []
        self.merged: list[Any] = []
        self.commits = 0

    def add(self, row: Any) -> None:
        self.added.append(row)

    def merge(self, row: Any) -> None:
        self.merged.append(row)

    def commit(self) -> None:
        self.commits += 1


def test_portwatch_metric_persistence_uses_merge_for_overlapping_rows() -> None:
    observed_at = datetime(2026, 5, 20, tzinfo=UTC)
    first = PortWatchMetricRecord(
        observed_at=observed_at,
        entity_type="port",
        entity_id="port-cnsha",
        entity_name="Shanghai",
        metric_name="portcalls",
        metric_value=7,
        unit="count",
        source="portwatch_ports",
        source_entity_id="port1188",
        metadata={"source_contract": "arcgis_featureserver"},
    )
    updated = first.model_copy(update={"metric_value": 11})
    db = FakePortWatchPersistenceDb()

    jobs._persist_records([first, updated], db)

    assert db.added == []
    assert len(db.merged) == 2
    assert [row.metric_value for row in db.merged] == [7, 11]
    assert db.commits == 1


def test_portwatch_collector_unavailable_uses_demo_fallback() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, request=request, json={"error": "unavailable"})

    client = httpx.Client(transport=httpx.MockTransport(handler))

    records = PortWatchCollector(
        client=client,
        max_retries=1,
        use_demo_fallback=True,
        use_portid_filter=False,
    ).run()

    assert records
    assert records[0].source == "portwatch_demo"


def test_portwatch_malformed_records_log_failure() -> None:
    db = sqlite_collection_session()

    with pytest.raises(ValidationError):
        BadPortWatchCollector().run(db=db)

    log = db.query(CollectionLog).one()
    assert log.status == "failed"
    assert log.rows_collected == 0
    assert log.error


def test_watchlist_route_rules_cover_major_trade_routes() -> None:
    assert MAJOR_ROUTE_RULES["asia_europe"][0] == "cp-suez"
    assert MAJOR_ROUTE_RULES["trans_pacific"][0] == "port-uslax"
    assert MAJOR_ROUTE_RULES["asia_feeder"][0] == "cp-malacca"


def test_vessel_anomaly_helpers_for_eta_and_route_deviation() -> None:
    assert eta_drift_minutes(3.0) == pytest.approx(90.0)
    assert course_delta_degrees(350, 10) == pytest.approx(20.0)
    assert course_delta_degrees(90, 10) == pytest.approx(80.0)


def test_risk_helper_context_and_deterministic_fallback_text() -> None:
    weather = weather_route_impact(wave_m=4.0, wind_kph=60.0)
    economic = economic_pressure_context({"FBX": 8.0, "WCI": -2.0})
    text = deterministic_risk_text("Singapore", 82, ["traffic anomaly at 80/100"])

    assert weather["severity"] == "medium"
    assert economic["score"] == pytest.approx(50.0)
    assert "Singapore risk score is 82/100" in text


class FakePropagationDb:
    def __init__(self) -> None:
        self.added: list[Any] = []

    def execute(self, statement: Any, params: dict[str, object] | None = None) -> Any:
        return FakeResult(
            [
                {
                    "entity_id": "cp-suez",
                    "entity_name": "Suez Canal",
                    "score": 86,
                    "severity": "high",
                    "source_metrics": {"n_total": 120},
                    "as_of": datetime.now(UTC),
                }
            ]
        )

    def add(self, row: Any) -> None:
        self.added.append(row)

    def commit(self) -> None:
        return None


class FakeResult:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def mappings(self) -> FakeResult:
        return self

    def __iter__(self) -> object:
        return iter(self.rows)

    def all(self) -> list[dict[str, Any]]:
        return self.rows

    def first(self) -> dict[str, Any] | None:
        return self.rows[0] if self.rows else None


def test_disruption_propagation_creates_downstream_record() -> None:
    db = FakePropagationDb()

    created = compute_disruption_propagation(db)  # type: ignore[arg-type]

    assert created == 1
    assert db.added[0].target_entity_id == "port-nlrtm"


class FakeQuery:
    def __init__(self, cached: object | None) -> None:
        self.cached = cached

    def filter(self, *args: object) -> FakeQuery:
        return self

    def order_by(self, *args: object) -> FakeQuery:
        return self

    def one_or_none(self) -> object | None:
        return self.cached


class FakeEnrichmentDb:
    def __init__(self, cached: object | None = None) -> None:
        self.cached = cached
        self.merged: list[object] = []

    def query(self, model: object) -> FakeQuery:
        return FakeQuery(self.cached)

    def merge(self, row: object) -> None:
        self.merged.append(row)

    def commit(self) -> None:
        return None


class CountingProvider:
    source = "test_provider"

    def __init__(self) -> None:
        self.calls = 0

    def fetch(self, mmsi: int) -> dict[str, object]:
        self.calls += 1
        return {"mmsi": mmsi, "operator": "Demo Line"}


def test_enrichment_cache_hit_skips_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    cached = object()
    db = FakeEnrichmentDb(cached=cached)
    provider = CountingProvider()
    monkeypatch.setattr(
        "app.services.enrichment.get_settings",
        lambda: type("S", (), {"enrichment_provider_enabled": True})(),
    )

    result = enrich_watchlist_vessel(db, mmsi=123456789, provider=provider)  # type: ignore[arg-type]

    assert result is cached
    assert provider.calls == 0


def test_enrichment_provider_disabled_records_status(monkeypatch: pytest.MonkeyPatch) -> None:
    db = FakeEnrichmentDb()
    provider = CountingProvider()
    monkeypatch.setattr(
        "app.services.enrichment.get_settings",
        lambda: type("S", (), {"enrichment_provider_enabled": False})(),
    )

    result = enrich_watchlist_vessel(db, mmsi=123456789, provider=provider)  # type: ignore[arg-type]

    assert result.status == "provider_disabled"
    assert provider.calls == 0
    assert db.merged


class FakeAsyncDb:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    async def execute(self, statement: Any, params: dict[str, object] | None = None) -> FakeResult:
        return FakeResult(self.rows)


class FakeResponse:
    def __init__(self) -> None:
        self.headers: dict[str, str] = {}


def test_api_missing_entity_returns_empty_state() -> None:
    response = FakeResponse()

    payload = asyncio.run(monitored_entity_detail("missing", response, FakeAsyncDb([])))  # type: ignore[arg-type]

    assert payload["freshness_status"] == "empty"
    assert response.headers["Cache-Control"] == "public, max-age=60"


def test_api_eta_drift_missing_position_returns_empty_context() -> None:
    response = FakeResponse()

    payload = asyncio.run(watched_vessel_eta_drift(123456789, response, FakeAsyncDb([])))  # type: ignore[arg-type]

    assert payload["eta_drift_minutes"] is None
    assert payload["confidence"] == 0


def test_api_eta_drift_success_context() -> None:
    response = FakeResponse()
    rows = [{"sog": 3.0, "entity_id": "port-sgsin", "reason": "Near high-risk port"}]

    payload = asyncio.run(watched_vessel_eta_drift(123456789, response, FakeAsyncDb(rows)))  # type: ignore[arg-type]

    assert payload["eta_drift_minutes"] == 90
    assert payload["confidence"] == 0.65
