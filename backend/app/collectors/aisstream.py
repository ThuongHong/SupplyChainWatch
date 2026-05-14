from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.collectors.base import BaseCollector, CollectorError
from app.config import get_settings
from app.schemas.records import VesselPositionRecord


class AISStreamCollector(BaseCollector[VesselPositionRecord]):
    """Collect an hourly AIS snapshot from AISStream's REST-compatible endpoint."""

    source = "aisstream"
    record_model = VesselPositionRecord

    def collect(self) -> list[dict[str, Any]]:
        settings = get_settings()
        if not settings.aisstream_api_key:
            raise CollectorError("AISSTREAM_API_KEY is required")

        payload = self.request_json(
            "GET",
            "https://aisstream.io/api/v1/vessels",
            headers={"Authorization": f"Bearer {settings.aisstream_api_key}"},
        )
        rows: list[dict[str, Any]] = []
        for item in payload.get("vessels", []):
            position = item.get("position", item)
            rows.append(
                {
                    "time": _parse_timestamp(position.get("timestamp")),
                    "mmsi": int(item.get("mmsi") or position["mmsi"]),
                    "lat": float(position["lat"]),
                    "lon": float(position["lon"]),
                    "sog": _optional_float(position.get("sog")),
                    "cog": _optional_float(position.get("cog")),
                    "nav_status": _optional_int(position.get("nav_status")),
                }
            )
        return rows


def _parse_timestamp(value: Any) -> datetime:
    if not value:
        return datetime.now(UTC)
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.astimezone(UTC)


def _optional_float(value: Any) -> float | None:
    return None if value in (None, "") else float(value)


def _optional_int(value: Any) -> int | None:
    return None if value in (None, "") else int(value)
