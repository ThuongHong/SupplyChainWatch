from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.helpers import rows_to_dicts
from app.db.session import get_async_db
from app.schemas.api import (
    AnomalyResponse,
    DataCoverageResponse,
    DataFreshnessResponse,
    DisruptionPropagationResponse,
    EntityRiskForecastResponse,
    RiskEntityHistoryResponse,
    RiskScoreResponse,
    RiskStoryEventResponse,
    VesselEnrichmentResponse,
    VesselSnapshotItem,
    VesselWatchlistResponse,
)

router = APIRouter(prefix="/risk", tags=["risk"])


@router.get("/ports", response_model=list[RiskScoreResponse])
async def global_port_risk(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> list[dict[str, object]]:
    response.headers["Cache-Control"] = "public, max-age=60"
    result = await db.execute(
        text("""
            SELECT latest.entity_id,
                   latest.entity_name,
                   'port' AS entity_type,
                   latest.score,
                   latest.severity,
                   latest.component_scores,
                   latest.missing_components,
                   latest.reasons,
                   latest.source_metrics,
                   latest.freshness_status,
                   latest.as_of,
                   ST_Y(p.geom::geometry) AS lat,
                   ST_X(p.geom::geometry) AS lon
            FROM (
                SELECT DISTINCT ON (entity_id) *
                FROM port_risk_scores
                ORDER BY entity_id, time DESC
            ) latest
            LEFT JOIN ports p
              ON p.locode = upper(replace(latest.entity_id, 'port-', ''))
                 OR lower(p.name) = lower(latest.entity_name)
            ORDER BY latest.score DESC, latest.as_of DESC
            LIMIT :limit
            """),
        {"limit": limit},
    )
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/entities/{entity_id}", response_model=RiskScoreResponse)
async def monitored_entity_detail(
    entity_id: str,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> dict[str, object]:
    response.headers["Cache-Control"] = "public, max-age=60"
    result = await db.execute(
        text("""
            SELECT entity_id, entity_name, 'port' AS entity_type, score, severity,
                   component_scores, missing_components, reasons, source_metrics,
                   freshness_status, as_of, NULL::real AS lat, NULL::real AS lon
            FROM port_risk_scores
            WHERE entity_id = :entity_id
            UNION ALL
            SELECT entity_id, entity_name, 'chokepoint' AS entity_type, score, severity,
                   component_scores, missing_components, reasons, source_metrics,
                   freshness_status, as_of, NULL::real AS lat, NULL::real AS lon
            FROM chokepoint_risk_scores
            WHERE entity_id = :entity_id
            ORDER BY as_of DESC
            LIMIT 1
            """),
        {"entity_id": entity_id},
    )
    row = result.mappings().first()
    return (
        dict(row)
        if row
        else {
            "entity_id": entity_id,
            "entity_name": entity_id,
            "entity_type": "port",
            "score": 0,
            "severity": "low",
            "component_scores": {},
            "missing_components": ["portwatch_metrics"],
            "reasons": ["No risk score available for entity."],
            "source_metrics": {},
            "freshness_status": "empty",
            "as_of": "1970-01-01T00:00:00+00:00",
            "lat": None,
            "lon": None,
        }
    )


@router.get("/heatmap", response_model=list[RiskScoreResponse])
async def congestion_heatmap(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> list[dict[str, object]]:
    response.headers["Cache-Control"] = "public, max-age=60"
    return await global_port_risk(response, db, limit=100)


@router.get("/chokepoints", response_model=list[RiskScoreResponse])
async def chokepoint_stress(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> list[dict[str, object]]:
    response.headers["Cache-Control"] = "public, max-age=60"
    result = await db.execute(
        text("""
            SELECT latest.entity_id,
                   latest.entity_name,
                   CASE
                     WHEN latest.entity_id LIKE 'region-%' THEN 'region'
                     ELSE 'chokepoint'
                   END AS entity_type,
                   latest.score,
                   latest.severity,
                   latest.component_scores,
                   latest.missing_components,
                   latest.reasons,
                   latest.source_metrics,
                   latest.freshness_status,
                   latest.as_of,
                   NULL::real AS lat,
                   NULL::real AS lon
            FROM (
                SELECT DISTINCT ON (entity_id) *
                FROM chokepoint_risk_scores
                ORDER BY entity_id, time DESC
            ) latest
            ORDER BY latest.score DESC, latest.as_of DESC
            LIMIT :limit
            """),
        {"limit": limit},
    )
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/propagation", response_model=list[DisruptionPropagationResponse])
async def disruption_propagation(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> list[dict[str, object]]:
    response.headers["Cache-Control"] = "public, max-age=60"
    result = await db.execute(text("""
            SELECT id, source_entity_type, source_entity_id, source_entity_name,
                   target_entity_type, target_entity_id, target_entity_name, route_lane,
                   severity, confidence, explanation, source_metrics, started_at,
                   updated_at, status
            FROM disruption_propagation
            WHERE status = 'active'
            ORDER BY confidence DESC, updated_at DESC
            LIMIT 50
            """))
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/freshness", response_model=list[DataFreshnessResponse])
async def data_freshness(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> list[dict[str, object]]:
    response.headers["Cache-Control"] = "public, max-age=60"
    result = await db.execute(text("""
            SELECT source,
                   MAX(observed_at) AS latest_observed_at,
                   MAX(collected_at) AS latest_collected_at,
                   CASE
                     WHEN MAX(observed_at) IS NULL THEN 'empty'
                     WHEN MAX(observed_at) < NOW() - INTERVAL '72 hours' THEN 'stale'
                     WHEN MAX(observed_at) < NOW() - INTERVAL '30 hours' THEN 'aging'
                     ELSE 'fresh'
                   END AS freshness_status,
                   COUNT(*)::int AS rows
            FROM portwatch_metrics
            WHERE source <> 'portwatch_demo'
            GROUP BY source
            ORDER BY source
            """))
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/coverage", response_model=list[DataCoverageResponse])
async def risk_data_coverage(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    entity_id: str | None = None,
) -> list[dict[str, object]]:
    response.headers["Cache-Control"] = "public, max-age=60"
    result = await db.execute(
        text("""
            SELECT source, entity_type, entity_id, entity_name, first_observed_at,
                   latest_observed_at, observed_rows, expected_days, missing_days,
                   freshness_status, last_collection_status, updated_at, metadata
            FROM data_coverage
            WHERE (CAST(:entity_id AS TEXT) IS NULL OR entity_id = :entity_id)
            ORDER BY entity_type, entity_name, source
            """),
        {"entity_id": entity_id},
    )
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/entities/{entity_id}/history", response_model=RiskEntityHistoryResponse)
async def risk_entity_history(
    entity_id: str,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    days: Annotated[int, Query(ge=1, le=730)] = 180,
) -> dict[str, object]:
    response.headers["Cache-Control"] = "public, max-age=60"
    coverage_result = await db.execute(
        text("""
            SELECT source, entity_type, entity_id, entity_name, first_observed_at,
                   latest_observed_at, observed_rows, expected_days, missing_days,
                   freshness_status, last_collection_status, updated_at, metadata
            FROM data_coverage
            WHERE entity_id = :entity_id
            ORDER BY source
            """),
        {"entity_id": entity_id},
    )
    snapshot_result = await db.execute(
        text("""
            SELECT snapshot_date, entity_type, entity_id, entity_name, risk_score,
                   severity, feature_values, baseline_values, z_scores, deltas,
                   missing_features, source_freshness, driver_metadata,
                   feature_schema_version
            FROM risk_feature_snapshots
            WHERE entity_id = :entity_id
              AND snapshot_date >= CURRENT_DATE - (:days * INTERVAL '1 day')
            ORDER BY snapshot_date
            """),
        {"entity_id": entity_id, "days": days},
    )
    coverage = rows_to_dicts(list(coverage_result.mappings().all()))
    snapshots = rows_to_dicts(list(snapshot_result.mappings().all()))
    observed_days = len(snapshots)
    return {
        "entity_id": entity_id,
        "coverage": coverage,
        "snapshots": snapshots,
        "data_sufficiency": {
            "status": "sufficient" if observed_days >= 14 else "insufficient_history",
            "observed_days": observed_days,
            "minimum_days": 14,
            "missing_days": sum(int(row.get("missing_days") or 0) for row in coverage),
        },
    }


@router.get("/stories", response_model=list[RiskStoryEventResponse])
async def risk_story_timeline(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    entity_id: str | None = None,
    severity: str | None = None,
    event_type: str | None = None,
    days: Annotated[int, Query(ge=1, le=730)] = 180,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[dict[str, object]]:
    response.headers["Cache-Control"] = "public, max-age=60"
    result = await db.execute(
        text("""
            SELECT event_key, event_time, entity_type, entity_id, entity_name,
                   event_type, severity, metric, observed, expected, z_score,
                   percent_change, drivers, source_metrics, narrative, confidence,
                   attention_level, data_sufficiency
            FROM risk_story_events
            WHERE (CAST(:entity_id AS TEXT) IS NULL OR entity_id = :entity_id)
              AND (CAST(:severity AS TEXT) IS NULL OR severity = :severity)
              AND (CAST(:event_type AS TEXT) IS NULL OR event_type = :event_type)
              AND event_time >= NOW() - (:days * INTERVAL '1 day')
            ORDER BY event_time DESC
            LIMIT :limit
            """),
        {
            "entity_id": entity_id,
            "severity": severity,
            "event_type": event_type,
            "days": days,
            "limit": limit,
        },
    )
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/entities/{entity_id}/forecast", response_model=EntityRiskForecastResponse)
async def risk_entity_forecast(
    entity_id: str,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> dict[str, object]:
    response.headers["Cache-Control"] = "public, max-age=60"
    result = await db.execute(
        text("""
            SELECT forecast_key, created_at, entity_type, entity_id, entity_name,
                   horizon_days, predictions, confidence, train_window_start,
                   train_window_end, data_sufficiency_status, unavailable_reason,
                   key_drivers, metrics, model_name, model_params,
                   feature_schema_version
            FROM entity_risk_forecasts
            WHERE entity_id = :entity_id
            ORDER BY created_at DESC
            LIMIT 1
            """),
        {"entity_id": entity_id},
    )
    row = result.mappings().first()
    if row:
        return dict(row)
    return {
        "forecast_key": None,
        "entity_id": entity_id,
        "entity_name": None,
        "horizon_days": 0,
        "predictions": [],
        "confidence": 0,
        "data_sufficiency_status": "insufficient_history",
        "unavailable_reason": "no_forecast_rows",
        "key_drivers": [],
        "metrics": {},
    }


@router.get("/watchlist", response_model=list[VesselWatchlistResponse])
async def vessel_watchlist(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> list[dict[str, object]]:
    response.headers["Cache-Control"] = "public, max-age=30"
    result = await db.execute(text("""
            SELECT mmsi, reason, source_rule, priority, active, entity_type,
                   entity_id, expires_at, metadata
            FROM vessel_watchlist
            WHERE active IS TRUE AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY priority DESC, expires_at NULLS LAST
            """))
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/watchlist/{mmsi}/positions", response_model=list[VesselSnapshotItem])
async def watched_vessel_positions(
    mmsi: int,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    limit: Annotated[int, Query(ge=1, le=1000)] = 200,
) -> list[dict[str, object]]:
    response.headers["Cache-Control"] = "public, max-age=30"
    result = await db.execute(
        text("""
            SELECT vp.time, vp.mmsi, vp.lat, vp.lon, vp.sog, vp.cog, vp.nav_status,
                   v.name, v.type, v.type_label, v.flag
            FROM vessel_positions vp
            LEFT JOIN vessels v ON v.mmsi = vp.mmsi
            WHERE vp.mmsi = :mmsi
            ORDER BY vp.time DESC
            LIMIT :limit
            """),
        {"mmsi": mmsi, "limit": limit},
    )
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/watchlist/{mmsi}/enrichment", response_model=list[VesselEnrichmentResponse])
async def watched_vessel_enrichment(
    mmsi: int,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> list[dict[str, object]]:
    response.headers["Cache-Control"] = "public, max-age=300"
    result = await db.execute(
        text("""
            SELECT mmsi, source, fetched_at, expires_at, status, confidence, data, error
            FROM vessel_enrichment_cache
            WHERE mmsi = :mmsi
            ORDER BY fetched_at DESC
            LIMIT 10
            """),
        {"mmsi": mmsi},
    )
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/watchlist/{mmsi}/anomalies", response_model=list[AnomalyResponse])
async def watched_vessel_anomalies(
    mmsi: int,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> list[dict[str, object]]:
    response.headers["Cache-Control"] = "public, max-age=30"
    result = await db.execute(
        text("""
            SELECT id, detected_at, entity_type, entity_id, severity, metric,
                   observed, expected, z_score, description, explanation, acknowledged
            FROM anomalies
            WHERE entity_type = 'vessel'
              AND entity_id = CAST(:mmsi AS TEXT)
            ORDER BY detected_at DESC
            LIMIT 50
            """),
        {"mmsi": mmsi},
    )
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/watchlist/{mmsi}/eta-drift")
async def watched_vessel_eta_drift(
    mmsi: int,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> dict[str, object]:
    response.headers["Cache-Control"] = "public, max-age=30"
    result = await db.execute(
        text("""
            SELECT vp.time, vp.sog, vw.entity_id, vw.reason
            FROM vessel_positions vp
            JOIN vessel_watchlist vw ON vw.mmsi = vp.mmsi
            WHERE vp.mmsi = :mmsi
            ORDER BY vp.time DESC
            LIMIT 1
            """),
        {"mmsi": mmsi},
    )
    row = result.mappings().first()
    if row is None:
        return {
            "mmsi": mmsi,
            "eta_drift_minutes": None,
            "confidence": 0,
            "reasons": ["No watched-vessel position available."],
        }
    sog = float(row["sog"] or 0)
    drift = max(0, round((8.0 - sog) * 18))
    return {
        "mmsi": mmsi,
        "eta_drift_minutes": drift,
        "confidence": 0.65 if drift else 0.35,
        "entity_id": row["entity_id"],
        "reasons": [
            f"Latest speed {sog:.1f} kn",
            str(row["reason"]),
        ],
    }
