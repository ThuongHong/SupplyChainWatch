from __future__ import annotations

import json
from datetime import UTC, datetime
from math import sqrt
from typing import Any, Literal

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.client import LLMClient
from app.llm.prompts import build_story_prompt
from app.llm.safety import collect_allowed_numbers, validate_narrative
from app.utils.cache import get_cached_json, set_cached_json

logger = structlog.get_logger(__name__)

EntityType = Literal["index", "port", "chokepoint"]


async def analyze_story(
    db: AsyncSession,
    *,
    entity_a: dict[str, str],
    entity_b: dict[str, str],
    period_days: int,
    client: LLMClient | None = None,
) -> dict[str, Any]:
    """Compute two-entity relationship metrics and return LLM narrative JSON."""
    today = datetime.now(UTC).strftime("%Y%m%d")
    cache_key = f"story:{entity_a['id']}:{entity_b['id']}:{period_days}:{today}"
    cached = await get_cached_json(cache_key)
    if cached is not None:
        return dict(cached)

    series_a = await _load_series(db, entity_a["type"], entity_a["id"], period_days)
    series_b = await _load_series(db, entity_b["type"], entity_b["id"], period_days)
    computed = _compute_relationship(entity_a, entity_b, series_a, series_b, period_days)
    fallback = _fallback_story(computed)
    if computed["overlap_points"] < 3:
        await set_cached_json(cache_key, fallback, ttl_seconds=24 * 60 * 60)
        return fallback

    system_prompt, user_prompt = build_story_prompt(computed)
    result = await (client or LLMClient()).complete(
        feature="story_mode",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        tier="reasoning",
        temperature=0.2,
        max_tokens=800,
        response_format={"type": "json_object"},
    )
    if result is None:
        await set_cached_json(cache_key, fallback, ttl_seconds=24 * 60 * 60)
        return fallback

    parsed = _parse_story_json(result.content, fallback)
    validation_text = " ".join(
        [
            str(parsed.get("headline", "")),
            str(parsed.get("narrative", "")),
            " ".join(str(item) for item in parsed.get("key_findings", [])),
            " ".join(str(item) for item in parsed.get("caveats", [])),
        ]
    )
    validation_passed = validate_narrative(validation_text, collect_allowed_numbers(computed))
    logger.info(
        "llm_story_validated",
        feature="story_mode",
        model=result.model,
        validation_passed=validation_passed,
    )
    response = parsed if validation_passed else fallback
    await set_cached_json(cache_key, response, ttl_seconds=24 * 60 * 60)
    return response


async def _load_series(
    db: AsyncSession,
    entity_type: str,
    entity_id: str,
    period_days: int,
) -> dict[str, float]:
    if entity_type == "index":
        result = await db.execute(
            text("""
                SELECT DATE_TRUNC('day', time)::date AS day, AVG(value)::float AS value
                FROM freight_indices
                WHERE index_name = :entity_id
                  AND time >= NOW() - (:period_days * INTERVAL '1 day')
                GROUP BY day
                ORDER BY day
                """),
            {"entity_id": entity_id, "period_days": period_days},
        )
    elif entity_type == "port":
        result = await db.execute(
            text("""
                SELECT snapshot_date AS day, AVG(risk_score)::float AS value
                FROM risk_feature_snapshots
                WHERE entity_type = 'port'
                  AND (entity_id = :entity_id OR LOWER(entity_name) = LOWER(:entity_id))
                  AND snapshot_date >= CURRENT_DATE - (:period_days * INTERVAL '1 day')
                GROUP BY day
                ORDER BY day
                """),
            {"entity_id": entity_id, "period_days": period_days},
        )
    elif entity_type == "chokepoint":
        result = await db.execute(
            text("""
                SELECT DATE_TRUNC('day', time)::date AS day, AVG(score)::float AS value
                FROM chokepoint_risk_scores
                WHERE (entity_id = :entity_id OR LOWER(entity_name) = LOWER(:entity_id))
                  AND time >= NOW() - (:period_days * INTERVAL '1 day')
                GROUP BY day
                ORDER BY day
                """),
            {"entity_id": entity_id, "period_days": period_days},
        )
    else:
        return {}
    return {str(row["day"]): float(row["value"]) for row in result.mappings().all()}


def _compute_relationship(
    entity_a: dict[str, str],
    entity_b: dict[str, str],
    series_a: dict[str, float],
    series_b: dict[str, float],
    period_days: int,
) -> dict[str, Any]:
    common_days = sorted(set(series_a).intersection(series_b))
    values_a = [series_a[day] for day in common_days]
    values_b = [series_b[day] for day in common_days]
    raw_corr = _pearson(values_a, values_b)
    detrended_corr = _pearson(_detrend(values_a), _detrend(values_b))
    optimal_lag, lag_corr = _optimal_lag(series_a, series_b)
    return {
        "entity_a": entity_a,
        "entity_b": entity_b,
        "period_days": period_days,
        "overlap_points": len(common_days),
        "pearson_correlation_raw": raw_corr,
        "pearson_correlation_detrended": detrended_corr,
        "optimal_lag_days": optimal_lag,
        "optimal_lag_correlation": lag_corr,
        "top_coincident_events": _coincident_events(common_days, values_a, values_b),
        "notable_divergences": _divergences(common_days, values_a, values_b),
    }


