from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from bs4 import BeautifulSoup

from app.collectors.base import BaseCollector
from app.config import get_settings
from app.schemas.records import FreightIndexRecord


class FBXScraper(BaseCollector[FreightIndexRecord]):
    """Scrape public Freightos Baltic Index values."""

    source = "freightos_fbx"
    record_model = FreightIndexRecord
    min_request_interval_seconds = 5

    def collect(self) -> list[dict[str, Any]]:
        response = self.client.get(
            "https://fbx.freightos.com/",
            headers={"User-Agent": get_settings().scraper_user_agent},
        )
        response.raise_for_status()
        self._last_request_at = 0
        return parse_index_value(response.text, "FBX_GLOBAL", self.source)


def parse_index_value(html: str, index_name: str, source: str) -> list[dict[str, Any]]:
    """Parse a single index value from a simple HTML fragment."""
    soup = BeautifulSoup(html, "html.parser")
    candidate = soup.select_one("[data-index-value]")
    raw = candidate.get("data-index-value") if candidate else soup.get_text(" ", strip=True)
    number = "".join(ch for ch in str(raw) if ch.isdigit() or ch == ".")
    if not number:
        return []
    return [
        {
            "time": datetime.now(UTC),
            "index_name": index_name,
            "value": float(number),
            "source": source,
            "metadata": {"parser": "public_html"},
        }
    ]
