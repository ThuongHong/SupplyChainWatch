from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import Anomaly


def detect_watchlist_vessel_anomalies(db: Session) -> int:
    created = 0
    created += _detect_speed_drops(db)
    created += _detect_eta_drift(db)
    created += _detect_high_risk_port_proximity(db)
    created += _detect_route_deviation(db)
    db.commit()
    return created


def _detect_speed_drops(db: Session) -> int:
    rows = db.execute(text("""
            WITH watched AS (
                SELECT mmsi, entity_id, reason
                FROM vessel_watchlist
                WHERE active IS TRUE AND (expires_at IS NULL OR expires_at > NOW())
            ),
            latest AS (
                SELECT DISTINCT ON (vp.mmsi)
                       vp.mmsi, vp.time, vp.sog, vp.lat, vp.lon,
                       watched.entity_id, watched.reason
                FROM vessel_positions vp
                JOIN watched ON watched.mmsi = vp.mmsi
                ORDER BY vp.mmsi, vp.time DESC
            )
            SELECT mmsi, time, sog, lat, lon, entity_id, reason
            FROM latest
            WHERE COALESCE(sog, 0) < 1.0
            """))
    created = 0
    for row in rows.mappings().all():
        created += _add_vessel_anomaly(
            db,
            row,
            metric="speed_over_ground",
            severity="medium",
            observed=float(row["sog"] or 0),
            expected=8.0,
            description=(
                f"Watched vessel {row['mmsi']} slowed below 1 knot near "
                f"{row['entity_id'] or 'monitored risk area'}."
            ),
        )
    return created


def _detect_eta_drift(db: Session) -> int:
    rows = db.execute(text("""
            WITH latest AS (
                SELECT DISTINCT ON (vp.mmsi)
                       vp.mmsi, vp.time, vp.sog, vw.entity_id, vw.reason
                FROM vessel_positions vp
                JOIN vessel_watchlist vw ON vw.mmsi = vp.mmsi
                WHERE vw.active IS TRUE
                  AND (vw.expires_at IS NULL OR vw.expires_at > NOW())
                ORDER BY vp.mmsi, vp.time DESC
            )
            SELECT mmsi, time, sog, entity_id, reason
            FROM latest
            WHERE COALESCE(sog, 0) >= 1.0 AND COALESCE(sog, 0) < 4.0
            """))
    created = 0
    for row in rows.mappings().all():
        drift_minutes = eta_drift_minutes(float(row["sog"] or 0))
        created += _add_vessel_anomaly(
            db,
            row,
            metric="eta_drift_minutes",
            severity="medium" if drift_minutes < 90 else "high",
            observed=drift_minutes,
            expected=0.0,
            description=(
                f"Watched vessel {row['mmsi']} speed implies roughly "
                f"{drift_minutes:.0f} minutes ETA drift."
            ),
        )
    return created


def _detect_high_risk_port_proximity(db: Session) -> int:
    rows = db.execute(text("""
            WITH latest AS (
                SELECT DISTINCT ON (vp.mmsi)
                       vp.mmsi, vp.time, vp.sog, vp.geom, vw.reason
                FROM vessel_positions vp
                JOIN vessel_watchlist vw ON vw.mmsi = vp.mmsi
                WHERE vw.active IS TRUE
                  AND (vw.expires_at IS NULL OR vw.expires_at > NOW())
                ORDER BY vp.mmsi, vp.time DESC
            ),
            risky_ports AS (
                SELECT DISTINCT ON (prs.entity_id)
                       prs.entity_id, prs.entity_name, prs.score, p.geom
                FROM port_risk_scores prs
                JOIN ports p ON lower(p.name) = lower(prs.entity_name)
                WHERE prs.score >= 70
                ORDER BY prs.entity_id, prs.time DESC
            )
            SELECT latest.mmsi, latest.time, latest.sog, risky_ports.entity_id,
                   latest.reason, risky_ports.entity_name, risky_ports.score
            FROM latest
            JOIN risky_ports ON ST_DWithin(latest.geom, risky_ports.geom, 50000)
            """))
    created = 0
    for row in rows.mappings().all():
        created += _add_vessel_anomaly(
            db,
            row,
            metric="proximity_to_high_risk_port",
            severity="high" if float(row["score"]) >= 85 else "medium",
            observed=float(row["score"]),
            expected=45.0,
            description=(
                f"Watched vessel {row['mmsi']} is near high-risk port " f"{row['entity_name']}."
            ),
        )
    return created


def _detect_route_deviation(db: Session) -> int:
    rows = db.execute(text("""
            WITH ordered AS (
                SELECT vp.mmsi, vp.time, vp.cog,
                       LAG(vp.cog) OVER (PARTITION BY vp.mmsi ORDER BY vp.time) AS prev_cog,
                       vw.entity_id, vw.reason
                FROM vessel_positions vp
                JOIN vessel_watchlist vw ON vw.mmsi = vp.mmsi
                WHERE vw.active IS TRUE
                  AND (vw.expires_at IS NULL OR vw.expires_at > NOW())
                  AND vp.time >= NOW() - INTERVAL '24 hours'
            )
            SELECT DISTINCT ON (mmsi) mmsi, time, cog, prev_cog, entity_id, reason
            FROM ordered
            WHERE prev_cog IS NOT NULL
              AND ABS(cog - prev_cog) BETWEEN 45 AND 315
            ORDER BY mmsi, time DESC
            """))
    created = 0
    for row in rows.mappings().all():
        observed = course_delta_degrees(float(row["cog"]), float(row["prev_cog"]))
        created += _add_vessel_anomaly(
            db,
            row,
            metric="route_deviation_degrees",
            severity="medium",
            observed=observed,
            expected=15.0,
            description=(f"Watched vessel {row['mmsi']} changed course by {observed:.0f} degrees."),
        )
    return created


def eta_drift_minutes(speed_knots: float, expected_speed_knots: float = 8.0) -> float:
    return max(0.0, (expected_speed_knots - speed_knots) * 18.0)


def course_delta_degrees(current: float, previous: float) -> float:
    delta = abs(current - previous) % 360
    return min(delta, 360 - delta)


def _add_vessel_anomaly(
    db: Session,
    row: Any,
    *,
    metric: str,
    severity: str,
    observed: float,
    expected: float,
    description: str,
) -> int:
    mapping = dict(row)
    db.add(
        Anomaly(
            entity_type="vessel",
            entity_id=str(mapping["mmsi"]),
            severity=severity,
            metric=metric,
            observed=observed,
            expected=expected,
            z_score=None,
            description=description,
        )
    )
    return 1
