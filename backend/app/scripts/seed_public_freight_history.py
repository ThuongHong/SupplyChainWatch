from __future__ import annotations

import argparse
import html
import json
import re
from collections.abc import Iterable
from datetime import UTC, date, datetime, time
from typing import Any

import httpx

from app.db.session import SessionLocal
from app.schemas.records import FreightIndexRecord
from app.scripts.backfill_freight_indices import persist_manual_freight_backfill

STOCKQ_BDI_URL = "https://en.stockq.org/index/BDI.php"
FREIGHTOS_TOOLS_URL = "https://developers.freightos.com/freight-tools"
INFOGRAM_EMBED_URL = "https://e.infogram.com/_/AcDi5xXouXrzQMLqbVpj"
INFOGRAM_LIVE_DATA_URL = "https://live-data.jifo.co"
MTS_WCI_URL = "https://www.mtsinsights.com/events/3967/"

DEFAULT_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; GlobalSupplyWatch/1.0)"}

WCI_SUPPLEMENTAL_ROWS = [
    {
        "time": date(2026, 2, 26),
        "value": 1899.0,
        "source_url": "https://www.drewry.co.uk/wci",
        "provenance": "Drewry WCI public update for 2026-02-26",
        "note": "Drewry public WCI page indexed 2026-02-26 update.",
    },
    {
        "time": date(2026, 2, 19),
        "value": 1919.0,
        "source_url": "https://www.trasportoeuropa.it/notizie/marittimo/rallenta-il-calo-dei-noli-container-nella-terza-settimana-di-febbraio-2026/",
        "provenance": "TrasportoEuropa summary of Drewry WCI previous week",
        "note": "Derived from 2026-02-26 report: $1,899, down $20 week over week.",
    },
]


def fetch_public_freight_history(limit_per_index: int | None = None) -> list[FreightIndexRecord]:
    """Fetch public BDI, FBX, and WCI history with source provenance."""
    with httpx.Client(headers=DEFAULT_HEADERS, follow_redirects=True, timeout=30) as client:
        records = [
            *fetch_stockq_bdi(client),
            *fetch_freightos_fbx(client),
            *fetch_mts_wci(client),
            *_records_from_wci_supplemental(),
        ]
    return _limit_per_index(records, limit_per_index)


def fetch_stockq_bdi(client: httpx.Client) -> list[FreightIndexRecord]:
    """Fetch recent Baltic Dry Index rows from StockQ public table."""
    response = client.get(STOCKQ_BDI_URL)
    response.raise_for_status()
    rows = _parse_stockq_bdi(response.text)
    return [
        _record(
            time_=row_date,
            index_name="BDI",
            value=value,
            source="public_stockq_bdi",
            source_url=STOCKQ_BDI_URL,
            provenance="StockQ Baltic Dry index public table",
            note="Public BDI recent-history table.",
        )
        for row_date, value in rows
    ]


def fetch_freightos_fbx(client: httpx.Client) -> list[FreightIndexRecord]:
    """Fetch FBX Global history from Freightos public Infogram widget."""
    embed_response = client.get(INFOGRAM_EMBED_URL)
    embed_response.raise_for_status()
    live_key = _extract_infogram_live_key(embed_response.text)

    live_response = client.get(f"{INFOGRAM_LIVE_DATA_URL}/{live_key}")
    live_response.raise_for_status()
    rows = _parse_fbx_live_data(live_response.json())
    return [
        _record(
            time_=row_date,
            index_name="FBX_GLOBAL",
            value=value,
            source="public_freightos_fbx_infogram",
            source_url=FREIGHTOS_TOOLS_URL,
            provenance="Freightos public FBX Global Infogram widget",
            note="FBX column from public Freightos developer-page chart.",
        )
        for row_date, value in rows
    ]


def fetch_mts_wci(client: httpx.Client) -> list[FreightIndexRecord]:
    """Fetch recent Drewry WCI summaries from MTS Insights public event page."""
    response = client.get(MTS_WCI_URL)
    response.raise_for_status()
    rows = _parse_mts_wci(response.text)
    return [
        _record(
            time_=row_date,
            index_name="WCI_GLOBAL",
            value=value,
            source="public_mts_drewry_wci",
            source_url=MTS_WCI_URL,
            provenance="MTS Insights summary of Drewry WCI weekly release",
            note="Composite Drewry WCI value quoted by public MTS summary.",
        )
        for row_date, value in rows
    ]


def _parse_stockq_bdi(page_html: str) -> list[tuple[date, float]]:
    rows: dict[date, float] = {}
    pattern = r"(20\d{2}/\d{2}/\d{2})[^0-9]{0,80}([0-9]{3,5}\.\d{2})"
    for raw_date, raw_value in re.findall(pattern, page_html):
        row_date = datetime.strptime(raw_date, "%Y/%m/%d").date()
        rows[row_date] = float(raw_value)
    return sorted(rows.items())


