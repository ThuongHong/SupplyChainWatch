"""Time-aware switch-port recommendation from PortWatch time series only."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.analysis.anomaly import rolling_z_score
from app.analysis.maritime_risk import freshness_status
from app.collectors.portwatch import PORTWATCH_ENTITY_BY_ID
from app.db.models import Insight

PORT_SWITCH_CAVEATS = [
    (
        "PortWatch history is a rolling 180-day window, supporting 7-day and 30-day "
        "trend checks but not seasonality decomposition or year-over-year comparison."
    ),
    "The 7-day projection is persistence plus linear slope, not an ML forecast.",
    (
        "Substitutes are limited to monitored PortWatch port entities; unmonitored ports "
        "are never recommended."
    ),
    (
        "AIS-derived port_congestion and vessel_positions tables are intentionally not "
        "consulted for this recommendation."
    ),
]


@dataclass(frozen=True)
class PortPressure:
    entity_id: str
    entity_name: str
    port_id: int | None
    asof: datetime
    latest_vessel_calls: float | None
    latest_anomaly_index: float | None
    slope_7d_pct: float | None
    slope_30d_pct: float | None
    baseline_60d_mean: float | None
    z_score_30d: float | None
    anomaly_flag: bool
    projection_7d: float | None
    freshness_status: str


@dataclass(frozen=True)
class SwitchRecommendation:
    source: PortPressure
    substitutes: list[PortPressure]
    recommendation: PortPressure | None
    headline: str
    reason: str | None
    generated_at: datetime


def compute_port_pressure(
    db: Session,
    port_entity_id: str,
    *,
    asof: datetime | None = None,
) -> PortPressure:
    """Compute latest pressure and short-horizon trend for one monitored port."""
    entity = PORTWATCH_ENTITY_BY_ID.get(port_entity_id)
    if entity is None or entity.entity_type != "port":
        raise ValueError(f"Unknown PortWatch port entity: {port_entity_id}")

    metric_rows = db.execute(
        text("""
            WITH recent AS (
                SELECT observed_at, entity_id, entity_name, metric_name, metric_value
                FROM portwatch_metrics
                WHERE entity_id = :entity_id
                  AND metric_name = ANY(:metric_names)
                  AND source <> 'portwatch_demo'
                  AND (CAST(:asof AS TIMESTAMPTZ) IS NULL OR observed_at <= :asof)
                ORDER BY observed_at DESC
                LIMIT 180
            )
            SELECT observed_at, entity_id, entity_name, metric_name, metric_value
            FROM recent
            ORDER BY observed_at ASC, metric_name ASC
            """),
        {
            "entity_id": port_entity_id,
            "metric_names": ["daily_vessel_calls", "portcalls", "traffic_anomaly_index"],
            "asof": asof,
        },
    ).mappings().all()

    vessel_points = [
        (row["observed_at"], float(row["metric_value"]))
        for row in metric_rows
        if str(row["metric_name"]) in {"daily_vessel_calls", "portcalls"}
        and row["metric_value"] is not None
    ]
    anomaly_points = [
        (row["observed_at"], float(row["metric_value"]))
        for row in metric_rows
        if str(row["metric_name"]) == "traffic_anomaly_index" and row["metric_value"] is not None
    ]

    values = [point[1] for point in vessel_points[-60:]]
    latest_asof = _latest_time(vessel_points, anomaly_points) or asof or datetime.now(UTC)
    latest_vessel_calls = values[-1] if values else None
    latest_anomaly_index = anomaly_points[-1][1] if anomaly_points else None
    slope_7d_per_day = _ols_slope(values[-7:])
    slope_30d_per_day = _ols_slope(values[-30:])
    slope_7d_pct = _slope_pct(slope_7d_per_day, values[-7:])
    slope_30d_pct = _slope_pct(slope_30d_per_day, values[-30:])
    baseline_values = values[:-1]
    baseline_60d_mean = sum(baseline_values) / len(baseline_values) if baseline_values else None
    z_score_30d = rolling_z_score(values, window=30)
    projection_7d = None
    if latest_vessel_calls is not None and slope_7d_per_day is not None:
        projection_7d = max(0.0, latest_vessel_calls + slope_7d_per_day * 7)

    port_id = _port_id_for_entity(db, port_entity_id)
    return PortPressure(
        entity_id=port_entity_id,
        entity_name=entity.name,
        port_id=port_id,
        asof=_ensure_utc(latest_asof),
        latest_vessel_calls=latest_vessel_calls,
        latest_anomaly_index=latest_anomaly_index,
        slope_7d_pct=slope_7d_pct,
        slope_30d_pct=slope_30d_pct,
        baseline_60d_mean=baseline_60d_mean,
        z_score_30d=z_score_30d,
        anomaly_flag=z_score_30d is not None and abs(z_score_30d) > 2.5,
        projection_7d=projection_7d,
        freshness_status=freshness_status(_ensure_utc(latest_asof)),
    )


def find_substitutes(db: Session, port_entity_id: str) -> list[str]:
    """Return same-region, capacity-banded substitute entity IDs with PortWatch coverage."""
    entity = PORTWATCH_ENTITY_BY_ID.get(port_entity_id)
    if entity is None or not entity.locode:
        return []

    source = (
        db.execute(
            text("""
                SELECT id, region, twenty_ft_eq_units_year
                FROM ports
                WHERE UPPER(locode) = UPPER(:locode)
                LIMIT 1
                """),
            {"locode": entity.locode},
        )
        .mappings()
        .first()
    )
    if not source or source["region"] is None:
        return []

    candidates = (
        db.execute(
            text("""
                SELECT id, locode, twenty_ft_eq_units_year
                FROM ports
                WHERE region = :src_region
                  AND id <> :src_id
                  AND (
                    :src_teu IS NULL
                    OR twenty_ft_eq_units_year BETWEEN :src_teu * 0.5 AND :src_teu * 1.5
                  )
                ORDER BY ABS(COALESCE(twenty_ft_eq_units_year, :src_teu) - :src_teu) ASC NULLS LAST
                LIMIT 4
                """),
            {
                "src_region": source["region"],
                "src_id": source["id"],
                "src_teu": source["twenty_ft_eq_units_year"],
                "source_entity_id": port_entity_id,
            },
        )
        .mappings()
        .all()
    )

    entity_ids: list[str] = []
    for row in candidates:
        locode = row.get("locode")
        if not locode:
            continue
        candidate_id = f"port-{str(locode).lower()}"
        candidate = PORTWATCH_ENTITY_BY_ID.get(candidate_id)
        if candidate and candidate.entity_type == "port":
            entity_ids.append(candidate_id)
    return entity_ids


def recommend_switch(db: Session, port_entity_id: str) -> SwitchRecommendation:
    """Rank same-region substitutes and return an operator-facing recommendation."""
    source = compute_port_pressure(db, port_entity_id)
    substitutes = [
        compute_port_pressure(db, substitute_id)
        for substitute_id in find_substitutes(db, port_entity_id)
    ]
    substitutes.sort(
        key=lambda item: (
            item.projection_7d if item.projection_7d is not None else float("inf"),
            item.z_score_30d if item.z_score_30d is not None else 0.0,
        )
    )

    generated_at = datetime.now(UTC)
    if not substitutes:
        reason = "No qualifying same-region substitute within +/-50% TEU band"
        return SwitchRecommendation(
            source=source,
            substitutes=[],
            recommendation=None,
            headline=f"{source.entity_name}: no monitored same-region substitute is available.",
            reason=reason,
            generated_at=generated_at,
        )

    if _is_benign(source):
        reason = "Source pressure within normal bounds; switching is not advised"
        return SwitchRecommendation(
            source=source,
            substitutes=substitutes,
            recommendation=None,
            headline=f"{source.entity_name} pressure is within normal bounds.",
            reason=reason,
            generated_at=generated_at,
        )

    best = substitutes[0]
    headline = _headline(source, best)
    return SwitchRecommendation(
        source=source,
        substitutes=substitutes,
        recommendation=best,
        headline=headline,
        reason=None,
        generated_at=generated_at,
    )


def generate_port_switch_insights(db: Session, *, limit: int = 5) -> int:
    """Persist top switch-port recommendations into the existing insights table."""
    result = db.execute(
        text("""
            SELECT DISTINCT ON (entity_id)
                   entity_id, entity_name, metric_value
            FROM portwatch_metrics
            WHERE entity_type = 'port'
              AND metric_name = ANY(:metric_names)
              AND source <> 'portwatch_demo'
            ORDER BY entity_id, observed_at DESC
            """),
        {"metric_names": ["daily_vessel_calls", "portcalls"]},
    )
    rows = sorted(
        list(result.mappings().all()),
        key=lambda row: float(row["metric_value"] or 0),
        reverse=True,
    )[:limit]

    created = 0
    for row in rows:
        entity_id = str(row["entity_id"])
        if entity_id not in PORTWATCH_ENTITY_BY_ID:
            continue
        rec = recommend_switch(db, entity_id)
        if rec.recommendation is None:
            continue
        payload = recommendation_to_dict(rec)
        db.add(
            Insight(
                category="port_switch",
                event_type="port_switch_recommended",
                title=f"Switch-port recommendation: {rec.source.entity_name}",
                narrative=rec.headline,
                source_metrics=payload,
                affected_entities=[
                    {
                        "type": "port",
                        "id": rec.source.entity_id,
                        "name": rec.source.entity_name,
                    },
                    {
                        "type": "port",
                        "id": rec.recommendation.entity_id,
                        "name": rec.recommendation.entity_name,
                    },
                ],
                attention_level="watch" if rec.source.anomaly_flag else "monitor",
                priority=6,
            )
        )
        created += 1
    db.commit()
    return created


def recommendation_to_dict(rec: SwitchRecommendation) -> dict[str, Any]:
    """Serialize a recommendation dataclass for API responses and JSONB payloads."""
    payload = _json_ready(asdict(rec))
    payload["caveats"] = PORT_SWITCH_CAVEATS
    return payload


def _json_ready(value: Any) -> Any:
    if isinstance(value, datetime):
        return _ensure_utc(value).isoformat()
    if isinstance(value, dict):
        return {key: _json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    return value


def _port_id_for_entity(db: Session, port_entity_id: str) -> int | None:
    entity = PORTWATCH_ENTITY_BY_ID[port_entity_id]
    if not entity.locode:
        return None
    row = (
        db.execute(
            text("""
                SELECT id
                FROM ports
                WHERE UPPER(locode) = UPPER(:locode)
                LIMIT 1
                """),
            {"locode": entity.locode},
        )
        .mappings()
        .first()
    )
    return int(row["id"]) if row and row["id"] is not None else None


def _ols_slope(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    x_mean = (len(values) - 1) / 2
    y_mean = sum(values) / len(values)
    denominator = sum((idx - x_mean) ** 2 for idx in range(len(values)))
    if denominator == 0:
        return None
    numerator = sum((idx - x_mean) * (value - y_mean) for idx, value in enumerate(values))
    return numerator / denominator


def _slope_pct(slope_per_day: float | None, values: list[float]) -> float | None:
    if slope_per_day is None or not values:
        return None
    mean_value = sum(values) / len(values)
    if mean_value == 0:
        return None
    return (slope_per_day * 7) / mean_value * 100


def _is_benign(pressure: PortPressure) -> bool:
    return abs(pressure.z_score_30d or 0.0) < 1.0 and abs(pressure.slope_7d_pct or 0.0) < 5.0


def _headline(source: PortPressure, best: PortPressure) -> str:
    savings = (source.projection_7d or 0.0) - (best.projection_7d or 0.0)
    return (
        f"Pressure at {source.entity_name}: {_fmt0(source.latest_vessel_calls)} calls/day, "
        f"{_fmt_signed0(source.slope_7d_pct)}% wk-over-wk (z={_fmt1(source.z_score_30d)}). "
        f"Consider {best.entity_name}: {_fmt0(best.projection_7d)} projected calls vs "
        f"{_fmt0(source.projection_7d)} - switch saves ~{_fmt0(savings)} calls/day of pressure."
    )


def _fmt0(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.0f}"


def _fmt_signed0(value: float | None) -> str:
    return "n/a" if value is None else f"{value:+.0f}"


def _fmt1(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.1f}"


def _latest_time(
    vessel_points: list[tuple[datetime, float]],
    anomaly_points: list[tuple[datetime, float]],
) -> datetime | None:
    times = [point[0] for point in vessel_points] + [point[0] for point in anomaly_points]
    return max(times) if times else None


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
