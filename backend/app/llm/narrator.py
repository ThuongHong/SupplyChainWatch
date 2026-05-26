from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.db.models import Insight
from app.llm.client import LLMClient
from app.llm.prompts import build_narrative_prompt, build_port_switch_prompt
from app.llm.safety import collect_allowed_numbers, validate_narrative

logger = structlog.get_logger(__name__)

FRIENDLY_INDEX_NAMES = {
    "BDI": "Baltic Dry Index",
    "FBX_GLOBAL": "Freightos Baltic Index - Global",
    "WCI_GLOBAL": "Drewry World Container Index - Global",
    "SCFI": "Shanghai Containerized Freight Index",
}


async def enrich_insight_payload(
    payload: dict[str, Any],
    *,
    fallback: str,
    client: LLMClient | None = None,
) -> tuple[str, str] | None:
    """Generate a validated narrative for one insight payload."""
    system_prompt, user_prompt = build_narrative_prompt(payload)
    result = await (client or LLMClient()).complete(
        feature="insight_narrator",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        tier="fast",
        temperature=0.3,
        max_tokens=200,
    )
    if result is None:
        return None
    allowed_numbers = collect_allowed_numbers(payload)
    validation_passed = validate_narrative(result.content, allowed_numbers)
    logger.info(
        "llm_narrative_validated",
        feature="insight_narrator",
        model=result.model,
        validation_passed=validation_passed,
    )
    if not validation_passed:
        logger.warning("llm_narrative_rejected", fallback_used=True, fallback=fallback)
        return None
    return result.content, result.model


async def enrich_port_switch_insight(
    payload: dict[str, Any],
    *,
    fallback: str,
    client: LLMClient | None = None,
) -> tuple[str, str] | None:
    """Generate a validated operator narrative for a switch-port recommendation."""
    system_prompt, user_prompt = build_port_switch_prompt(payload)
    result = await (client or LLMClient()).complete(
        feature="port_switch_narrator",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        tier="fast",
        temperature=0.3,
        max_tokens=180,
    )
    if result is None:
        return None
    allowed_numbers = collect_allowed_numbers(payload)
    validation_passed = validate_narrative(result.content, allowed_numbers)
    logger.info(
        "llm_narrative_validated",
        feature="port_switch_narrator",
        model=result.model,
        validation_passed=validation_passed,
    )
    if not validation_passed:
        logger.warning("llm_narrative_rejected", fallback_used=True, fallback=fallback)
        return None
    return result.content, result.model


def enrich_top_insights(db: Session, *, limit: int = 10, client: LLMClient | None = None) -> int:
    """Enrich high-priority insights generated during the last 24 hours."""
    insights = (
        db.query(Insight)
        .filter(Insight.narrative_llm.is_(None))
        .filter(or_(Insight.priority >= 7, Insight.category == "port_switch"))
        .filter(Insight.generated_at >= text("NOW() - INTERVAL '24 hours'"))
        .order_by(Insight.priority.desc(), Insight.generated_at.desc())
        .limit(limit)
        .all()
    )
    enriched = 0
    for insight in insights:
        if insight.category == "port_switch":
            payload = _payload_for_port_switch(insight)
            generated = _run_async(
                enrich_port_switch_insight(payload, fallback=insight.narrative, client=client)
            )
        else:
            payload = _payload_for_insight(db, insight)
            generated = _run_async(
                enrich_insight_payload(payload, fallback=insight.narrative, client=client)
            )
        if generated is None:
            continue
        narrative, model = generated
        insight.narrative_llm = narrative
        insight.narrative_model = model
        insight.narrative_generated_at = datetime.now(UTC)
        enriched += 1
    db.commit()
    return enriched


def _payload_for_port_switch(insight: Insight) -> dict[str, Any]:
    metrics = insight.source_metrics or {}
    source = metrics.get("source") if isinstance(metrics.get("source"), dict) else {}
    recommendation = (
        metrics.get("recommendation") if isinstance(metrics.get("recommendation"), dict) else {}
    )
    source_projection = _float_or_none(source.get("projection_7d"))
    sub_projection = _float_or_none(recommendation.get("projection_7d"))
    savings = None
    if source_projection is not None and sub_projection is not None:
        savings = source_projection - sub_projection
    return {
        "source_name": source.get("entity_name"),
        "source_calls": _float_or_none(source.get("latest_vessel_calls")),
        "source_slope_pct": _float_or_none(source.get("slope_7d_pct")),
        "source_z": _float_or_none(source.get("z_score_30d")),
        "source_projection": source_projection,
        "sub_name": recommendation.get("entity_name"),
        "sub_calls": _float_or_none(recommendation.get("latest_vessel_calls")),
        "sub_projection": sub_projection,
        "savings_calls": savings,
        "caveats": metrics.get("caveats") or [],
        "template_narrative": insight.narrative,
    }


