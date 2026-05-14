from __future__ import annotations

import re
from itertools import combinations
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

NUMBER_RE = re.compile(r"(?<![A-Za-z])[-+]?\d+(?:,\d{3})*(?:\.\d+)?%?")


def validate_narrative(narrative: str, allowed_numbers: list[float]) -> bool:
    """Return False when generated text contains numbers not present in input data."""
    if not narrative:
        return False
    observed_numbers = _extract_numbers(narrative)
    if not observed_numbers:
        return True

    derived = _derived_numbers(allowed_numbers)
    candidates = allowed_numbers + derived
    for number in observed_numbers:
        if not any(_close_enough(number, allowed) for allowed in candidates):
            logger.warning(
                "llm_unauthorized_number",
                narrative_number=number,
                allowed_numbers=allowed_numbers,
            )
            return False
    return True


def collect_allowed_numbers(value: Any) -> list[float]:
    """Collect numeric values from structured LLM input payloads."""
    numbers: list[float] = []
    _collect_numbers(value, numbers)
    return numbers


def _extract_numbers(text: str) -> list[float]:
    numbers: list[float] = []
    for match in NUMBER_RE.finditer(text):
        token = match.group(0).replace(",", "").rstrip("%")
        try:
            numbers.append(float(token))
        except ValueError:
            continue
    return numbers


def _collect_numbers(value: Any, numbers: list[float]) -> None:
    if isinstance(value, bool):
        return
    if isinstance(value, int | float):
        numbers.append(float(value))
        return
    if isinstance(value, dict):
        for child in value.values():
            _collect_numbers(child, numbers)
        return
    if isinstance(value, list | tuple):
        for child in value:
            _collect_numbers(child, numbers)


def _derived_numbers(numbers: list[float]) -> list[float]:
    derived: list[float] = []
    sample = numbers[:50]
    for number in sample:
        derived.extend([round(number), round(number, 1), round(number, 2)])
    for left, right in combinations(sample[:20], 2):
        derived.append(left + right)
        derived.append(left - right)
        derived.append(right - left)
        if right != 0:
            derived.append((left - right) / right * 100)
        if left != 0:
            derived.append((right - left) / left * 100)
    return derived


def _close_enough(observed: float, allowed: float) -> bool:
    if abs(allowed) < 1e-9:
        return abs(observed) < 0.01
    return abs(observed - allowed) <= max(abs(allowed) * 0.01, 0.01)
