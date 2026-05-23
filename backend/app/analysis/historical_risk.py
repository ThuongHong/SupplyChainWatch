from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from statistics import mean, pstdev
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.analysis.maritime_risk import score_components, severity_for_score
from app.config import get_settings
from app.db.models import (
    DataCoverage,
    EntityRiskForecast,
    Insight,
    RiskFeatureSnapshot,
    RiskStoryEvent,
)

FEATURE_SCHEMA_VERSION = "risk_features_v1"


def compute_data_coverage(db: Session, *, expected_window_days: int | None = None) -> int:
    """Summarize real source history depth by entity/source."""
    settings = get_settings()
    window_days = expected_window_days or settings.portwatch_history_days
    logs = {str(row["source"]): row for row in db.execute(text("""
                SELECT DISTINCT ON (source) source, status, finished_at
                FROM collection_log
                ORDER BY source, finished_at DESC NULLS LAST, started_at DESC
                """)).mappings().all()}
    rows = db.execute(text("""
                SELECT source, entity_type, entity_id, entity_name,
                       MIN(observed_at) AS first_observed_at,
                       MAX(observed_at) AS latest_observed_at,
                       COUNT(*)::int AS observed_rows,
                       COUNT(DISTINCT DATE(observed_at))::int AS observed_days
                FROM portwatch_metrics
                WHERE source <> 'portwatch_demo'
                GROUP BY source, entity_type, entity_id, entity_name
                """)).mappings().all()
    now = datetime.now(UTC)
    created = 0
    for row in rows:
        latest = _as_datetime(row["latest_observed_at"])
        expected_days = _expected_days(
            row["first_observed_at"], row["latest_observed_at"], window_days
        )
        observed_days = int(row.get("observed_days") or 0)
        log = logs.get(str(row["source"]))
        db.merge(
            DataCoverage(
                source=str(row["source"]),
                entity_type=str(row["entity_type"]),
                entity_id=str(row["entity_id"]),
                entity_name=str(row["entity_name"]),
                first_observed_at=_as_datetime(row["first_observed_at"]),
                latest_observed_at=latest,
                observed_rows=int(row["observed_rows"] or 0),
                expected_days=expected_days,
                missing_days=max(0, expected_days - observed_days),
                freshness_status=_freshness_status(latest),
                last_collection_status=str(log["status"]) if log else None,
                updated_at=now,
                metadata_={
                    "observed_days": observed_days,
                    "expected_window_days": window_days,
                    "source": "real",
                },
            )
        )
        created += 1
    db.commit()
    return created


def build_risk_feature_snapshots(
    db: Session,
    *,
    baseline_window_days: int = 30,
) -> int:
    """Build daily prediction-ready feature snapshots from real history."""
    rows = _daily_portwatch_risk_rows(db)
    if not rows:
        rows = _stored_risk_rows(db)
    latest_by_entity_day: dict[tuple[str, date], dict[str, Any]] = {}
    for row in rows:
        row_dict = dict(row)
        key = (str(row["entity_id"]), _as_datetime(row["time"]).date())
        existing = latest_by_entity_day.get(key)
        if existing is None or _as_datetime(row["time"]) > _as_datetime(existing["time"]):
            latest_by_entity_day[key] = row_dict

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in latest_by_entity_day.values():
        grouped[str(row["entity_id"])].append(row)

    created = 0
    now = datetime.now(UTC)
    for entity_rows in grouped.values():
        entity_rows.sort(key=lambda item: _as_datetime(item["time"]))
        scores: list[float] = []
        for row in entity_rows:
            score = float(row["score"])
            baseline_sample = scores[-baseline_window_days:]
            baseline = mean(baseline_sample) if baseline_sample else score
            std = pstdev(baseline_sample) if len(baseline_sample) > 1 else 0.0
            previous = scores[-1] if scores else score
            delta = score - previous
            percent = (delta / baseline * 100) if baseline else 0.0
            z_score = ((score - baseline) / std) if std else 0.0
            scores.append(score)

            component_scores = dict(row["component_scores"] or {})
            source_metrics = dict(row["source_metrics"] or {})
            missing = list(row["missing_components"] or [])
            feature_values = {
                "risk_score": score,
                **{str(key): float(value) for key, value in component_scores.items()},
                **{str(key): float(value) for key, value in source_metrics.items()},
            }
            db.merge(
                RiskFeatureSnapshot(
                    snapshot_date=_as_datetime(row["time"]).date(),
                    entity_type=str(row["entity_type"]),
                    entity_id=str(row["entity_id"]),
                    entity_name=str(row["entity_name"]),
                    risk_score=score,
                    severity=str(row["severity"]),
                    feature_values=feature_values,
                    baseline_values={"risk_score": round(baseline, 4)},
                    z_scores={"risk_score": round(z_score, 4)},
                    deltas={"risk_score": round(delta, 4), "risk_score_pct": round(percent, 4)},
                    missing_features=missing,
                    source_freshness={
                        "status": row["freshness_status"],
                        "as_of": _as_datetime(row["as_of"]).isoformat(),
                    },
                    driver_metadata={
                        "component_scores": component_scores,
                        "source_metrics": source_metrics,
                    },
                    feature_schema_version=FEATURE_SCHEMA_VERSION,
                    updated_at=now,
                )
            )
            created += 1
    db.commit()
    return created


