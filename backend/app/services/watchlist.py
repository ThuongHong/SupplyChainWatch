from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import VesselWatchlist

MAJOR_ROUTE_RULES = {
    "asia_europe": ("cp-suez", "Suez Canal route exposure"),
    "trans_pacific": ("port-uslax", "Trans-Pacific route exposure"),
    "asia_feeder": ("cp-malacca", "Malacca/Singapore feeder exposure"),
}


def active_watchlist_mmsi(db: Session) -> set[int]:
    result = db.execute(text("""
            SELECT mmsi
            FROM vessel_watchlist
            WHERE active IS TRUE
              AND (expires_at IS NULL OR expires_at > NOW())
            """))
    return {int(row[0]) for row in result.all()}


def upsert_watchlist_entry(
    db: Session,
    *,
    mmsi: int,
    reason: str,
    source_rule: str,
    priority: int = 5,
    ttl_hours: int = 72,
    entity_type: str | None = None,
    entity_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> VesselWatchlist:
    expires_at = datetime.now(UTC) + timedelta(hours=ttl_hours)
    entry = db.query(VesselWatchlist).filter(VesselWatchlist.mmsi == mmsi).one_or_none()
    if entry is None:
        entry = VesselWatchlist(mmsi=mmsi, reason=reason, source_rule=source_rule)
    entry.reason = reason
    entry.source_rule = source_rule
    entry.priority = priority
    entry.active = True
    entry.entity_type = entity_type
    entry.entity_id = entity_id
    entry.expires_at = expires_at
    entry.updated_at = datetime.now(UTC)
    entry.metadata_ = metadata or {}
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def pin_manual_watchlist(
    db: Session,
    *,
    mmsi: int,
    reason: str,
    priority: int = 10,
    ttl_hours: int = 168,
) -> VesselWatchlist:
    return upsert_watchlist_entry(
        db,
        mmsi=mmsi,
        reason=reason,
        source_rule="manual_pin",
        priority=priority,
        ttl_hours=ttl_hours,
        metadata={"rule_type": "manual"},
    )


def upsert_route_watchlist(
    db: Session,
    *,
    mmsi: int,
    route_code: str,
    priority: int = 7,
    ttl_hours: int = 96,
) -> VesselWatchlist:
    entity_id, reason = MAJOR_ROUTE_RULES.get(
        route_code,
        (route_code, "Major route exposure"),
    )
    return upsert_watchlist_entry(
        db,
        mmsi=mmsi,
        reason=reason,
        source_rule=f"route:{route_code}",
        priority=priority,
        ttl_hours=ttl_hours,
        entity_type="route",
        entity_id=entity_id,
        metadata={"route_code": route_code},
    )


def upsert_anomaly_watchlist(
    db: Session,
    *,
    mmsi: int,
    anomaly_type: str,
    entity_id: str | None = None,
) -> VesselWatchlist:
    return upsert_watchlist_entry(
        db,
        mmsi=mmsi,
        reason=f"Watched due to {anomaly_type}",
        source_rule=f"anomaly:{anomaly_type}",
        priority=9,
        ttl_hours=48,
        entity_type="anomaly",
        entity_id=entity_id,
        metadata={"anomaly_type": anomaly_type},
    )


def refresh_watchlist_from_risk(db: Session, *, minimum_score: float = 70) -> int:
    """Add nearby vessels for high-risk ports and chokepoints."""
    result = db.execute(
        text("""
            WITH latest_positions AS (
                SELECT DISTINCT ON (mmsi) mmsi, lat, lon, geom, sog, time
                FROM vessel_positions
                WHERE time >= NOW() - INTERVAL '12 hours'
                ORDER BY mmsi, time DESC
            ),
            risky_ports AS (
                SELECT DISTINCT ON (prs.entity_id)
                       prs.entity_id, prs.entity_name, prs.score, p.geom
                FROM port_risk_scores prs
                JOIN ports p ON lower(p.name) = lower(prs.entity_name)
                WHERE prs.time >= NOW() - INTERVAL '2 days'
                  AND prs.score >= :minimum_score
                ORDER BY prs.entity_id, prs.time DESC
            ),
            port_matches AS (
                SELECT lp.mmsi, rp.entity_id, rp.entity_name, rp.score, 'port' AS entity_type
                FROM latest_positions lp
                JOIN risky_ports rp ON ST_DWithin(lp.geom, rp.geom, 75000)
                WHERE COALESCE(lp.sog, 0) < 6 OR rp.score >= 85
            )
            SELECT DISTINCT ON (mmsi) mmsi, entity_id, entity_name, score, entity_type
            FROM port_matches
            ORDER BY mmsi, score DESC
            """),
        {"minimum_score": minimum_score},
    )
    created = 0
    for row in result.mappings().all():
        upsert_watchlist_entry(
            db,
            mmsi=int(row["mmsi"]),
            reason=f"Near high-risk {row['entity_type']} {row['entity_name']}",
            source_rule="risk_area:port",
            priority=8 if float(row["score"]) >= 85 else 6,
            ttl_hours=36,
            entity_type=str(row["entity_type"]),
            entity_id=str(row["entity_id"]),
            metadata={"risk_score": float(row["score"])},
        )
        created += 1
    return created


def is_active_watchlist_row(row: dict[str, Any], watchlist_mmsi: set[int]) -> bool:
    if not watchlist_mmsi:
        return bool(row.get("_risk_area"))
    mmsi = row.get("mmsi")
    return (mmsi is not None and int(mmsi) in watchlist_mmsi) or bool(row.get("_risk_area"))
