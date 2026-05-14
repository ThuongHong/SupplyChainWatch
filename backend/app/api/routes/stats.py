from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_db
from app.schemas.api import OverviewStats
from app.utils.cache import get_cached_json, set_cached_json

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/overview", response_model=OverviewStats)
async def overview_stats(
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> dict[str, object]:
    cached = await get_cached_json("stats:overview")
    if cached is not None:
        return cached

    latest_indices = await db.execute(text("""
            SELECT DISTINCT ON (index_name) index_name, value
            FROM freight_indices
            WHERE index_name IN ('BDI', 'FBX_GLOBAL')
            ORDER BY index_name, time DESC
            """))
    values = {
        str(row["index_name"]): float(row["value"]) for row in latest_indices.mappings().all()
    }

    active_result = await db.execute(text("""
            WITH latest AS (SELECT MAX(time) AS snapshot_time FROM vessel_positions)
            SELECT COUNT(*)::int AS active_vessels
            FROM vessel_positions vp
            JOIN latest ON latest.snapshot_time = vp.time
            """))
    anomaly_result = await db.execute(text("""
            SELECT COUNT(*)::int AS high_count
            FROM anomalies
            WHERE severity = 'high'
              AND detected_at >= NOW() - INTERVAL '30 days'
            """))
    active_row = active_result.mappings().first()
    anomaly_row = anomaly_result.mappings().first()
    payload: dict[str, object] = {
        "latest_bdi": values.get("BDI"),
        "latest_fbx": values.get("FBX_GLOBAL"),
        "active_vessels": int(active_row["active_vessels"]) if active_row else 0,
        "high_severity_anomalies": int(anomaly_row["high_count"]) if anomaly_row else 0,
        "generated_at": datetime.now(UTC),
    }
    await set_cached_json("stats:overview", payload)
    return payload