def _optimal_lag(
    series_a: dict[str, float],
    series_b: dict[str, float],
    max_lag: int = 30,
) -> tuple[int | None, float | None]:
    days = sorted(set(series_a).union(series_b))
    best_lag: int | None = None
    best_corr: float | None = None
    for lag in range(-max_lag, max_lag + 1):
        values_a: list[float] = []
        values_b: list[float] = []
        for idx, day in enumerate(days):
            shifted_idx = idx + lag
            if shifted_idx < 0 or shifted_idx >= len(days):
                continue
            shifted_day = days[shifted_idx]
            if day in series_a and shifted_day in series_b:
                values_a.append(series_a[day])
                values_b.append(series_b[shifted_day])
        corr = _pearson(values_a, values_b)
        if corr is None:
            continue
        if best_corr is None or abs(corr) > abs(best_corr):
            best_lag = lag
            best_corr = corr
    return best_lag, best_corr


def _coincident_events(
    days: list[str], values_a: list[float], values_b: list[float]
) -> list[dict[str, Any]]:
    z_a = _z_scores(values_a)
    z_b = _z_scores(values_b)
    events: list[dict[str, Any]] = []
    for day, value_a, value_b, score_a, score_b in zip(
        days, values_a, values_b, z_a, z_b, strict=True
    ):
        intensity = max(abs(score_a), abs(score_b))
        if intensity < 1.5:
            continue
        events.append(
            {
                "day": day,
                "entity_a_value": value_a,
                "entity_b_value": value_b,
                "entity_a_z_score": score_a,
                "entity_b_z_score": score_b,
            }
        )
    events.sort(
        key=lambda event: max(abs(event["entity_a_z_score"]), abs(event["entity_b_z_score"])),
        reverse=True,
    )
    return events[:3]


def _divergences(
    days: list[str], values_a: list[float], values_b: list[float]
) -> list[dict[str, Any]]:
    divergences: list[dict[str, Any]] = []
    for idx in range(1, len(days)):
        delta_a = values_a[idx] - values_a[idx - 1]
        delta_b = values_b[idx] - values_b[idx - 1]
        if delta_a == 0 or delta_b == 0 or delta_a * delta_b > 0:
            continue
        divergences.append(
            {
                "day": days[idx],
                "entity_a_change": delta_a,
                "entity_b_change": delta_b,
                "combined_abs_change": abs(delta_a) + abs(delta_b),
            }
        )
    divergences.sort(key=lambda item: item["combined_abs_change"], reverse=True)
    return divergences[:5]


def _pearson(left: list[float], right: list[float]) -> float | None:
    if len(left) != len(right) or len(left) < 3:
        return None
    left_mean = sum(left) / len(left)
    right_mean = sum(right) / len(right)
    numerator = sum((a - left_mean) * (b - right_mean) for a, b in zip(left, right, strict=True))
    left_var = sum((a - left_mean) ** 2 for a in left)
    right_var = sum((b - right_mean) ** 2 for b in right)
    denominator = sqrt(left_var * right_var)
    if denominator == 0:
        return None
    return numerator / denominator


def _detrend(values: list[float]) -> list[float]:
    if len(values) < 2:
        return values
    x_mean = (len(values) - 1) / 2
    y_mean = sum(values) / len(values)
    denominator = sum((idx - x_mean) ** 2 for idx in range(len(values)))
    if denominator == 0:
        return values
    slope = sum((idx - x_mean) * (value - y_mean) for idx, value in enumerate(values)) / denominator
    intercept = y_mean - slope * x_mean
    return [value - (intercept + slope * idx) for idx, value in enumerate(values)]


def _z_scores(values: list[float]) -> list[float]:
    if len(values) < 2:
        return [0 for _ in values]
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    stddev = sqrt(variance)
    if stddev == 0:
        return [0 for _ in values]
    return [(value - mean) / stddev for value in values]


def _parse_story_json(content: str, fallback: dict[str, Any]) -> dict[str, Any]:
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        logger.warning("llm_story_json_parse_failed", fallback_used=True)
        return fallback
    if not isinstance(parsed, dict):
        return fallback
    headline = str(parsed.get("headline") or fallback["headline"])
    narrative = str(parsed.get("narrative") or fallback["narrative"])
    findings = parsed.get("key_findings")
    caveats = parsed.get("caveats")
    return {
        "headline": headline,
        "narrative": narrative,
        "key_findings": findings if isinstance(findings, list) else fallback["key_findings"],
        "caveats": caveats if isinstance(caveats, list) else fallback["caveats"],
    }


def _fallback_story(computed: dict[str, Any]) -> dict[str, Any]:
    entity_a = computed["entity_a"]["id"]
    entity_b = computed["entity_b"]["id"]
    overlap = computed["overlap_points"]
    raw = computed["pearson_correlation_raw"]
    lag = computed["optimal_lag_days"]
    headline = f"{entity_a} and {entity_b} have {overlap} overlapping observations."
    narrative = (
        f"The computed relationship uses {overlap} aligned daily observations over "
        f"{computed['period_days']} days. Raw correlation is {raw} and the strongest "
        f"tested lag is {lag} days. This template summary is shown because LLM output "
        "was unavailable or did not pass validation."
    )
    return {
        "headline": headline,
        "narrative": narrative,
        "key_findings": [
            f"Overlap points: {overlap}",
            f"Raw correlation: {raw}",
            f"Optimal lag days: {lag}",
        ],
        "caveats": [
            "Correlation does not establish causation.",
            "Sparse or uneven source data can weaken the result.",
        ],
    }
