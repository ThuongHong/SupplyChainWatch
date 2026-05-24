from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.helpers import rows_to_dicts
from app.db.session import get_async_db
from app.schemas.api import PortCongestionResponse, PortResponse, PortActivityItem, PortComparisonItem

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
                   -- Use AIS total_in_area when >0; fallback to PortWatch portcalls
                   CASE WHEN pc.total_in_area > 0 THEN pc.total_in_area
                        ELSE COALESCE(pw_portcalls.metric_value::int, 0)
                   END AS total_in_area,
                   pc.avg_dwell_hours, pc.median_speed,
                   NULL::int AS portwatch_n_total,
                   pw_portcalls.metric_value::int AS portwatch_portcalls
            FROM port_congestion pc
            JOIN ports p ON p.id = pc.port_id
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
    # Use AIS port_congestion if port has real non-zero vessel counts
    count_res = await db.execute(
        text("SELECT count(*) FROM port_congestion WHERE port_id = :port_id AND total_in_area > 0"),
        {"port_id": port_id},
    )
    ais_count = count_res.scalar() or 0

    if ais_count >= 10:
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
    else:
        # No valid AIS data — use real PortWatch portcalls time series
        result = await db.execute(
            text("""
                SELECT pm.observed_at AS time,
                       p.id AS port_id,
                       p.name AS port_name,
                       0 AS anchored_count,
                       0 AS moored_count,
                       0 AS underway_count,
                       pm.metric_value::int AS total_in_area,
                       NULL::real AS avg_dwell_hours,
                       NULL::real AS median_speed
                FROM portwatch_metrics pm
                JOIN ports p ON p.name = pm.entity_name
                WHERE p.id = :port_id
                  AND pm.metric_name = 'portcalls'
                  AND pm.observed_at >= NOW() - (:days * INTERVAL '1 day')
                ORDER BY pm.observed_at ASC
                """),
            {"port_id": port_id, "days": days},
        )
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/activity", response_model=list[PortActivityItem])
async def port_activity(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    port_id: Annotated[int | None, Query()] = None,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
    limit: Annotated[int | None, Query(ge=1)] = None,
) -> list[dict[str, object]]:
    sql = """
        SELECT p.id AS port_id, p.name AS port_name,
               pm.observed_at AS time,
               'vessel_count' AS metric_name,
               pm.metric_value AS value
        FROM portwatch_metrics pm
        JOIN ports p ON p.name = pm.entity_name
        WHERE pm.metric_name = ANY(:db_metrics)
          AND pm.observed_at >= NOW() - (:days * INTERVAL '1 day')
    """
    params: dict[str, object] = {"days": days, "db_metrics": ["n_total", "portcalls"]}
    if port_id is not None:
        sql += " AND p.id = :port_id"
        params["port_id"] = port_id

    sql += " ORDER BY pm.observed_at DESC"
    if limit is not None:
        sql += " LIMIT :limit"
        params["limit"] = limit

    result = await db.execute(text(sql), params)
    return rows_to_dicts(list(result.mappings().all()))


@router.get("/comparison", response_model=list[PortComparisonItem])
async def port_comparison(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    days: Annotated[int, Query(ge=1, le=365)] = 30,
    metric: Annotated[str, Query()] = "vessel_count",
) -> list[dict[str, object]]:
    db_metrics = ["n_total", "portcalls"]
    if metric == "portcalls":
        db_metrics = ["portcalls"]
    elif metric == "import":
        db_metrics = ["import"]
    elif metric == "export":
        db_metrics = ["export"]

    sql = """
        SELECT p.id AS port_id, p.name AS port_name,
               :metric AS metric_name,
               AVG(pm.metric_value) AS value
        FROM portwatch_metrics pm
        JOIN ports p ON p.name = pm.entity_name
        WHERE pm.metric_name = ANY(:db_metrics)
          AND pm.observed_at >= NOW() - (:days * INTERVAL '1 day')
        GROUP BY p.id, p.name
        ORDER BY value DESC
    """
    result = await db.execute(
        text(sql),
        {"days": days, "metric": metric, "db_metrics": db_metrics}
    )
    return rows_to_dicts(list(result.mappings().all()))