def _stored_risk_rows(db: Session) -> list[dict[str, Any]]:
    return list(db.execute(text("""
                SELECT * FROM (
                    SELECT time, 'port' AS entity_type, entity_id, entity_name, score,
                           severity, component_scores, missing_components, source_metrics,
                           freshness_status, as_of
                    FROM port_risk_scores
                    UNION ALL
                    SELECT time,
                           CASE
                             WHEN entity_id LIKE 'region-%' THEN 'region'
                             ELSE 'chokepoint'
                           END AS entity_type,
                           entity_id, entity_name, score, severity, component_scores,
                           missing_components, source_metrics, freshness_status, as_of
                    FROM chokepoint_risk_scores
                ) risk_union
                ORDER BY entity_id, time
                """)).mappings().all())


def _daily_portwatch_risk_rows(db: Session) -> list[dict[str, Any]]:
    raw_rows = db.execute(text("""
                SELECT DATE(observed_at) AS observed_date, entity_type, entity_id,
                       entity_name, metric_name, SUM(metric_value)::float AS metric_value,
                       source, MAX(observed_at) AS latest_observed_at
                FROM portwatch_metrics
                WHERE source <> 'portwatch_demo'
                GROUP BY DATE(observed_at), entity_type, entity_id, entity_name,
                         metric_name, source
                ORDER BY entity_id, observed_date, metric_name
                -- daily_portwatch
                """)).mappings().all()
    grouped: dict[tuple[str, date], dict[str, Any]] = {}
    for row in raw_rows:
        observed_date = _as_date(row["observed_date"])
        key = (str(row["entity_id"]), observed_date)
        bucket = grouped.setdefault(
            key,
            {
                "time": datetime.combine(observed_date, datetime.min.time(), tzinfo=UTC),
                "entity_type": str(row["entity_type"]),
                "entity_id": str(row["entity_id"]),
                "entity_name": str(row["entity_name"]),
                "source_metrics": {},
                "as_of": _as_datetime(row["latest_observed_at"]),
            },
        )
        metric_name = str(row["metric_name"])
        bucket["source_metrics"][metric_name] = float(row["metric_value"])
        bucket["as_of"] = max(bucket["as_of"], _as_datetime(row["latest_observed_at"]))

    rows: list[dict[str, Any]] = []
    for bucket in grouped.values():
        entity_type = str(bucket["entity_type"])
        metrics = dict(bucket["source_metrics"])
        components, missing, _ = score_components(metrics, entity_type=entity_type)
        score = round(sum(components.values()) / max(len(components), 1), 2)
        rows.append(
            {
                **bucket,
                "score": score,
                "severity": severity_for_score(score),
                "component_scores": components,
                "missing_components": missing,
                "freshness_status": _freshness_status(bucket["as_of"]),
            }
        )
    rows.sort(key=lambda item: (str(item["entity_id"]), _as_datetime(item["time"])))
    return rows


