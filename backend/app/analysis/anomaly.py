"""Anomaly detection for freight indices and port metrics.

.. note:: AISStream boundary
    The ``vessel_positions`` and ``port_congestion`` tables are populated by
    AISStream and are reserved **exclusively** for live map visualisation and
    current vessel / port display.  They MUST NOT be used as inputs to anomaly
    detection, historical anomaly timelines, maritime risk scores, or dashboard
    alerts.  Any function that previously queried those tables has been disabled
    or refactored to use only ``portwatch_metrics``.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.db.models import Anomaly

PORT_ANOMALY_METRIC_NAMES = ("portcalls", "n_total", "daily_vessel_calls", "import", "export")


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
    """Detect freight-index anomalies and persist them.

    Only ``freight_indices`` (sourced from FRED, FBX, WCI, etc.) is queried.
    AISStream-derived tables (``vessel_positions``, ``port_congestion``) are
    **not** consulted here; they are visualization-only.
    """
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
    """Disabled: ``port_congestion`` is an AISStream table reserved for visualization only."""
    # AISStream is visualization-only; port_congestion must not feed anomaly detection.
    return 0


def compute_port_historical_anomalies(
    db: Session,
    days: int = 30,
    severity: str | None = None,
    port_id: int | None = None,
) -> list[dict[str, object]]:
    """Compute rolling z-score anomalies for ports dynamically using a rolling baseline."""
    total_days = days + 7
    sql = """
        SELECT pm.observed_at AS time,
               p.id AS port_id,
               p.name AS port_name,
               pm.metric_name,
               pm.metric_value AS value
        FROM portwatch_metrics pm
        JOIN ports p ON p.name = pm.entity_name
        WHERE pm.metric_name = ANY(:metric_names)
          AND pm.source <> 'portwatch_demo'
          AND pm.observed_at >= NOW() - (:total_days * INTERVAL '1 day')
    """
    params: dict[str, object] = {
        "total_days": total_days,
        "metric_names": list(PORT_ANOMALY_METRIC_NAMES),
    }
    if port_id is not None:
        sql += " AND p.id = :port_id"
        params["port_id"] = port_id
    sql += " ORDER BY p.id, pm.metric_name, pm.observed_at ASC"
    result = db.execute(text(sql), params)
    return _port_metric_anomalies_from_rows(result.mappings().all(), days=days, severity=severity)


async def compute_port_historical_anomalies_async(
    db: AsyncSession,
    days: int = 30,
    severity: str | None = None,
    port_id: int | None = None,
) -> list[dict[str, object]]:
    """Compute rolling z-score anomalies for ports dynamically using AsyncSession.

    Data source: ``portwatch_metrics`` only.  The AISStream-derived
    ``port_congestion`` table is **not** queried here; it is reserved for live
    map visualisation.
    """
    total_days = days + 7
    sql = """
        SELECT pm.observed_at AS time,
               p.id AS port_id,
               p.name AS port_name,
               pm.metric_name,
               pm.metric_value AS value
        FROM portwatch_metrics pm
        JOIN ports p ON p.name = pm.entity_name
        WHERE pm.metric_name = ANY(:metric_names)
          AND pm.source <> 'portwatch_demo'
          AND pm.observed_at >= NOW() - (:total_days * INTERVAL '1 day')
    """
    params: dict[str, object] = {
        "total_days": total_days,
        "metric_names": list(PORT_ANOMALY_METRIC_NAMES),
    }
    if port_id is not None:
        sql += " AND p.id = :port_id"
        params["port_id"] = port_id
    sql += " ORDER BY p.id, pm.metric_name, pm.observed_at ASC"

    result = await db.execute(text(sql), params)
    return _port_metric_anomalies_from_rows(result.mappings().all(), days=days, severity=severity)


def _port_metric_anomalies_from_rows(
    rows: Sequence[object],
    *,
    days: int,
    severity: str | None,
) -> list[dict[str, object]]:
    grouped_points: dict[tuple[int, str], list[dict[str, object]]] = {}
    for row in rows:
        item = dict(row)  # type: ignore[arg-type]
        pid = int(item["port_id"])
        metric_name = str(item["metric_name"])
        grouped_points.setdefault((pid, metric_name), []).append(item)

    anomalies: list[dict[str, object]] = []
    cutoff_time = datetime.now(UTC) - timedelta(days=days)

    idx_counter = 1
    for (pid, metric_name), points in grouped_points.items():
        for i, point in enumerate(points):
            point_time = point["time"]
            if point_time.tzinfo is None:
                point_time = point_time.replace(tzinfo=UTC)
            if point_time < cutoff_time:
                continue

            window_points = points[max(0, i - 7):i]
            if len(window_points) < 7:
                continue

            baseline_values = [
                float(window["value"])
                for window in window_points
                if window["value"] is not None
            ]
            current_value = float(point["value"]) if point["value"] is not None else 0.0
            z_score, baseline_mean, baseline_std = _z_score_against_baseline(
                current_value,
                baseline_values,
            )
            anomaly_score = max(0.0, z_score)

            if anomaly_score >= 3.0:
                severity_val = "high"
            elif anomaly_score >= 2.0:
                severity_val = "medium"
            else:
                severity_val = "low"

            if severity is not None and severity.lower() != severity_val:
                continue

            port_name = str(point["port_name"])
            message = (
                f"{port_name} has a {severity_val} anomaly: {metric_name} is "
                f"{z_score:.1f} standard deviations above its 7-point baseline."
            )

            anomalies.append(
                {
                    "id": idx_counter,
                    "detected_at": point["time"],
                    "entity_type": "port",
                    "entity_id": str(pid),
                    "severity": severity_val,
                    "metric": metric_name,
                    "observed": current_value,
                    "expected": baseline_mean,
                    "z_score": z_score,
                    "description": message,
                    "explanation": message,
                    "acknowledged": False,
                    "port_id": pid,
                    "port_name": port_name,
                    "time": point["time"],
                    "anomaly_score": anomaly_score,
                    "main_driver": metric_name,
                    "current_value": current_value,
                    "baseline_mean": baseline_mean,
                    "baseline_std": baseline_std,
                    "message": message,
                }
            )
            idx_counter += 1

    anomalies.sort(key=lambda item: item["time"], reverse=True)
    return anomalies


def _z_score_against_baseline(value: float, baseline: list[float]) -> tuple[float, float, float]:
    if not baseline:
        return 0.0, 0.0, 0.0
    mean = sum(baseline) / len(baseline)
    variance = sum((x - mean) ** 2 for x in baseline) / len(baseline)
    std = variance ** 0.5
    if std == 0.0:
        return 0.0, mean, std
    return (value - mean) / std, mean, std
