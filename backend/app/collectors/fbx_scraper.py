from __future__ import annotations

import re
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
            follow_redirects=True,
        )
        response.raise_for_status()
        self._last_request_at = 0
        return parse_fbx_index_value(response.text, self.source)


def parse_fbx_index_value(html: str, source: str) -> list[dict[str, Any]]:
    """Parse current FBX global value from Freightos public page ticker data."""
    match = re.search(
        r'"label"\s*:\s*"FBX"\s*,\s*"value"\s*:\s*"\$?([0-9][0-9,]*(?:\.\d+)?)"',
        html,
    )
    if match is None:
        return parse_index_value(html, "FBX_GLOBAL", source)
    return [
        _freight_index_row(
            index_name="FBX_GLOBAL",
            value=_parse_money(match.group(1)),
            source=source,
            metadata={
                "parser": "freightos_ticker",
                "source_url": "https://www.freightos.com/enterprise/terminal/freightos-baltic-index-global-container-pricing-index/",
            },
        )
    ]


def parse_index_value(html: str, index_name: str, source: str) -> list[dict[str, Any]]:
    """Parse a single index value from a simple HTML fragment."""
    soup = BeautifulSoup(html, "html.parser")
    candidate = soup.select_one("[data-index-value]")
    raw = candidate.get("data-index-value") if candidate else soup.get_text(" ", strip=True)
    if candidate is None and re.fullmatch(r"\$?\s*\d[\d,]*(?:\.\d+)?\s*", str(raw)) is None:
        return []
    number = "".join(ch for ch in str(raw) if ch.isdigit() or ch == ".")
    if not number or number.count(".") > 1:
        return []
    return [
        _freight_index_row(
            index_name=index_name,
            value=float(number),
            source=source,
            metadata={"parser": "public_html"},
        )
    ]


def _freight_index_row(
    *,
    index_name: str,
    value: float,
    source: str,
    metadata: dict[str, Any],
    observed_at: datetime | None = None,
) -> dict[str, Any]:
    return {
        "time": observed_at or datetime.now(UTC),
        "index_name": index_name,
        "value": value,
        "source": source,
        "metadata": metadata,
    }


def _parse_money(raw: str) -> float:
    return float(raw.replace("$", "").replace(",", "").strip())
