from __future__ import annotations

from typing import Any, cast

from sqlalchemy import text
from sqlalchemy.orm import Session


def compute_chokepoint_status(db: Session) -> int:
    """Compute current vessel count and simple risk score for chokepoints."""
    result = db.execute(text("""
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
            ),
            computed AS (
                SELECT latest.snapshot_time AS time,
                       c.id AS chokepoint_id,
                       COUNT(vp.mmsi)::int AS vessel_count,
                       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vp.sog)::real AS median_speed
                FROM chokepoints c
                CROSS JOIN latest
                LEFT JOIN latest_positions vp
                  ON ST_Intersects(vp.geom::geometry, c.geom::geometry)
                WHERE latest.snapshot_time IS NOT NULL
                GROUP BY latest.snapshot_time, c.id
            )
            INSERT INTO chokepoint_status (
                time, chokepoint_id, vessel_count, median_speed, risk_score
            )
            SELECT time,
                   chokepoint_id,
                   vessel_count,
                   median_speed,
                   (
                       vessel_count::float / 25.0
                       + GREATEST(0, 10 - COALESCE(median_speed, 10)) / 10.0
                   )::real AS risk_score
            FROM computed
            """))
    db.commit()
    rowcount = cast(Any, result).rowcount
    return int(rowcount) if rowcount is not None else 0
