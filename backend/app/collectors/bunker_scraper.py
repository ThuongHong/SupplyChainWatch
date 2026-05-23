from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from bs4 import BeautifulSoup

from app.collectors.base import BaseCollector
from app.config import get_settings
from app.schemas.records import BunkerPriceRecord


class BunkerScraper(BaseCollector[BunkerPriceRecord]):
    """Scrape daily bunker prices with a conservative politeness delay."""

    source = "ship_bunker"
    record_model = BunkerPriceRecord
    min_request_interval_seconds = 5

    def collect(self) -> list[dict[str, Any]]:
        response = self.client.get(
            "https://shipandbunker.com/prices",
            headers={"User-Agent": get_settings().scraper_user_agent},
        )
        response.raise_for_status()
        self._last_request_at = 0
        return parse_bunker_prices(response.text)


def parse_bunker_prices(html: str) -> list[dict[str, Any]]:
    """Parse bunker rows from a table-like HTML fragment."""
    soup = BeautifulSoup(html, "html.parser")
    rows: list[dict[str, Any]] = []
    for table in soup.select("table"):
        caption = (table.get("caption") or table.get("summary") or "").upper()
        fuel_type = _fuel_type_from_caption(caption)
        if fuel_type is None:
            continue
        for table_row in table.select("tr"):
            port_cell = table_row.select_one("th")
            cells = [cell.get_text(" ", strip=True) for cell in table_row.select("td")]
            if port_cell is None or not cells:
                continue
            port_code = port_cell.get_text(" ", strip=True)
            price = cells[0].replace("$", "").replace(",", "")
            try:
                rows.append(
                    {
                        "time": datetime.now(UTC),
                        "port_code": port_code.upper(),
                        "fuel_type": fuel_type,
                        "price_usd_per_ton": float(price),
                    }
                )
            except ValueError:
                continue
    return rows


def _fuel_type_from_caption(caption: str) -> str | None:
    for fuel_type in ("VLSFO", "MGO", "IFO380"):
        if fuel_type in caption:
            return fuel_type
    return None
