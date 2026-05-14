from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.collectors.base import BaseCollector, CollectorError
from app.config import get_settings
from app.schemas.records import FreightIndexRecord

FRED_SERIES = {
    "BDI": "BDIY",
    "DCOILBRENTEU": "DCOILBRENTEU",
}


class FREDCollector(BaseCollector[FreightIndexRecord]):
    """Collect freight-related macro series from FRED."""

    source = "fred"
    record_model = FreightIndexRecord

    def __init__(self, *, series: dict[str, str] | None = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.series = series or FRED_SERIES

    def collect(self) -> list[dict[str, Any]]:
        settings = get_settings()
        if not settings.fred_api_key:
            raise CollectorError("FRED_API_KEY is required")

        rows: list[dict[str, Any]] = []
        for index_name, series_id in self.series.items():
            payload = self.request_json(
                "GET",
                "https://api.stlouisfed.org/fred/series/observations",
                params={
                    "series_id": series_id,
                    "api_key": settings.fred_api_key,
                    "file_type": "json",
                    "sort_order": "desc",
                    "limit": 1000,
                },
            )
            for observation in payload.get("observations", []):
                value = observation.get("value")
                if value in (None, "."):
                    continue
                rows.append(
                    {
                        "time": datetime.fromisoformat(observation["date"]).replace(tzinfo=UTC),
                        "index_name": index_name,
                        "value": float(value),
                        "source": self.source,
                        "metadata": {"series_id": series_id},
                    }
                )
        return rows
