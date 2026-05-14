from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import Anomaly


def rolling_z_score(values: Sequence[float], window: int = 30) -> float | None:
    """Return the latest rolling z-score."""
    if len(values) <= window:
        return None
    baseline = values[-window - 1 : -1]
    mean = sum(baseline) / len(baseline)
    variance = sum((value - mean) ** 2 for value in baseline) / len(baseline)
    stddev = variance**0.5
    if stddev == 0:
        return None
    return (values[-1] - mean) / stddev


def severity_from_z_score(z_score: float) -> str:
    """Map absolute z-score to anomaly severity."""
    magnitude = abs(z_score)
    if magnitude > 4:
        return "high"
    if magnitude > 3:
        return "medium"
    return "low"


def detect_anomalies(db: Session) -> int:
    """Detect index and port-congestion anomalies and persist them."""
    created = 0
    created += detect_index_anomalies(db)
    created += detect_port_congestion_anomalies(db)
    db.commit()
    return created


def detect_index_anomalies(db: Session) -> int:
    """Detect rolling z-score anomalies in freight indices."""
    result = db.execute(text("""
            SELECT index_name, time, value
            FROM freight_indices
            WHERE time >= NOW() - INTERVAL '120 days'
            ORDER BY index_name, time
            """))
    grouped: dict[str, list[tuple[object, float]]] = {}
    for row in result.mappings().all():
        grouped.setdefault(str(row["index_name"]), []).append((row["time"], float(row["value"])))

    created = 0
    for index_name, points in grouped.items():
        values = [point[1] for point in points]
        z_score = rolling_z_score(values)
        if z_score is None or abs(z_score) <= 2.5:
            continue
        latest_time, latest_value = points[-1]
        severity = severity_from_z_score(z_score)
        db.add(
            Anomaly(
                entity_type="index",
                entity_id=index_name,
                severity=severity,
                metric="value",
                observed=latest_value,
                expected=values[-2] if len(values) > 1 else None,
                z_score=z_score,
                description=(
                    f"{index_name} moved {z_score:.1f} standard deviations from "
                    f"its 30-day rolling baseline at {latest_time}."
                ),
            )
        )
        created += 1
    return created


def detect_port_congestion_anomalies(db: Session) -> int:
    """Detect congestion anomalies using current total vessels versus 30-day baseline."""
    result = db.execute(text("""
            WITH latest AS (
                SELECT DISTINCT ON (port_id)
                       port_id, time, total_in_area
                FROM port_congestion
                ORDER BY port_id, time DESC
            ),
            baseline AS (
                SELECT port_id,
                       AVG(total_in_area)::float AS avg_total,
                       STDDEV_POP(total_in_area)::float AS std_total
                FROM port_congestion
                WHERE time >= NOW() - INTERVAL '30 days'
                GROUP BY port_id
            )
            SELECT latest.port_id, latest.time, latest.total_in_area,
                   baseline.avg_total, baseline.std_total
            FROM latest
            JOIN baseline ON baseline.port_id = latest.port_id
            WHERE baseline.std_total > 0
            """))
    created = 0
    for row in result.mappings().all():
        observed = float(row["total_in_area"])
        expected = float(row["avg_total"])
        stddev = float(row["std_total"])
        z_score = (observed - expected) / stddev
        if abs(z_score) <= 2.5:
            continue
        severity = severity_from_z_score(z_score)
        port_id = str(row["port_id"])
        db.add(
            Anomaly(
                entity_type="port",
                entity_id=port_id,
                severity=severity,
                metric="total_in_area",
                observed=observed,
                expected=expected,
                z_score=z_score,
                description=(
                    f"Port {port_id} congestion is {z_score:.1f} standard deviations "
                    "from its 30-day baseline."
                ),
            )
        )
        created += 1
    return created
