from __future__ import annotations

import asyncio
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import Anomaly
from app.llm.client import LLMClient
from app.llm.prompts import build_anomaly_prompt
from app.llm.safety import collect_allowed_numbers, validate_narrative

logger = structlog.get_logger(__name__)

DISCLAIMER = "AI-generated analysis; verify with sources."


async def explain_anomaly_payload(
    payload: dict[str, Any],
    *,
    fallback: str,
    client: LLMClient | None = None,
) -> str | None:
    system_prompt, user_prompt = build_anomaly_prompt(payload)
    result = await (client or LLMClient()).complete(
        feature="anomaly_explainer",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        tier="fast",
        temperature=0.3,
        max_tokens=250,
    )
    if result is None:
        return None
    explanation = _append_disclaimer(result.content)
    validation_passed = validate_narrative(explanation, collect_allowed_numbers(payload))
    logger.info(
        "llm_anomaly_explanation_validated",
        feature="anomaly_explainer",
        model=result.model,
        validation_passed=validation_passed,
    )
    if not validation_passed:
        logger.warning("llm_anomaly_explanation_rejected", fallback_used=True, fallback=fallback)
        return None
    return explanation


def explain_recent_high_anomalies(
    db: Session,
    *,
    limit: int = 10,
    client: LLMClient | None = None,
) -> int:
    """Explain recent high severity anomalies missing an explanation."""
    anomalies = (
        db.query(Anomaly)
        .filter(Anomaly.severity == "high")
        .filter(Anomaly.explanation.is_(None))
        .filter(Anomaly.detected_at >= text("NOW() - INTERVAL '7 days'"))
        .order_by(Anomaly.detected_at.desc())
        .limit(limit)
        .all()
    )
    explained = 0
    for anomaly in anomalies:
        payload = _payload_for_anomaly(db, anomaly)
        generated = asyncio.run(
            explain_anomaly_payload(payload, fallback=anomaly.description or "", client=client)
        )
        if generated is None:
            continue
        anomaly.explanation = generated
        explained += 1
    db.commit()
    return explained


def _payload_for_anomaly(db: Session, anomaly: Anomaly) -> dict[str, Any]:
    return {
        "anomaly": {
            "entity_type": anomaly.entity_type,
            "entity_id": anomaly.entity_id,
            "metric": anomaly.metric,
            "observed": anomaly.observed,
            "expected": anomaly.expected,
            "z_score": anomaly.z_score,
            "detected_at": anomaly.detected_at,
            "description": anomaly.description,
        },
        "co_occurring_signals": _co_occurring_anomalies(db, anomaly),
        "related_metrics": _related_metrics(db, anomaly),
        "seasonal_context": _seasonal_context(db, anomaly),
    }


def _co_occurring_anomalies(db: Session, anomaly: Anomaly) -> list[dict[str, Any]]:
    result = db.execute(
        text("""
            SELECT entity_type, entity_id, severity, metric, observed, expected,
                   z_score, detected_at
            FROM anomalies
            WHERE id <> :id
              AND detected_at BETWEEN :detected_at - INTERVAL '48 hours'
                                  AND :detected_at + INTERVAL '48 hours'
            ORDER BY detected_at DESC
            LIMIT 5
            """),
        {"id": anomaly.id, "detected_at": anomaly.detected_at},
    )
    return [dict(row) for row in result.mappings().all()]


def _related_metrics(db: Session, anomaly: Anomaly) -> dict[str, Any]:
    metrics: dict[str, Any] = {}
    port = db.execute(text("""
            SELECT AVG(score)::float AS port_risk
            FROM port_risk_scores
            WHERE time >= NOW() - INTERVAL '1 day'
            """)).mappings().first()
    if port and port["port_risk"] is not None:
        metrics["average_portwatch_risk"] = float(port["port_risk"])

    chokepoint = db.execute(text("""
            SELECT AVG(score)::float AS risk_score
            FROM chokepoint_risk_scores
            WHERE time >= NOW() - INTERVAL '1 day'
            """)).mappings().first()
    if chokepoint and chokepoint["risk_score"] is not None:
        metrics["average_chokepoint_risk_score"] = float(chokepoint["risk_score"])

    bunker = db.execute(text("""
            SELECT AVG(price_usd_per_ton)::float AS bunker_price
            FROM bunker_prices
            WHERE time >= NOW() - INTERVAL '1 day'
            """)).mappings().first()
    if bunker and bunker["bunker_price"] is not None:
        metrics["average_bunker_price"] = float(bunker["bunker_price"])
    return metrics


def _seasonal_context(db: Session, anomaly: Anomaly) -> dict[str, Any] | None:
    if anomaly.entity_type == "index":
        result = (
            db.execute(
                text("""
                SELECT value::float AS value
                FROM freight_indices
                WHERE index_name = :entity_id
                  AND time BETWEEN :detected_at - INTERVAL '367 days'
                              AND :detected_at - INTERVAL '363 days'
                ORDER BY ABS(EXTRACT(EPOCH FROM (time - (:detected_at - INTERVAL '365 days'))))
                LIMIT 1
                """),
                {"entity_id": anomaly.entity_id, "detected_at": anomaly.detected_at},
            )
            .mappings()
            .first()
        )
        if result and result["value"] is not None:
            return {"same_period_last_year_value": float(result["value"])}
    return None


def _append_disclaimer(text: str) -> str:
    cleaned = text.strip()
    if cleaned.endswith(DISCLAIMER):
        return cleaned
    return f"{cleaned.rstrip('.')} . {DISCLAIMER}".replace(" .", ".")
