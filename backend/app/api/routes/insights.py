from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.correlation import correlation_matrix
from app.api.routes.helpers import rows_to_dicts
from app.db.session import get_async_db
from app.schemas.api import AnomalyResponse, CorrelationCell, InsightResponse
from app.utils.cache import get_cached_json, set_cached_json

router = APIRouter(tags=["insights"])


@router.get("/anomalies", response_model=list[AnomalyResponse])
async def list_anomalies(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    days: Annotated[int, Query(ge=1, le=365)] = 30,
    severity: Annotated[str | None, Query()] = None,
) -> list[dict[str, object]]:
    result = await db.execute(
        text("""
            SELECT id, detected_at, entity_type, entity_id, severity, metric,
                   observed, expected, z_score, description, explanation, acknowledged
            FROM anomalies
            WHERE detected_at >= NOW() - (:days * INTERVAL '1 day')
              AND (:severity IS NULL OR severity = :severity)
            ORDER BY detected_at DESC
            LIMIT 500
            """),
        {"days": days, "severity": severity},
    )
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/insights/latest", response_model=list[InsightResponse])
async def latest_insights(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[dict[str, object]]:
    result = await db.execute(
        text("""
            SELECT id, generated_at, category, title, narrative, narrative_llm,
                   narrative_model, narrative_generated_at, metrics, priority
            FROM insights
            ORDER BY priority DESC, generated_at DESC
            LIMIT :limit
            """),
        {"limit": limit},
    )
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/correlations", response_model=list[CorrelationCell])
async def correlations(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    indices: Annotated[str, Query(description="Comma-separated index names")],
    days: Annotated[int, Query(ge=14, le=1095)] = 180,
) -> list[dict[str, object]]:
    names = [name.strip() for name in indices.split(",") if name.strip()]
    cache_key = f"correlations:{','.join(names)}:{days}"
    cached = await get_cached_json(cache_key)
    if cached is not None:
        return cached

    result = await db.execute(
        text("""
            SELECT DATE_TRUNC('day', time) AS day, index_name, AVG(value)::float AS value
            FROM freight_indices
            WHERE index_name = ANY(:names)
              AND time >= NOW() - (:days * INTERVAL '1 day')
            GROUP BY day, index_name
            ORDER BY day
            """),
        {"names": names, "days": days},
    )
    series: dict[str, dict[str, float]] = {name: {} for name in names}
    for row in result.mappings().all():
        series[str(row["index_name"])][str(row["day"].date())] = float(row["value"])
    matrix = correlation_matrix(series)
    await set_cached_json(cache_key, matrix)
    return matrix
