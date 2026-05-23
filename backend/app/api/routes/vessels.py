from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import PaginationParams, pagination_params
from app.api.routes.helpers import row_to_dict, rows_to_dicts
from app.db.session import get_async_db
from app.schemas.api import VesselDetail, VesselSnapshotItem
from app.utils.cache import get_cached_json, set_cached_json

router = APIRouter(prefix="/vessels", tags=["vessels"])


@router.get("/snapshot", response_model=list[VesselSnapshotItem])
async def get_vessel_snapshot(
    db: Annotated[AsyncSession, Depends(get_async_db)],
    pagination: Annotated[PaginationParams, Depends(pagination_params)],
    bbox: Annotated[str | None, Query(description="min_lon,min_lat,max_lon,max_lat")] = None,
    vessel_type: Annotated[int | None, Query(alias="type")] = None,
) -> list[dict[str, object]]:
    min_lon, min_lat, max_lon, max_lat = _parse_bbox(bbox)
    cache_key = (
        f"vessels:snapshot:{min_lon}:{min_lat}:{max_lon}:{max_lat}:"
        f"{vessel_type}:{pagination.limit}:{pagination.offset}"
    )
    cached = await get_cached_json(cache_key)
    if cached is not None:
        return cached

    result = await db.execute(
        text("""
            WITH latest AS (
                SELECT MAX(time) AS snapshot_time FROM vessel_positions
            ),
            latest_positions AS (
                SELECT DISTINCT ON (vp.mmsi) vp.*
                FROM vessel_positions vp
                CROSS JOIN latest
                WHERE latest.snapshot_time IS NOT NULL
                  AND vp.time >= latest.snapshot_time - INTERVAL '24 hours'
                ORDER BY vp.mmsi, vp.time DESC
            )
            SELECT vp.time, vp.mmsi, vp.lat, vp.lon, vp.sog, vp.cog, vp.nav_status,
                   v.name, v.type, v.type_label, v.flag
            FROM latest_positions vp
            LEFT JOIN vessels v ON v.mmsi = vp.mmsi
            WHERE ST_Intersects(
                vp.geom::geometry,
                ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
            )
              AND (CAST(:vessel_type AS INTEGER) IS NULL OR v.type = :vessel_type)
            ORDER BY vp.mmsi
            LIMIT :limit OFFSET :offset
            """),
        {
            "min_lon": min_lon,
            "min_lat": min_lat,
            "max_lon": max_lon,
            "max_lat": max_lat,
            "vessel_type": vessel_type,
            "limit": pagination.limit,
            "offset": pagination.offset,
        },
    )
    rows = rows_to_dicts(list(result.mappings().all()))
    await set_cached_json(cache_key, rows)
    return rows


@router.get("/{mmsi}", response_model=VesselDetail)
async def get_vessel_detail(
    mmsi: int,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> dict[str, object]:
    vessel_result = await db.execute(
        text("""
            SELECT mmsi, imo, name, type, type_label, flag, dwt, length, width, last_seen
            FROM vessels
            WHERE mmsi = :mmsi
            """),
        {"mmsi": mmsi},
    )
    vessel = row_to_dict(vessel_result.mappings().first())
    track_result = await db.execute(
        text("""
            SELECT vp.time, vp.mmsi, vp.lat, vp.lon, vp.sog, vp.cog, vp.nav_status,
                   v.name, v.type, v.type_label, v.flag
            FROM vessel_positions vp
            LEFT JOIN vessels v ON v.mmsi = vp.mmsi
            WHERE vp.mmsi = :mmsi
              AND vp.time >= :since
            ORDER BY vp.time DESC
            LIMIT 500
            """),
        {"mmsi": mmsi, "since": datetime.now(UTC) - timedelta(days=7)},
    )
    track = rows_to_dicts(list(track_result.mappings().all()))
    if vessel is None and not track:
        raise HTTPException(status_code=404, detail="Vessel not found")
    return {"vessel": vessel, "track": track}


def _parse_bbox(bbox: str | None) -> tuple[float, float, float, float]:
    if bbox is None:
        return (-180.0, -90.0, 180.0, 90.0)
    try:
        min_lon, min_lat, max_lon, max_lat = [float(part.strip()) for part in bbox.split(",")]
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="bbox must be min_lon,min_lat,max_lon,max_lat",
        ) from exc
    if min_lon >= max_lon or min_lat >= max_lat:
        raise HTTPException(status_code=400, detail="bbox min values must be below max values")
    return min_lon, min_lat, max_lon, max_lat
