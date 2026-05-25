"""Maritime risk score computation.

.. note:: AISStream boundary
    The ``vessel_positions`` and ``port_congestion`` tables are populated by
    AISStream and are reserved **exclusively** for live map visualisation and
    current vessel / port display.  They MUST NOT be used as inputs to risk
    score computation, port risk scores, or dashboard alerts.  All
    AIS-derived congestion signals have been removed from this module;
    port risk is computed solely from ``portwatch_metrics``, ``freight_indices``
    (weather), and PortWatch freshness.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import ChokepointRiskScore, DisruptionPropagation, Insight, PortRiskScore

PORT_COMPONENTS = {
    "daily_vessel_calls": "traffic_anomaly",
    "portcalls": "traffic_anomaly",
    "traffic_anomaly_index": "traffic_anomaly",
    "trade_volume_index": "trade_flow_change",
    "import": "trade_flow_change",
    "export": "trade_flow_change",
    "throughput": "bottleneck_stress",
}
CHOKEPOINT_COMPONENTS = {
    "daily_vessel_calls": "traffic_anomaly",
    "n_total": "traffic_anomaly",
    "n_container": "traffic_anomaly",
    "n_cargo": "traffic_anomaly",
    "traffic_anomaly_index": "traffic_anomaly",
    "transit_capacity_index": "bottleneck_stress",
    "vessel_count": "traffic_anomaly",
    "capacity": "bottleneck_stress",
}


def compute_maritime_risk_scores(db: Session) -> int:
    """Compute and persist port and chokepoint risk scores.

    Data sources: ``portwatch_metrics`` and ``freight_indices`` only.
    The AISStream-derived ``port_congestion`` table is **not** queried here;
    it is reserved for live map visualisation.
    """
    # Fetch latest weather context
    weather_res = db.execute(text("""
        SELECT DISTINCT ON (index_name) index_name, value
        FROM freight_indices
        WHERE source = 'openmeteo_marine'
        ORDER BY index_name, time DESC
    """)).mappings().all()
    max_wave = max([float(r["value"]) for r in weather_res], default=0.0)
    weather_score = round(min(15.0, (max_wave / 4.0) * 15.0), 2)

    # Fetch all ports
    ports_res = db.execute(text("SELECT id, locode, name FROM ports")).mappings().all()

    # Fetch latest PortWatch metrics and baselines
    rows = _latest_portwatch_metrics(db)
    baselines = _historical_baselines(db)
    grouped: dict[tuple[str, str, str], dict[str, float]] = {}
    latest_time: dict[tuple[str, str, str], datetime] = {}
    metric_times: dict[tuple[str, str, str], dict[str, datetime]] = {}

    for row in rows:
        key = (str(row["entity_type"]), str(row["entity_id"]), str(row["entity_name"]))
        grouped.setdefault(key, {})[str(row["metric_name"])] = float(row["metric_value"])
        latest_time[key] = max(latest_time.get(key, row["observed_at"]), row["observed_at"])
        metric_times.setdefault(key, {})[str(row["metric_name"])] = row["observed_at"]

    created = 0
    now = datetime.now(UTC)
    processed_port_entity_ids = set()

    # We first process grouped entities (both ports and chokepoints)
    for (entity_type, entity_id, entity_name), metrics in grouped.items():
        if entity_type == "port":
            processed_port_entity_ids.add(entity_id)
            # Resolve port_id
            port_id = None
            for p in ports_res:
                if p["locode"] == entity_id.replace("port-", "").upper() or p["name"].lower() == entity_name.lower():
                    port_id = p["id"]
                    break

            # AISStream boundary: port_congestion is visualization-only.
            # congestion_score is always 0.0; risk is derived from PortWatch metrics only.
            congestion_score = 0.0

            # Anomaly Score (0 to 45) — based on PortWatch metric deviation from baseline
            anomaly_score = 0.0
            pw_times = metric_times.get((entity_type, entity_id, entity_name), {})
            fresh_pw_metrics = []
            entity_baselines = baselines.get((entity_type, entity_id), {})
            for m_name, m_val in metrics.items():
                m_time = pw_times.get(m_name)
                # Check if PortWatch metric is fresh (within 72 hours of now)
                if m_time and (now - m_time.astimezone(UTC)).total_seconds() <= 72 * 3600:
                    base_val = entity_baselines.get(m_name)
                    if base_val and base_val > 0:
                        change_pct = (m_val - base_val) / base_val * 100
                        fresh_pw_metrics.append(min(45.0, abs(change_pct) * 0.9))
            if fresh_pw_metrics:
                anomaly_score = round(sum(fresh_pw_metrics) / len(fresh_pw_metrics), 2)

            # Weather Score (0 to 15) — calculated globally as weather_score

            # Data Quality Penalty (0 to 10) — based solely on PortWatch freshness.
            # AIS data quality is not included; port_congestion is visualization-only.
            pw_penalty = 10.0
            if pw_times:
                latest_pw_time = max(pw_times.values())
                if (now - latest_pw_time.astimezone(UTC)).total_seconds() <= 72 * 3600:
                    pw_penalty = 0.0
                else:
                    pw_penalty = 6.0

            data_quality_penalty = min(10.0, pw_penalty)

            # Sum composite score
            score = round(congestion_score + anomaly_score + weather_score + data_quality_penalty, 2)
            severity = severity_for_score(score)
            as_of = latest_time[(entity_type, entity_id, entity_name)]

            components = {
                "portwatch_anomaly": anomaly_score,
                "weather": weather_score,
                "data_quality": data_quality_penalty,
            }

            reasons = []
            if anomaly_score >= 30:
                reasons.append(f"Significant PortWatch traffic anomaly: score {anomaly_score:.1f}/45")
            elif anomaly_score >= 15:
                reasons.append(f"Moderate PortWatch traffic anomaly: score {anomaly_score:.1f}/45")

            if weather_score >= 10:
                reasons.append(f"Severe marine weather: score {weather_score:.1f}/15")
            elif weather_score >= 5:
                reasons.append(f"Moderate marine weather: score {weather_score:.1f}/15")

            if data_quality_penalty >= 7:
                reasons.append(f"Stale PortWatch data: penalty {data_quality_penalty:.1f}/10")
            elif data_quality_penalty >= 3:
                reasons.append(f"Aging PortWatch data: penalty {data_quality_penalty:.1f}/10")

            if not reasons:
                reasons.append("All PortWatch metrics within normal operational bounds.")

            common = {
                "time": now,
                "port_id": port_id,
                "entity_id": entity_id,
                "entity_name": entity_name,
                "score": score,
                "severity": severity,
                "component_scores": components,
                "missing_components": [k for k, v in components.items() if v == 0.0],
                "reasons": reasons,
                "source_metrics": metrics,
                "freshness_status": freshness_status(as_of),
                "as_of": as_of,
            }
            db.add(PortRiskScore(**common))
            created += 1

        else:
            # Chokepoint or region
            components, missing, reasons = score_components(
                metrics,
                entity_type=entity_type,
                baselines=baselines.get((entity_type, entity_id), {}),
            )
            score = round(sum(components.values()) / max(len(components), 1), 2)
            severity = severity_for_score(score)
            as_of = latest_time[(entity_type, entity_id, entity_name)]
            common = {
                "time": now,
                "entity_id": entity_id,
                "entity_name": entity_name,
                "score": score,
                "severity": severity,
                "component_scores": components,
                "missing_components": missing,
                "reasons": reasons,
                "source_metrics": metrics,
                "freshness_status": freshness_status(as_of),
                "as_of": as_of,
            }
            db.add(ChokepointRiskScore(**common))
            created += 1

    # Handle ports that have NO PortWatch metrics at all yet
    for port in ports_res:
        entity_id = f"port-{port['locode'].lower()}" if port["locode"] else f"port-{port['id']}"
        if entity_id in processed_port_entity_ids:
            continue

        # AISStream boundary: port_congestion is visualization-only.
        # No congestion score is computed here.
        congestion_score = 0.0

        pw_penalty = 10.0  # No PortWatch data at all
        data_quality_penalty = min(10.0, pw_penalty)

        score = round(congestion_score + weather_score + data_quality_penalty, 2)
        severity = severity_for_score(score)
        as_of = now

        components = {
            "portwatch_anomaly": 0.0,
            "weather": weather_score,
            "data_quality": data_quality_penalty,
        }

        reasons = ["No PortWatch metrics available."]
        if data_quality_penalty >= 5:
            reasons.append(f"Missing PortWatch data: penalty {data_quality_penalty:.1f}/10")

        common = {
            "time": now,
            "port_id": port["id"],
            "entity_id": entity_id,
            "entity_name": port["name"],
            "score": score,
            "severity": severity,
            "component_scores": components,
            "missing_components": ["portwatch_metrics"],
            "reasons": reasons,
            "source_metrics": {},
            "freshness_status": freshness_status(as_of),
            "as_of": as_of,
        }
        db.add(PortRiskScore(**common))
        created += 1

    db.commit()
    return created


def compute_disruption_propagation(db: Session, *, minimum_score: float = 70) -> int:
    rows = db.execute(
        text("""
            SELECT DISTINCT ON (entity_id)
                   entity_id, entity_name, score, severity, source_metrics, as_of
            FROM chokepoint_risk_scores
            WHERE score >= :minimum_score
            ORDER BY entity_id, time DESC
            """),
        {"minimum_score": minimum_score},
    ).mappings()
    created = 0
    now = datetime.now(UTC)
    downstream = {
        "cp-suez": ("port-nlrtm", "Rotterdam", "Asia-Europe container lane"),
        "cp-panama": ("port-uslax", "Los Angeles", "Trans-Pacific / US East Coast lane"),
        "cp-malacca": ("port-sgsin", "Singapore", "Asia hub feeder lane"),
        "region-red-sea": ("port-nlrtm", "Rotterdam", "Red Sea diversion lane"),
        "region-black-sea": ("port-nlrtm", "Rotterdam", "Black Sea-Europe bulk lane"),
    }
    for row in rows:
        entity_id = str(row["entity_id"])
        target = downstream.get(entity_id)
        if target is None:
            continue
        target_id, target_name, lane = target
        score = float(row["score"])
        explanation = (
            f"{row['entity_name']} stress score {score:.0f} can propagate to {target_name} "
            f"through {lane}."
        )
        db.add(
            DisruptionPropagation(
                source_entity_type="chokepoint",
                source_entity_id=entity_id,
                source_entity_name=str(row["entity_name"]),
                target_entity_type="port",
                target_entity_id=target_id,
                target_entity_name=target_name,
                route_lane=lane,
                severity=str(row["severity"]),
                confidence=min(0.9, score / 100),
                explanation=explanation,
                source_metrics=dict(row["source_metrics"] or {}),
                started_at=now,
                updated_at=now,
                status="active",
            )
        )
        created += 1
    db.commit()
    return created


def generate_risk_insights(db: Session, *, limit: int = 10) -> int:
    weather_context = latest_weather_context(db)
    economic_context = latest_economic_context(db)
    result = db.execute(
        text("""
            SELECT entity_id, entity_name, score, severity, component_scores,
                   reasons, source_metrics, as_of
            FROM (
                SELECT DISTINCT ON (entity_id)
                       entity_id, entity_name, score, severity, component_scores,
                       reasons, source_metrics, as_of, time
                FROM port_risk_scores
                ORDER BY entity_id, time DESC
            ) latest
            WHERE score >= 60
            ORDER BY score DESC
            LIMIT :limit
            """),
        {"limit": limit},
    )
    created = 0
    for row in result.mappings().all():
        score = float(row["score"])
        attention = "urgent" if score >= 85 else "watch"
        db.add(
            Insight(
                category="port_risk",
                event_type="port_risk_elevated",
                confidence=min(0.95, score / 100),
                title=f"{row['entity_name']} maritime risk is {row['severity']}",
                narrative=deterministic_risk_text(
                    str(row["entity_name"]),
                    score,
                    list(row["reasons"] or []),
                ),
                affected_entities=[
                    {"type": "port", "id": row["entity_id"], "name": row["entity_name"]}
                ],
                source_metrics={
                    **dict(row["source_metrics"] or {}),
                    "weather": weather_context,
                    "economic": economic_context,
                },
                metrics={
                    **dict(row["component_scores"] or {}),
                    "weather_impact": weather_context.get("score"),
                    "economic_pressure": economic_context.get("score"),
                },
                attention_level=attention,
                priority=9 if score >= 85 else 6,
            )
        )
        created += 1
    db.commit()
    return created


def score_components(
    metrics: dict[str, float],
    *,
    entity_type: str,
    baselines: dict[str, float] | None = None,
) -> tuple[dict[str, float], list[str], list[str]]:
    mapping = PORT_COMPONENTS if entity_type == "port" else CHOKEPOINT_COMPONENTS
    baselines = baselines or {}
    buckets: dict[str, list[float]] = {
        "derived_congestion_risk": [],
        "traffic_anomaly": [],
        "trade_flow_change": [],
        "bottleneck_stress": [],
    }
    for metric_name, value in metrics.items():
        component = _component_for(metric_name, mapping)
        if component is None:
            continue
        buckets[component].append(_normalize_metric(metric_name, value, baselines.get(metric_name)))
    if buckets["traffic_anomaly"]:
        buckets["derived_congestion_risk"].extend(buckets["traffic_anomaly"])
    components = {
        name: round(sum(values) / len(values), 2) for name, values in buckets.items() if values
    }
    missing = [name for name in buckets if name not in components]
    reasons = [f"{name.replace('_', ' ')} at {value:.0f}/100" for name, value in components.items()]
    return components, missing, reasons


def weather_route_impact(wave_m: float | None, wind_kph: float | None) -> dict[str, Any]:
    wave_score = min(100, max(0, (wave_m or 0) / 6 * 100))
    wind_score = min(100, max(0, (wind_kph or 0) / 80 * 100))
    score = round((wave_score + wind_score) / 2, 2)
    return {
        "score": score,
        "severity": severity_for_score(score),
        "wave_score": wave_score,
        "wind_score": wind_score,
    }


def economic_pressure_context(changes: dict[str, float]) -> dict[str, Any]:
    components = {name: min(100, abs(value) * 10) for name, value in changes.items()}
    score = round(sum(components.values()) / max(len(components), 1), 2)
    return {"score": score, "severity": severity_for_score(score), "components": components}


def latest_weather_context(db: Session) -> dict[str, Any]:
    result = db.execute(text("""
            SELECT DISTINCT ON (index_name) index_name, value
            FROM freight_indices
            WHERE source = 'openmeteo_marine'
            ORDER BY index_name, time DESC
            """))
    values = {str(row["index_name"]): float(row["value"]) for row in result.mappings().all()}
    max_wave = max(values.values(), default=0.0)
    context = weather_route_impact(wave_m=max_wave, wind_kph=None)
    context["max_wave_m"] = max_wave
    return context


def latest_economic_context(db: Session) -> dict[str, Any]:
    result = db.execute(text("""
            WITH ranked AS (
                SELECT index_name, value,
                       LAG(value) OVER (PARTITION BY index_name ORDER BY time) AS prev_value
                FROM freight_indices
                WHERE index_name IN ('BDI', 'FBX_GLOBAL', 'WCI_GLOBAL', 'BUNKER_VLSFO')
                  AND time >= NOW() - INTERVAL '90 days'
            )
            SELECT DISTINCT ON (index_name) index_name, value, prev_value
            FROM ranked
            WHERE prev_value IS NOT NULL
            ORDER BY index_name
            """))
    changes: dict[str, float] = {}
    for row in result.mappings().all():
        previous = float(row["prev_value"])
        if previous == 0:
            continue
        changes[str(row["index_name"])] = (float(row["value"]) - previous) / previous * 100
    return economic_pressure_context(changes)


def deterministic_risk_text(entity_name: str, score: float, reasons: list[str]) -> str:
    reason_text = "; ".join(reasons[:3]) if reasons else "limited source metrics available"
    return f"{entity_name} risk score is {score:.0f}/100. Drivers: {reason_text}."


def severity_for_score(score: float) -> str:
    if score >= 75:
        return "high"
    if score >= 45:
        return "medium"
    return "low"


def freshness_status(as_of: datetime) -> str:
    age_hours = (datetime.now(UTC) - as_of.astimezone(UTC)).total_seconds() / 3600
    if age_hours > 72:
        return "stale"
    if age_hours > 30:
        return "aging"
    return "fresh"


def _latest_portwatch_metrics(db: Session) -> list[dict[str, Any]]:
    result = db.execute(text("""
            SELECT DISTINCT ON (entity_type, entity_id, metric_name)
                   observed_at, entity_type, entity_id, entity_name, metric_name, metric_value
            FROM portwatch_metrics
            WHERE source <> 'portwatch_demo'
            ORDER BY entity_type, entity_id, metric_name, observed_at DESC
            """))
    return [dict(row) for row in result.mappings().all()]


def _historical_baselines(db: Session) -> dict[tuple[str, str], dict[str, float]]:
    result = db.execute(text("""
            WITH latest AS (
                SELECT entity_type, entity_id, metric_name, MAX(observed_at) AS latest_observed_at
                FROM portwatch_metrics
            WHERE source <> 'portwatch_demo'
            GROUP BY entity_type, entity_id, metric_name
            )
            SELECT pwm.entity_type,
                   pwm.entity_id,
                   pwm.metric_name,
                   AVG(pwm.metric_value)::float AS baseline
            FROM portwatch_metrics pwm
            JOIN latest
              ON latest.entity_type = pwm.entity_type
             AND latest.entity_id = pwm.entity_id
             AND latest.metric_name = pwm.metric_name
            WHERE pwm.observed_at >= NOW() - INTERVAL '60 days'
              AND pwm.observed_at < latest.latest_observed_at
              AND pwm.source <> 'portwatch_demo'
            GROUP BY pwm.entity_type, pwm.entity_id, pwm.metric_name
            """))
    baselines: dict[tuple[str, str], dict[str, float]] = {}
    for row in result.mappings().all():
        key = (str(row["entity_type"]), str(row["entity_id"]))
        baselines.setdefault(key, {})[str(row["metric_name"])] = float(row["baseline"])
    return baselines


def _component_for(metric_name: str, mapping: dict[str, str]) -> str | None:
    lowered = metric_name.lower()
    for token, component in mapping.items():
        if token in lowered:
            return component
    return None


def _normalize_metric(metric_name: str, value: float, baseline: float | None = None) -> float:
    lowered = metric_name.lower()
    if baseline and baseline > 0:
        change_pct = (value - baseline) / baseline * 100
        if "capacity" in lowered:
            return max(0, min(100, -change_pct * 2))
        return max(0, min(100, abs(change_pct) * 2))
    if "capacity" in lowered:
        return max(0, min(100, 100 - value))
    if "anomaly" in lowered or "index" in lowered:
        return max(0, min(100, abs(value)))
    if "call" in lowered or "vessel" in lowered or "transit" in lowered or lowered.startswith("n_"):
        return max(0, min(100, value / 2))
    return max(0, min(100, abs(value)))
