from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from app.collectors.base import BaseCollector
from app.collectors.fbx_scraper import _freight_index_row, _parse_money, parse_index_value
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
            follow_redirects=True,
        )
        response.raise_for_status()
        self._last_request_at = 0
        return parse_wci_index_value(response.text, self.source)


def parse_wci_index_value(html: str, source: str) -> list[dict[str, Any]]:
    """Parse current Drewry WCI composite value from the public weekly update."""
    text = _html_text(html)
    match = re.search(
        r"World Container Index \(WCI\).*?to\s+\$([0-9][0-9,]*(?:\.\d+)?)\s+per 40ft",
        text,
        flags=re.IGNORECASE,
    )
    if match is None:
        return parse_index_value(html, "WCI_GLOBAL", source)

    return [
        _freight_index_row(
            index_name="WCI_GLOBAL",
            value=_parse_money(match.group(1)),
            source=source,
            observed_at=_parse_assessment_date(text),
            metadata={
                "parser": "drewry_weekly_update",
                "source_url": "https://www.drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index-assessed-by-drewry",
            },
        )
    ]


def _html_text(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).replace("&#x3a;", ":")


def _parse_assessment_date(text: str) -> datetime | None:
    match = re.search(r"assessment for ([A-Za-z]+, \d{1,2} [A-Za-z]+ \d{4})", text)
    if match is None:
        return None
    return datetime.strptime(match.group(1), "%A, %d %B %Y").replace(tzinfo=UTC)