def generate_risk_story_events(
    db: Session,
    *,
    z_threshold: float | None = None,
    percent_change_threshold: float | None = None,
) -> int:
    """Generate structured historical risk story events from feature snapshots."""
    settings = get_settings()
    z_limit = z_threshold or settings.risk_story_z_threshold
    pct_limit = percent_change_threshold or settings.risk_story_percent_change_threshold
    rows = db.execute(text("""
                SELECT snapshot_date, entity_type, entity_id, entity_name, risk_score,
                       severity, feature_values, baseline_values, z_scores, deltas,
                       missing_features, source_freshness, driver_metadata
                FROM risk_feature_snapshots
                ORDER BY entity_id, snapshot_date
                """)).mappings().all()
    created = 0
    previous_driver_by_entity: dict[str, str] = {}
    for row in rows:
        score = _optional_float(row["risk_score"])
        if score is None:
            continue
        entity_id = str(row["entity_id"])
        entity_name = str(row["entity_name"])
        event_date = _as_date(row["snapshot_date"])
        event_time = datetime.combine(event_date, datetime.min.time(), tzinfo=UTC)
        drivers = _drivers(row["driver_metadata"])
        top_driver = drivers[0] if drivers else None
        previous_driver = previous_driver_by_entity.get(entity_id)
        if top_driver:
            previous_driver_by_entity[entity_id] = top_driver
        if previous_driver and top_driver and previous_driver != top_driver:
            narrative = deterministic_driver_change_text(
                entity_name, previous_driver, top_driver, score
            )
            event = RiskStoryEvent(
                event_key=f"{entity_id}:{event_date.isoformat()}:driver_change:{top_driver}",
                event_time=event_time,
                entity_type=str(row["entity_type"]),
                entity_id=entity_id,
                entity_name=entity_name,
                event_type="driver_change",
                severity=str(row["severity"]),
                metric="top_driver",
                observed=score,
                expected=None,
                z_score=None,
                percent_change=None,
                drivers=dict(row["driver_metadata"] or {}),
                source_metrics=dict((row["driver_metadata"] or {}).get("source_metrics") or {}),
                narrative=narrative,
                confidence=0.7,
                attention_level="watch" if score >= 65 else "monitor",
                data_sufficiency={
                    "missing_features": list(row["missing_features"] or []),
                    "source_freshness": row["source_freshness"],
                },
            )
            db.merge(event)
            db.add(
                Insight(
                    category="risk_story",
                    event_type=event.event_type,
                    confidence=event.confidence,
                    title=f"{event.entity_name} risk driver changed",
                    narrative=narrative,
                    affected_entities=[
                        {
                            "type": event.entity_type,
                            "id": event.entity_id,
                            "name": event.entity_name,
                        }
                    ],
                    source_metrics=event.source_metrics,
                    metrics={"previous_driver": previous_driver, "current_driver": top_driver},
                    attention_level=event.attention_level,
                    priority=6 if score >= 65 else 3,
                )
            )
            created += 1
        z_score = float((row["z_scores"] or {}).get("risk_score") or 0)
        pct = float((row["deltas"] or {}).get("risk_score_pct") or 0)
        if abs(z_score) < z_limit and abs(pct) < pct_limit:
            continue
        event_type = "risk_recovery" if z_score < 0 or pct < 0 else "risk_worsening"
        observed = score
        expected = _optional_float((row["baseline_values"] or {}).get("risk_score"))
        confidence = min(0.95, 0.45 + min(abs(z_score), 5) * 0.1 + min(abs(pct), 100) / 400)
        attention = "urgent" if score >= 85 else "watch" if score >= 65 else "monitor"
        narrative = deterministic_story_text(
            entity_name, event_type, observed, expected, z_score, pct
        )
        event = RiskStoryEvent(
            event_key=f"{entity_id}:{event_date.isoformat()}:{event_type}:risk_score",
            event_time=event_time,
            entity_type=str(row["entity_type"]),
            entity_id=entity_id,
            entity_name=entity_name,
            event_type=event_type,
            severity=str(row["severity"]),
            metric="risk_score",
            observed=observed,
            expected=expected,
            z_score=round(z_score, 4),
            percent_change=round(pct, 4),
            drivers=dict(row["driver_metadata"] or {}),
            source_metrics=dict((row["driver_metadata"] or {}).get("source_metrics") or {}),
            narrative=narrative,
            confidence=round(confidence, 4),
            attention_level=attention,
            data_sufficiency={
                "missing_features": list(row["missing_features"] or []),
                "source_freshness": row["source_freshness"],
            },
        )
        db.merge(event)
        db.add(
            Insight(
                category="risk_story",
                event_type=event_type,
                confidence=event.confidence,
                title=f"{event.entity_name} {event_type.replace('_', ' ')}",
                narrative=narrative,
                affected_entities=[
                    {"type": event.entity_type, "id": event.entity_id, "name": event.entity_name}
                ],
                source_metrics=event.source_metrics,
                metrics={
                    "observed": observed,
                    "expected": expected,
                    "z_score": event.z_score,
                    "percent_change": event.percent_change,
                },
                attention_level=attention,
                priority=9 if attention == "urgent" else 6 if attention == "watch" else 3,
            )
        )
        created += 1
    db.commit()
    return created


