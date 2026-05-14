from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import PaginationParams, pagination_params
from app.api.routes.helpers import row_to_dict, rows_to_dicts
from app.db.session import get_async_db
from app.schemas.api import ForecastResponse, IndexPoint, IndexSummary
from app.utils.cache import get_cached_json, set_cached_json

router = APIRouter(prefix="/indices", tags=["indices"])


@router.get("", response_model=list[IndexSummary])
async def list_indices(
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> list[dict[str, object]]:
    result = await db.execute(text("""
            SELECT
                index_name,
                COUNT(*)::int AS points,
                MIN(time) AS first_time,
                MAX(time) AS last_time
            FROM freight_indices
            GROUP BY index_name
            ORDER BY index_name
            """))
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/{name}", response_model=list[IndexPoint])
async def get_index_history(
    name: str,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    pagination: Annotated[PaginationParams, Depends(pagination_params)],
    from_time: Annotated[datetime | None, Query(alias="from")] = None,
    to_time: Annotated[datetime | None, Query(alias="to")] = None,
) -> list[dict[str, object]]:
    cache_key = f"indices:{name}:{from_time}:{to_time}:{pagination.limit}:{pagination.offset}"
    cached = await get_cached_json(cache_key)
    if cached is not None:
        return cached

    result = await db.execute(
        text("""
            SELECT time, index_name, value, source, metadata
            FROM freight_indices
            WHERE index_name = :name
              AND (:from_time IS NULL OR time >= :from_time)
              AND (:to_time IS NULL OR time <= :to_time)
            ORDER BY time
            LIMIT :limit OFFSET :offset
            """),
        {
            "name": name,
            "from_time": from_time,
            "to_time": to_time,
            "limit": pagination.limit,
            "offset": pagination.offset,
        },
    )
    rows = rows_to_dicts(list(result.mappings().all()))
    await set_cached_json(cache_key, rows)
    return rows


@router.get("/{name}/forecast", response_model=ForecastResponse)
async def get_index_forecast(
    name: str,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> dict[str, object]:
    result = await db.execute(
        text("""
            SELECT id, created_at, index_name, horizon_days, predictions, metrics,
                   model_name, model_params, commentary
            FROM forecasts
            WHERE index_name = :name
            ORDER BY created_at DESC
            LIMIT 1
            """),
        {"name": name},
    )
    row = row_to_dict(result.mappings().first())
    if row is None:
        raise HTTPException(status_code=404, detail="Forecast not found")
    return row
