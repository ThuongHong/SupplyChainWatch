from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.helpers import rows_to_dicts
from app.db.session import get_async_db
from app.schemas.api import PortCongestionResponse, PortResponse

router = APIRouter(prefix="/ports", tags=["ports"])


@router.get("", response_model=list[PortResponse])
async def list_ports(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    region: Annotated[str | None, Query()] = None,
) -> list[dict[str, object]]:
    result = await db.execute(
        text("""
            SELECT id, locode, name, country, region,
                   ST_Y(geom::geometry) AS lat,
                   ST_X(geom::geometry) AS lon,
                   radius_km,
                   twenty_ft_eq_units_year
            FROM ports
            WHERE (CAST(:region AS TEXT) IS NULL OR region = :region)
            ORDER BY twenty_ft_eq_units_year DESC NULLS LAST, name
            """),
        {"region": region},
    )
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/congestion", response_model=list[PortCongestionResponse])
async def current_port_congestion(
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> list[dict[str, object]]:
    result = await db.execute(text("""
            SELECT DISTINCT ON (pc.port_id)
                   pc.time, pc.port_id, p.name AS port_name,
                   pc.anchored_count, pc.moored_count, pc.underway_count,
                   pc.total_in_area, pc.avg_dwell_hours, pc.median_speed,
                   pw_total.metric_value::int AS portwatch_n_total,
                   pw_portcalls.metric_value::int AS portwatch_portcalls
            FROM port_congestion pc
            JOIN ports p ON p.id = pc.port_id
            LEFT JOIN LATERAL (
                SELECT pm.metric_value
                FROM portwatch_metrics pm
                WHERE pm.metric_name = 'daily_vessel_calls'
                  AND pm.entity_name = p.name
                ORDER BY pm.observed_at DESC
                LIMIT 1
            ) pw_total ON TRUE
            LEFT JOIN LATERAL (
                SELECT pm.metric_value
                FROM portwatch_metrics pm
                WHERE pm.metric_name = 'portcalls'
                  AND pm.entity_name = p.name
                ORDER BY pm.observed_at DESC
                LIMIT 1
            ) pw_portcalls ON TRUE
            ORDER BY pc.port_id, pc.time DESC
            """))
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/{port_id}/timeline", response_model=list[PortCongestionResponse])
async def port_congestion_timeline(
    port_id: int,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    days: Annotated[int, Query(ge=1, le=365)] = 30,
) -> list[dict[str, object]]:
    result = await db.execute(
        text("""
            SELECT pc.time, pc.port_id, p.name AS port_name,
                   pc.anchored_count, pc.moored_count, pc.underway_count,
                   pc.total_in_area, pc.avg_dwell_hours, pc.median_speed
            FROM port_congestion pc
            JOIN ports p ON p.id = pc.port_id
            WHERE pc.port_id = :port_id
              AND pc.time >= NOW() - (:days * INTERVAL '1 day')
            ORDER BY pc.time
            """),
        {"port_id": port_id, "days": days},
    )
    return rows_to_dicts(list(result.mappings().all()))
