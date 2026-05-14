from __future__ import annotations

from typing import Any

from app.collectors.base import BaseCollector
from app.collectors.fbx_scraper import parse_index_value
from app.config import get_settings
from app.schemas.records import FreightIndexRecord


class WCIScraper(BaseCollector[FreightIndexRecord]):
    """Scrape public Drewry World Container Index values."""

    source = "drewry_wci"
    record_model = FreightIndexRecord
    min_request_interval_seconds = 5

    def collect(self) -> list[dict[str, Any]]:
        response = self.client.get(
            "https://www.drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index-assessed-by-drewry",
            headers={"User-Agent": get_settings().scraper_user_agent},
        )
        response.raise_for_status()
        self._last_request_at = 0
        return parse_index_value(response.text, "WCI_GLOBAL", self.source)
