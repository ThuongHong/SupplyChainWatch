from __future__ import annotations

import asyncio
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import Forecast
from app.llm.client import LLMClient
from app.llm.prompts import build_forecast_prompt
from app.llm.safety import collect_allowed_numbers, validate_narrative

logger = structlog.get_logger(__name__)


async def comment_forecast_payload(
    payload: dict[str, Any],
    *,
    fallback: str,
    client: LLMClient | None = None,
) -> str | None:
    system_prompt, user_prompt = build_forecast_prompt(payload)
    result = await (client or LLMClient()).complete(
        feature="forecast_commentary",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        tier="fast",
        temperature=0.3,
        max_tokens=120,
    )
    if result is None:
        return None
    validation_passed = validate_narrative(result.content, collect_allowed_numbers(payload))
    logger.info(
        "llm_forecast_commentary_validated",
        feature="forecast_commentary",
        model=result.model,
        validation_passed=validation_passed,
    )
    if not validation_passed:
        logger.warning("llm_forecast_commentary_rejected", fallback_used=True, fallback=fallback)
        return None
    return result.content


def comment_recent_forecasts(
    db: Session,
    *,
    limit: int = 10,
    client: LLMClient | None = None,
) -> int:
    """Add commentary to recently generated forecasts."""
    forecasts = (
        db.query(Forecast)
        .filter(Forecast.commentary.is_(None))
        .filter(Forecast.created_at >= text("NOW() - INTERVAL '24 hours'"))
        .order_by(Forecast.created_at.desc())
        .limit(limit)
        .all()
    )
    commented = 0
    for forecast in forecasts:
        payload = _payload_for_forecast(db, forecast)
        fallback = _template_commentary(forecast)
        generated = asyncio.run(comment_forecast_payload(payload, fallback=fallback, client=client))
        if generated is None:
            forecast.commentary = fallback
        else:
            forecast.commentary = generated
        commented += 1
    db.commit()
    return commented


def _payload_for_forecast(db: Session, forecast: Forecast) -> dict[str, Any]:
    predictions = forecast.predictions
    first = predictions[0] if predictions else {}
    final = predictions[-1] if predictions else {}
    current_value = _float_or_none(forecast.metrics.get("last_actual"))
    final_value = _float_or_none(final.get("yhat"))
    direction = _direction(current_value, final_value)
    lower = _float_or_none(final.get("yhat_lower"))
    upper = _float_or_none(final.get("yhat_upper"))
    return {
        "index_name": forecast.index_name,
        "current_value": current_value,
        "forecast_values": predictions,
        "forecast_start": first,
        "forecast_end": final,
        "forecast_direction": direction,
        "confidence_interval_width": (
            (upper - lower) if upper is not None and lower is not None else None
        ),
        "mape": forecast.metrics.get("mape"),
        "recent_related_signals": _recent_related_signals(db),
    }


def _template_commentary(forecast: Forecast) -> str:
    predictions = forecast.predictions
    final = predictions[-1] if predictions else {}
    mape = forecast.metrics.get("mape")
    return (
        f"The {forecast.index_name} forecast is directional and points to "
        f"{final.get('yhat')} over {forecast.horizon_days} days. "
        f"Historical MAPE is {mape}; treat the output as directional."
    )


def _recent_related_signals(db: Session) -> list[dict[str, Any]]:
    result = db.execute(text("""
            SELECT AVG(score)::float AS average_portwatch_risk
            FROM port_risk_scores
            WHERE time >= NOW() - INTERVAL '30 days'
            """)).mappings().first()
    signals: list[dict[str, Any]] = []
    if result and result["average_portwatch_risk"] is not None:
        signals.append(
            {
                "signal_name": "average_portwatch_risk_30d",
                "value": float(result["average_portwatch_risk"]),
            }
        )
    bunker = db.execute(text("""
            SELECT AVG(price_usd_per_ton)::float AS average_bunker_price
            FROM bunker_prices
            WHERE time >= NOW() - INTERVAL '30 days'
            """)).mappings().first()
    if bunker and bunker["average_bunker_price"] is not None:
        signals.append(
            {
                "signal_name": "average_bunker_price_30d",
                "value": float(bunker["average_bunker_price"]),
            }
        )
    return signals


def _direction(current: float | None, final: float | None) -> str:
    if current is None or final is None:
        return "flat"
    pct = (final - current) / current * 100 if current else 0
    if pct > 1:
        return "up"
    if pct < -1:
        return "down"
    return "flat"


def _float_or_none(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)
