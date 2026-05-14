from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.collectors.base import BaseCollector
from app.schemas.records import FreightIndexRecord

ROUTE_POINTS = {
    "SUEZ_APPROACH": (29.97, 32.55),
    "PANAMA_APPROACH": (9.08, -79.68),
    "MALACCA_STRAIT": (2.5, 101.0),
}


class OpenMeteoMarineCollector(BaseCollector[FreightIndexRecord]):
    """Collect marine weather indicators for major route points."""

    source = "openmeteo_marine"
    record_model = FreightIndexRecord

    def collect(self) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for name, (lat, lon) in ROUTE_POINTS.items():
            payload = self.request_json(
                "GET",
                "https://marine-api.open-meteo.com/v1/marine",
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "hourly": "wave_height,wind_wave_height",
                    "timezone": "UTC",
                    "forecast_days": 1,
                },
            )
            hourly = payload.get("hourly", {})
            for ts, wave_height in zip(
                hourly.get("time", []), hourly.get("wave_height", []), strict=False
            ):
                if wave_height is None:
                    continue
                rows.append(
                    {
                        "time": datetime.fromisoformat(ts).replace(tzinfo=UTC),
                        "index_name": f"WAVE_HEIGHT_{name}",
                        "value": float(wave_height),
                        "source": self.source,
                        "metadata": {"lat": lat, "lon": lon},
                    }
                )
        return rows
