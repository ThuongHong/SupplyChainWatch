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

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
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
    from datetime import UTC, datetime, timedelta

    # Fetch enough history to build baseline (days + 7)
    total_days = days + 7
    sql = """
        SELECT DISTINCT ON (pm.observed_at, p.id)
               pm.observed_at AS time,
               p.id AS port_id,
               p.name AS port_name,
               COALESCE(pw_total.metric_value, 0) AS total_in_area,
               COALESCE(pw_calls.metric_value, 0) AS anchored_count,
               COALESCE(pw_import.metric_value, 0) AS avg_dwell_hours,
               COALESCE(pw_export.metric_value, 0) AS median_speed
        FROM portwatch_metrics pm
        JOIN ports p ON p.name = pm.entity_name
        LEFT JOIN portwatch_metrics pw_total ON pw_total.observed_at = pm.observed_at
            AND pw_total.entity_name = pm.entity_name
            AND pw_total.metric_name IN ('portcalls', 'n_total', 'daily_vessel_calls')
        LEFT JOIN portwatch_metrics pw_calls ON pw_calls.observed_at = pm.observed_at
            AND pw_calls.entity_name = pm.entity_name
            AND pw_calls.metric_name IN ('import', 'traffic_anomaly_index')
        LEFT JOIN portwatch_metrics pw_import ON pw_import.observed_at = pm.observed_at
            AND pw_import.entity_name = pm.entity_name
            AND pw_import.metric_name IN ('export', 'trade_volume_index')
        LEFT JOIN portwatch_metrics pw_export ON pw_export.observed_at = pm.observed_at
            AND pw_export.entity_name = pm.entity_name
            AND pw_export.metric_name IN ('transit_capacity_index')
        WHERE pm.observed_at >= NOW() - (:total_days * INTERVAL '1 day')
    """
    params = {"total_days": total_days}
    if port_id is not None:
        sql += " AND p.id = :port_id"
        params["port_id"] = port_id
    sql += " ORDER BY p.id, pm.observed_at ASC"
    result = db.execute(text(sql), params)
    rows = result.mappings().all()

    # Group by port_id
    grouped_points: dict[int, list[dict[str, object]]] = {}
    for row in rows:
        pid = int(row["port_id"])
        grouped_points.setdefault(pid, []).append(dict(row))

    anomalies: list[dict[str, object]] = []
    cutoff_time = datetime.now(UTC) - timedelta(days=days)

    def calc_z_score(val: float | None, baseline: list[float], reverse: bool = False) -> tuple[float, float, float]:
        if val is None or not baseline:
            return 0.0, 0.0, 0.0
        mean = sum(baseline) / len(baseline)
        variance = sum((x - mean) ** 2 for x in baseline) / len(baseline)
        std = variance ** 0.5
        if std == 0.0:
            return 0.0, mean, std
        if reverse:
            z = (mean - val) / std
        else:
            z = (val - mean) / std
        return z, mean, std

    idx_counter = 1
    for pid, points in grouped_points.items():
        for i, p in enumerate(points):
            p_time = p["time"]
            if p_time.tzinfo is None:
                p_time = p_time.replace(tzinfo=UTC)
            if p_time < cutoff_time:
                continue

            # Gather preceding 7 points for baseline
            window_points = points[max(0, i - 7):i]
            # Must have at least 7 points of historical data
            if len(window_points) < 7:
                continue

            # Extract metric values
            total_vals = [float(w["total_in_area"]) for w in window_points if w["total_in_area"] is not None]
            anchored_vals = [float(w["anchored_count"]) for w in window_points if w["anchored_count"] is not None]
            dwell_vals = [float(w["avg_dwell_hours"]) for w in window_points if w["avg_dwell_hours"] is not None]
            speed_vals = [float(w["median_speed"]) for w in window_points if w["median_speed"] is not None]

            # Z-scores
            total_z, mean_total, std_total = calc_z_score(
                float(p["total_in_area"]) if p["total_in_area"] is not None else None, total_vals
            )
            anchored_z, mean_anchored, std_anchored = calc_z_score(
                float(p["anchored_count"]) if p["anchored_count"] is not None else None, anchored_vals
            )
            dwell_z, mean_dwell, std_dwell = calc_z_score(
                float(p["avg_dwell_hours"]) if p["avg_dwell_hours"] is not None else None, dwell_vals
            )
            speed_z, mean_speed, std_speed = calc_z_score(
                float(p["median_speed"]) if p["median_speed"] is not None else None, speed_vals, reverse=True
            )

            # Max z-score is anomaly score
            anomaly_score = max(total_z, anchored_z, dwell_z, speed_z)

            # Determine main driver
            z_scores = {
                "total_in_area": total_z,
                "anchored_count": anchored_z,
                "avg_dwell_hours": dwell_z,
                "median_speed": speed_z,
            }
            main_driver = max(z_scores, key=z_scores.get)
            z_score = z_scores[main_driver]

            # Get current/baseline values for the driver
            if main_driver == "total_in_area":
                current_value = float(p["total_in_area"]) if p["total_in_area"] is not None else 0.0
                baseline_mean = mean_total
                baseline_std = std_total
            elif main_driver == "anchored_count":
                current_value = float(p["anchored_count"]) if p["anchored_count"] is not None else 0.0
                baseline_mean = mean_anchored
                baseline_std = std_anchored
            elif main_driver == "avg_dwell_hours":
                current_value = float(p["avg_dwell_hours"]) if p["avg_dwell_hours"] is not None else 0.0
                baseline_mean = mean_dwell
                baseline_std = std_dwell
            else:  # median_speed
                current_value = float(p["median_speed"]) if p["median_speed"] is not None else 0.0
                baseline_mean = mean_speed
                baseline_std = std_speed

            # Severity mapping
            if anomaly_score >= 3.0:
                severity_val = "high"
            elif anomaly_score >= 2.0:
                severity_val = "medium"
            else:
                severity_val = "low"

            # Filter by severity if specified
            if severity is not None and severity.lower() != severity_val:
                continue

            # Create explanation message
            port_name = str(p["port_name"])
            if main_driver == "median_speed":
                message = (
                    f"{port_name} shows abnormal low vessel speed: median_speed is "
                    f"significantly below its recent baseline."
                )
            else:
                message = (
                    f"{port_name} has a {severity_val} anomaly: {main_driver} is "
                    f"{z_score:.1f} standard deviations above its 7-point baseline."
                )

            anomalies.append(
                {
                    # Backward compatibility keys
                    "id": idx_counter,
                    "detected_at": p["time"],
                    "entity_type": "port",
                    "entity_id": str(pid),
                    "severity": severity_val,
                    "metric": main_driver,
                    "observed": current_value,
                    "expected": baseline_mean,
                    "z_score": z_score,
                    "description": message,
                    "explanation": message,
                    "acknowledged": False,
                    # New keys requested
                    "port_id": pid,
                    "port_name": port_name,
                    "time": p["time"],
                    "anomaly_score": anomaly_score,
                    "main_driver": main_driver,
                    "current_value": current_value,
                    "baseline_mean": baseline_mean,
                    "baseline_std": baseline_std,
                    "message": message,
                }
            )
            idx_counter += 1

    # Sort anomalies by time descending
    anomalies.sort(key=lambda x: x["time"], reverse=True)
    return anomalies


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
    from datetime import UTC, datetime, timedelta

    # Fetch enough history to build baseline (days + 7)
    total_days = days + 7
    sql = """
        SELECT DISTINCT ON (pm.observed_at, p.id)
               pm.observed_at AS time,
               p.id AS port_id,
               p.name AS port_name,
               COALESCE(pw_total.metric_value, 0) AS total_in_area,
               COALESCE(pw_calls.metric_value, 0) AS anchored_count,
               COALESCE(pw_import.metric_value, 0) AS avg_dwell_hours,
               COALESCE(pw_export.metric_value, 0) AS median_speed
        FROM portwatch_metrics pm
        JOIN ports p ON p.name = pm.entity_name
        LEFT JOIN portwatch_metrics pw_total ON pw_total.observed_at = pm.observed_at
            AND pw_total.entity_name = pm.entity_name
            AND pw_total.metric_name IN ('portcalls', 'n_total', 'daily_vessel_calls')
        LEFT JOIN portwatch_metrics pw_calls ON pw_calls.observed_at = pm.observed_at
            AND pw_calls.entity_name = pm.entity_name
            AND pw_calls.metric_name IN ('import', 'traffic_anomaly_index')
        LEFT JOIN portwatch_metrics pw_import ON pw_import.observed_at = pm.observed_at
            AND pw_import.entity_name = pm.entity_name
            AND pw_import.metric_name IN ('export', 'trade_volume_index')
        LEFT JOIN portwatch_metrics pw_export ON pw_export.observed_at = pm.observed_at
            AND pw_export.entity_name = pm.entity_name
            AND pw_export.metric_name IN ('transit_capacity_index')
        WHERE pm.observed_at >= NOW() - (:total_days * INTERVAL '1 day')
    """
    params: dict[str, object] = {"total_days": total_days}
    if port_id is not None:
        sql += " AND p.id = :port_id"
        params["port_id"] = port_id
    sql += " ORDER BY p.id, pm.observed_at ASC"

    result = await db.execute(text(sql), params)
    rows = result.mappings().all()

    # Group by port_id
    grouped_points: dict[int, list[dict[str, object]]] = {}
    for row in rows:
        pid = int(row["port_id"])
        grouped_points.setdefault(pid, []).append(dict(row))

    anomalies: list[dict[str, object]] = []
    cutoff_time = datetime.now(UTC) - timedelta(days=days)

    def calc_z_score(val: float | None, baseline: list[float], reverse: bool = False) -> tuple[float, float, float]:
        if val is None or not baseline:
            return 0.0, 0.0, 0.0
        mean = sum(baseline) / len(baseline)
        variance = sum((x - mean) ** 2 for x in baseline) / len(baseline)
        std = variance ** 0.5
        if std == 0.0:
            return 0.0, mean, std
        if reverse:
            z = (mean - val) / std
        else:
            z = (val - mean) / std
        return z, mean, std

    idx_counter = 1
    for pid, points in grouped_points.items():
        for i, p in enumerate(points):
            p_time = p["time"]
            if p_time.tzinfo is None:
                p_time = p_time.replace(tzinfo=UTC)
            if p_time < cutoff_time:
                continue

            # Gather preceding 7 points for baseline
            window_points = points[max(0, i - 7):i]
            # Must have at least 7 points of historical data
            if len(window_points) < 7:
                continue

            # Extract metric values
            total_vals = [float(w["total_in_area"]) for w in window_points if w["total_in_area"] is not None]
            anchored_vals = [float(w["anchored_count"]) for w in window_points if w["anchored_count"] is not None]
            dwell_vals = [float(w["avg_dwell_hours"]) for w in window_points if w["avg_dwell_hours"] is not None]
            speed_vals = [float(w["median_speed"]) for w in window_points if w["median_speed"] is not None]

            # Z-scores
            total_z, mean_total, std_total = calc_z_score(
                float(p["total_in_area"]) if p["total_in_area"] is not None else None, total_vals
            )
            anchored_z, mean_anchored, std_anchored = calc_z_score(
                float(p["anchored_count"]) if p["anchored_count"] is not None else None, anchored_vals
            )
            dwell_z, mean_dwell, std_dwell = calc_z_score(
                float(p["avg_dwell_hours"]) if p["avg_dwell_hours"] is not None else None, dwell_vals
            )
            speed_z, mean_speed, std_speed = calc_z_score(
                float(p["median_speed"]) if p["median_speed"] is not None else None, speed_vals, reverse=True
            )

            # Max z-score is anomaly score
            anomaly_score = max(total_z, anchored_z, dwell_z, speed_z)

            # Determine main driver
            z_scores = {
                "total_in_area": total_z,
                "anchored_count": anchored_z,
                "avg_dwell_hours": dwell_z,
                "median_speed": speed_z,
            }
            main_driver = max(z_scores, key=z_scores.get)
            z_score = z_scores[main_driver]

            # Get current/baseline values for the driver
            if main_driver == "total_in_area":
                current_value = float(p["total_in_area"]) if p["total_in_area"] is not None else 0.0
                baseline_mean = mean_total
                baseline_std = std_total
            elif main_driver == "anchored_count":
                current_value = float(p["anchored_count"]) if p["anchored_count"] is not None else 0.0
                baseline_mean = mean_anchored
                baseline_std = std_anchored
            elif main_driver == "avg_dwell_hours":
                current_value = float(p["avg_dwell_hours"]) if p["avg_dwell_hours"] is not None else 0.0
                baseline_mean = mean_dwell
                baseline_std = std_dwell
            else:  # median_speed
                current_value = float(p["median_speed"]) if p["median_speed"] is not None else 0.0
                baseline_mean = mean_speed
                baseline_std = std_speed

            # Severity mapping
            if anomaly_score >= 3.0:
                severity_val = "high"
            elif anomaly_score >= 2.0:
                severity_val = "medium"
            else:
                severity_val = "low"

            # Filter by severity if specified
            if severity is not None and severity.lower() != severity_val:
                continue

            # Create explanation message
            port_name = str(p["port_name"])
            if main_driver == "median_speed":
                message = (
                    f"{port_name} shows abnormal low vessel speed: median_speed is "
                    f"significantly below its recent baseline."
                )
            else:
                message = (
                    f"{port_name} has a {severity_val} anomaly: {main_driver} is "
                    f"{z_score:.1f} standard deviations above its 7-point baseline."
                )

            anomalies.append(
                {
                    # Backward compatibility keys
                    "id": idx_counter,
                    "detected_at": p["time"],
                    "entity_type": "port",
                    "entity_id": str(pid),
                    "severity": severity_val,
                    "metric": main_driver,
                    "observed": current_value,
                    "expected": baseline_mean,
                    "z_score": z_score,
                    "description": message,
                    "explanation": message,
                    "acknowledged": False,
                    # New keys requested
                    "port_id": pid,
                    "port_name": port_name,
                    "time": p["time"],
                    "anomaly_score": anomaly_score,
                    "main_driver": main_driver,
                    "current_value": current_value,
                    "baseline_mean": baseline_mean,
                    "baseline_std": baseline_std,
                    "message": message,
                }
            )
            idx_counter += 1

    # Sort anomalies by time descending
    anomalies.sort(key=lambda x: x["time"], reverse=True)
    return anomalies
