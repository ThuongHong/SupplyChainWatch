"""Vessel monitoring utilities.

.. note:: AISStream boundary
    The ``vessel_positions`` table is populated by AISStream and is reserved
    **exclusively** for live map visualisation and current vessel display.
    It MUST NOT be used as an input to anomaly detection, historical anomaly
    timelines, maritime risk scores, port risk scores, or dashboard alerts.
    All functions in this module that previously queried ``vessel_positions``
    have been disabled (they return 0 immediately) to enforce this separation.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.db.models import Anomaly


def detect_watchlist_vessel_anomalies(db: Session) -> int:
    """Disabled: AISStream data must not feed anomaly detection."""
    # AISStream is visualization-only; vessel_positions must not be queried here.
    return 0


def _detect_speed_drops(db: Session) -> int:
    """Disabled: vessel_positions (AISStream) must not feed anomaly detection."""
    return 0


def _detect_eta_drift(db: Session) -> int:
    """Disabled: vessel_positions (AISStream) must not feed anomaly detection."""
    return 0


def _detect_high_risk_port_proximity(db: Session) -> int:
    """Disabled: vessel_positions (AISStream) must not feed anomaly detection."""
    return 0


def _detect_route_deviation(db: Session) -> int:
    """Disabled: vessel_positions (AISStream) must not feed anomaly detection."""
    return 0


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
