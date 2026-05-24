from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.helpers import rows_to_dicts
from app.db.session import get_async_db
from app.schemas.api import ChokepointResponse, ChokepointTimelinePoint

router = APIRouter(prefix="/chokepoints", tags=["chokepoints"])


@router.get("", response_model=list[ChokepointResponse])
async def list_chokepoints(
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> list[dict[str, object]]:
    result = await db.execute(text("""
            SELECT c.id, c.name, latest.time,
                   COALESCE(
                       CASE WHEN COALESCE(latest.vessel_count, 0) > 0 THEN latest.vessel_count ELSE NULL END,
                       pw_latest.metric_value::int
                   ) AS vessel_count,
                   latest.median_speed,
                   latest.risk_score
            FROM chokepoints c
            LEFT JOIN LATERAL (
                SELECT cs.time, cs.vessel_count, cs.median_speed, cs.risk_score
                FROM chokepoint_status cs
                WHERE cs.chokepoint_id = c.id
                ORDER BY cs.time DESC
                LIMIT 1
            ) latest ON TRUE
            LEFT JOIN LATERAL (
                SELECT pm.metric_value
                FROM portwatch_metrics pm
                WHERE pm.entity_name = c.name
                  AND pm.metric_name = 'n_total'
                ORDER BY pm.observed_at DESC
                LIMIT 1
            ) pw_latest ON TRUE
            ORDER BY c.name
            """))
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/{chokepoint_id}/timeline", response_model=list[ChokepointTimelinePoint])
async def chokepoint_timeline(
    chokepoint_id: int,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    days: Annotated[int, Query(ge=1, le=365)] = 30,
) -> list[dict[str, object]]:
    result = await db.execute(
        text("""
            SELECT time, chokepoint_id, vessel_count, median_speed, risk_score
            FROM chokepoint_status
            WHERE chokepoint_id = :chokepoint_id
              AND time >= NOW() - (:days * INTERVAL '1 day')
            ORDER BY time
            """),
        {"chokepoint_id": chokepoint_id, "days": days},
    )
    return rows_to_dicts(list(result.mappings().all()))
