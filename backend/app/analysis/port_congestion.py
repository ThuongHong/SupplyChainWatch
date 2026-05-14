from __future__ import annotations

from typing import Any, cast

from sqlalchemy import text
from sqlalchemy.orm import Session


def compute_port_congestion(db: Session) -> int:
    """Compute current port congestion from the latest vessel snapshot."""
    result = db.execute(text("""
            WITH latest AS (
                SELECT MAX(time) AS snapshot_time FROM vessel_positions
            ),
            computed AS (
                SELECT latest.snapshot_time AS time,
                       p.id AS port_id,
                       COUNT(vp.mmsi) FILTER (
                           WHERE vp.nav_status IN (1, 5, 6)
                              OR COALESCE(vp.sog, 0) < 0.5
                       )::int AS anchored_count,
                       COUNT(vp.mmsi) FILTER (WHERE vp.nav_status = 5)::int AS moored_count,
                       COUNT(vp.mmsi) FILTER (WHERE COALESCE(vp.sog, 0) > 3)::int AS underway_count,
                       COUNT(vp.mmsi)::int AS total_in_area,
                       NULL::real AS avg_dwell_hours,
                       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vp.sog)::real AS median_speed
                FROM ports p
                CROSS JOIN latest
                LEFT JOIN vessel_positions vp
                  ON vp.time = latest.snapshot_time
                 AND ST_DWithin(vp.geom, p.geom, p.radius_km * 1000)
                WHERE latest.snapshot_time IS NOT NULL
                GROUP BY latest.snapshot_time, p.id
            )
            INSERT INTO port_congestion (
                time, port_id, anchored_count, moored_count, underway_count,
                total_in_area, avg_dwell_hours, median_speed
            )
            SELECT time, port_id, anchored_count, moored_count, underway_count,
                   total_in_area, avg_dwell_hours, median_speed
            FROM computed
            """))
    db.commit()
    rowcount = cast(Any, result).rowcount
    return int(rowcount) if rowcount is not None else 0