def generate_entity_risk_forecasts(
    db: Session,
    *,
    minimum_history_days: int | None = None,
    horizon_days: int | None = None,
    max_gap_rate: float | None = None,
) -> int:
    """Generate deterministic baseline entity risk forecasts from feature snapshots."""
    settings = get_settings()
    min_days = minimum_history_days or settings.risk_forecast_min_history_days
    horizon = horizon_days or settings.risk_forecast_horizon_days
    gap_limit = max_gap_rate if max_gap_rate is not None else settings.risk_forecast_max_gap_rate
    rows = db.execute(text("""
                SELECT snapshot_date, entity_type, entity_id, entity_name, risk_score,
                       feature_values, missing_features, source_freshness, driver_metadata,
                       feature_schema_version
                FROM risk_feature_snapshots
                WHERE risk_score IS NOT NULL
                ORDER BY entity_id, snapshot_date
                """)).mappings().all()
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row["entity_id"])].append(dict(row))

    created = 0
    now = datetime.now(UTC)
    for entity_rows in grouped.values():
        entity_rows.sort(key=lambda item: _as_date(item["snapshot_date"]))
        first = entity_rows[0]
        scores = [float(row["risk_score"]) for row in entity_rows]
        first_date = _as_date(entity_rows[0]["snapshot_date"])
        last_date = _as_date(entity_rows[-1]["snapshot_date"])
        expected_days = (last_date - first_date).days + 1
        missing_dates = max(0, expected_days - len(entity_rows))
        gap_rate = missing_dates / max(expected_days, 1)
        missing_feature_rate = sum(1 for row in entity_rows if row.get("missing_features")) / max(
            len(entity_rows), 1
        )
        stale_rate = sum(
            1 for row in entity_rows if (row.get("source_freshness") or {}).get("status") == "stale"
        ) / max(len(entity_rows), 1)
        sufficient = len(entity_rows) >= min_days and gap_rate <= gap_limit
        unavailable = None if sufficient else "insufficient_history"
        train = scores[-min_days:] if sufficient else scores
        baseline = mean(train) if train else 0.0
        recent_delta = (scores[-1] - scores[-min(7, len(scores))]) / max(min(7, len(scores)) - 1, 1)
        predictions = []
        for offset in range(1, horizon + 1):
            yhat = min(100.0, max(0.0, baseline + recent_delta * offset))
            predictions.append(
                {
                    "ds": (last_date + timedelta(days=offset)).isoformat(),
                    "risk_score": round(yhat, 2),
                    "lower": round(max(0.0, yhat - 8), 2),
                    "upper": round(min(100.0, yhat + 8), 2),
                }
            )
        confidence_penalty = gap_rate * 0.5 + missing_feature_rate * 0.25 + stale_rate * 0.15
        confidence = 0.0 if not sufficient else max(0.2, min(0.85, 0.85 - confidence_penalty))
        db.merge(
            EntityRiskForecast(
                forecast_key=f"{first['entity_id']}:{horizon}:{FEATURE_SCHEMA_VERSION}",
                created_at=now,
                entity_type=str(first["entity_type"]),
                entity_id=str(first["entity_id"]),
                entity_name=str(first["entity_name"]),
                horizon_days=horizon,
                predictions=predictions if sufficient else [],
                confidence=round(confidence, 4),
                train_window_start=(
                    _as_date(entity_rows[0]["snapshot_date"]) if entity_rows else None
                ),
                train_window_end=last_date if entity_rows else None,
                data_sufficiency_status="sufficient" if sufficient else "insufficient_history",
                unavailable_reason=unavailable,
                key_drivers=_drivers(entity_rows[-1].get("driver_metadata")),
                metrics={
                    "history_days": len(entity_rows),
                    "minimum_history_days": min_days,
                    "gap_rate": round(gap_rate, 4),
                    "missing_dates": missing_dates,
                    "missing_feature_rate": round(missing_feature_rate, 4),
                    "stale_rate": round(stale_rate, 4),
                    "last_actual": scores[-1] if scores else None,
                    "baseline": round(baseline, 4),
                },
                model_name="risk_moving_average_baseline",
                model_params={"window_days": min_days, "recent_delta_days": 7},
                feature_schema_version=FEATURE_SCHEMA_VERSION,
            )
        )
        created += 1
    db.commit()
    return created