def _payload_for_insight(db: Session, insight: Insight) -> dict[str, Any]:
    metrics = insight.metrics or {}
    index_name = str(
        metrics.get("index_name")
        or metrics.get("index")
        or metrics.get("entity_id")
        or _index_name_from_title(insight.title)
        or "unknown"
    )
    current_value = _float_or_none(metrics.get("current") or metrics.get("observed"))
    prev_value = _float_or_none(metrics.get("previous") or metrics.get("expected"))
    pct_change = _float_or_none(metrics.get("pct_change"))
    return {
        "index_name": index_name,
        "index_friendly_name": FRIENDLY_INDEX_NAMES.get(index_name, index_name),
        "current_value": current_value,
        "prev_value": prev_value,
        "pct_change": pct_change,
        "period_days": 7,
        "historical_rank": _historical_rank(db, index_name, current_value),
        "related_signals": _related_signals(db),
        "detected_anomalies": _recent_related_anomalies(db, index_name),
        "template_narrative": insight.narrative,
    }


def _historical_rank(db: Session, index_name: str, current_value: float | None) -> str | None:
    if current_value is None or index_name == "unknown":
        return None
    result = (
        db.execute(
            text("""
            SELECT MAX(value)::float AS max_value, MIN(value)::float AS min_value
            FROM freight_indices
            WHERE index_name = :index_name
              AND time >= NOW() - INTERVAL '90 days'
            """),
            {"index_name": index_name},
        )
        .mappings()
        .first()
    )
    if not result:
        return None
    if result["max_value"] is not None and abs(float(result["max_value"]) - current_value) < 0.01:
        return "highest in 90 days"
    if result["min_value"] is not None and abs(float(result["min_value"]) - current_value) < 0.01:
        return "lowest in 90 days"
    return None


def _related_signals(db: Session) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    result = db.execute(text("""
            WITH latest AS (
                SELECT AVG(score)::float AS value
                FROM port_risk_scores
                WHERE time >= NOW() - INTERVAL '1 day'
            ),
            previous AS (
                SELECT AVG(score)::float AS value
                FROM port_risk_scores
                WHERE time >= NOW() - INTERVAL '8 days'
                  AND time < NOW() - INTERVAL '7 days'
            )
            SELECT latest.value AS value, (latest.value - previous.value)::float AS change
            FROM latest, previous
            """)).mappings().first()
    if result and result["value"] is not None:
        signals.append(
            {
                "signal_name": "average_portwatch_risk",
                "value": float(result["value"]),
                "change": _float_or_none(result["change"]),
            }
        )

    bunker = db.execute(text("""
            WITH latest AS (
                SELECT AVG(price_usd_per_ton)::float AS value
                FROM bunker_prices
                WHERE time >= NOW() - INTERVAL '1 day'
            ),
            previous AS (
                SELECT AVG(price_usd_per_ton)::float AS value
                FROM bunker_prices
                WHERE time >= NOW() - INTERVAL '8 days'
                  AND time < NOW() - INTERVAL '7 days'
            )
            SELECT latest.value AS value, (latest.value - previous.value)::float AS change
            FROM latest, previous
            """)).mappings().first()
    if bunker and bunker["value"] is not None:
        signals.append(
            {
                "signal_name": "average_bunker_price",
                "value": float(bunker["value"]),
                "change": _float_or_none(bunker["change"]),
            }
        )
    return signals


def _recent_related_anomalies(db: Session, index_name: str) -> list[dict[str, Any]]:
    result = db.execute(
        text("""
            SELECT entity_type, entity_id, severity, metric, observed, expected, z_score
            FROM anomalies
            WHERE detected_at >= NOW() - INTERVAL '7 days'
              AND (
                  :index_name = 'unknown'
                  OR entity_id = :index_name
                  OR entity_type IN ('port', 'chokepoint')
              )
            ORDER BY detected_at DESC
            LIMIT 5
            """),
        {"index_name": index_name},
    )
    return [dict(row) for row in result.mappings().all()]


def _index_name_from_title(title: str) -> str | None:
    for candidate in FRIENDLY_INDEX_NAMES:
        if candidate in title:
            return candidate
    return None


def _float_or_none(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)


def _run_async(coro: Any) -> Any:
    return asyncio.run(coro)