def _extract_infogram_live_key(page_html: str) -> str:
    match = re.search(r"window\.infographicData=(.*?);</script>", page_html, re.DOTALL)
    if not match:
        raise ValueError("Infogram payload not found")
    payload = json.loads(match.group(1))
    live = _find_infogram_live_config(payload)
    key = live.get("key") if isinstance(live, dict) else None
    if not key:
        raise ValueError("Infogram live data key not found")
    return str(key)


def _find_infogram_live_config(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        live = value.get("live")
        if isinstance(live, dict) and live.get("provider") == "atlas_google_drive":
            return live
        for child in value.values():
            found = _find_infogram_live_config(child)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = _find_infogram_live_config(child)
            if found:
                return found
    return {}


def _parse_fbx_live_data(payload: dict[str, Any]) -> list[tuple[date, float]]:
    tables = payload.get("data")
    if not isinstance(tables, list) or not tables:
        raise ValueError("FBX live data has no tables")
    table = tables[0]
    if not isinstance(table, list) or not table:
        raise ValueError("FBX live table is empty")
    header = table[0]
    if not isinstance(header, list) or "Date" not in header or "FBX" not in header:
        raise ValueError("FBX live table missing Date/FBX columns")
    date_idx = header.index("Date")
    fbx_idx = header.index("FBX")

    rows: dict[date, float] = {}
    for row in table[1:]:
        if not isinstance(row, list) or len(row) <= max(date_idx, fbx_idx):
            continue
        try:
            row_date = date.fromisoformat(str(row[date_idx]))
            value = _parse_money(row[fbx_idx])
        except (TypeError, ValueError):
            continue
        rows[row_date] = value
    return sorted(rows.items())


def _parse_mts_wci(page_html: str) -> list[tuple[date, float]]:
    text = _html_to_text(page_html)
    release_pattern = re.compile(
        r"(2026-\d{2}-\d{2}) · 09:45 Drewry World Container Index:.*?"
        r"(?=(?:2026-\d{2}-\d{2} · 09:45 Drewry World Container Index:)|© 2026)",
        re.DOTALL,
    )
    rows: dict[date, float] = {}
    for block_match in release_pattern.finditer(text):
        block = block_match.group(0)
        value_match = re.search(
            r"(?:Drewry World Container Index \(WCI\)|Drewry’s World Container Index|The WCI)"
            r"[^$]{0,500}\$([0-9,]+)\s+per",
            block,
            re.DOTALL,
        )
        if not value_match:
            continue
        rows[date.fromisoformat(block_match.group(1))] = _parse_money(value_match.group(1))
    return sorted(rows.items())


def _records_from_wci_supplemental() -> list[FreightIndexRecord]:
    return [
        _record(
            time_=row["time"],
            index_name="WCI_GLOBAL",
            value=row["value"],
            source="public_drewry_wci_supplement",
            source_url=row["source_url"],
            provenance=row["provenance"],
            note=row["note"],
        )
        for row in WCI_SUPPLEMENTAL_ROWS
    ]


def _limit_per_index(
    records: Iterable[FreightIndexRecord], limit_per_index: int | None
) -> list[FreightIndexRecord]:
    if limit_per_index is None:
        return sorted(records, key=lambda record: (record.index_name, record.time))
    limited: list[FreightIndexRecord] = []
    for index_name in ("BDI", "FBX_GLOBAL", "WCI_GLOBAL"):
        index_records = sorted(
            [record for record in records if record.index_name == index_name],
            key=lambda record: record.time,
        )
        limited.extend(index_records[-limit_per_index:])
    return sorted(limited, key=lambda record: (record.index_name, record.time))


def _record(
    *,
    time_: date,
    index_name: str,
    value: float,
    source: str,
    source_url: str,
    provenance: str,
    note: str,
) -> FreightIndexRecord:
    return FreightIndexRecord(
        time=datetime.combine(time_, time.min, tzinfo=UTC),
        index_name=index_name,
        value=value,
        source=source,
        metadata={
            "ingest_method": "public_history_seed",
            "source_url": source_url,
            "provenance": provenance,
            "note": note,
            "provider_release_date": time_.isoformat(),
        },
    )


def _html_to_text(page_html: str) -> str:
    stripped = re.sub(r"<[^>]+>", " ", page_html)
    return re.sub(r"\s+", " ", html.unescape(stripped)).strip()


def _parse_money(raw: object) -> float:
    return float(str(raw).replace("$", "").replace(",", "").strip())


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed public BDI, FBX, and WCI history.")
    parser.add_argument("--limit-per-index", type=int, default=90)
    args = parser.parse_args()
    records = fetch_public_freight_history(limit_per_index=args.limit_per_index)
    with SessionLocal() as db:
        count = persist_manual_freight_backfill(records, db)
    print(f"backfilled {count} public freight index rows")


if __name__ == "__main__":
    main()
