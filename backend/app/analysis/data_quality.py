from __future__ import annotations

from collections.abc import Iterable

from app.schemas.records import FreightIndexRecord, VesselPositionRecord


def validate_vessel_snapshot(records: Iterable[VesselPositionRecord]) -> dict[str, int]:
    """Return simple data-quality counts for a vessel snapshot."""
    checked = 0
    missing_speed = 0
    for record in records:
        checked += 1
        if record.sog is None:
            missing_speed += 1
    return {"checked": checked, "missing_speed": missing_speed}


def validate_freight_indices(records: Iterable[FreightIndexRecord]) -> dict[str, int]:
    """Return simple data-quality counts for freight-index records."""
    checked = 0
    non_positive = 0
    for record in records:
        checked += 1
        if record.value <= 0:
            non_positive += 1
    return {"checked": checked, "non_positive": non_positive}