def deterministic_story_text(
    entity_name: str,
    event_type: str,
    observed: float,
    expected: float | None,
    z_score: float,
    percent_change: float,
) -> str:
    direction = "rose" if event_type == "risk_worsening" else "eased"
    baseline = f" versus baseline {expected:.1f}" if expected is not None else ""
    return (
        f"{entity_name} risk {direction} to {observed:.0f}/100{baseline}. "
        f"Change is {percent_change:.1f}% with z-score {z_score:.2f}; review real source drivers."
    )


def deterministic_driver_change_text(
    entity_name: str,
    previous_driver: str,
    current_driver: str,
    risk_score: float,
) -> str:
    return (
        f"{entity_name} risk driver changed from {previous_driver} to {current_driver} "
        f"while risk score is {risk_score:.0f}/100; review whether the operational cause shifted."
    )


def _expected_days(first: object, latest: object, configured_window: int) -> int:
    if first is None or latest is None:
        return configured_window
    span = (_as_datetime(latest).date() - _as_datetime(first).date()).days + 1
    return min(configured_window, max(0, span))


def _freshness_status(latest: datetime | None) -> str:
    if latest is None:
        return "empty"
    age = datetime.now(UTC) - latest
    if age > timedelta(hours=72):
        return "stale"
    if age > timedelta(hours=30):
        return "aging"
    return "fresh"


def _drivers(metadata: object) -> list[str]:
    if not isinstance(metadata, dict):
        return []
    component_scores = metadata.get("component_scores")
    if isinstance(component_scores, dict) and component_scores:
        return [
            str(key)
            for key, _ in sorted(component_scores.items(), key=lambda item: item[1], reverse=True)
        ]
    top_driver = metadata.get("top_driver")
    return [str(top_driver)] if top_driver else []


def _optional_float(value: object) -> float | None:
    if value is None:
        return None
    return float(value)


def _as_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time(), tzinfo=UTC)
    raise TypeError(f"Expected datetime/date, got {type(value)!r}")


def _as_date(value: object) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raise TypeError(f"Expected datetime/date, got {type(value)!r}")
