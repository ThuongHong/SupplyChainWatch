from __future__ import annotations

import argparse
import csv
from datetime import UTC, date, datetime, time
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import FreightIndex
from app.db.session import SessionLocal
from app.schemas.records import FreightIndexRecord

MANUAL_BACKFILL_INDICES = {"FBX_GLOBAL", "WCI_GLOBAL"}
DEFAULT_SOURCE = "manual_freight_backfill"


def parse_manual_freight_backfill(csv_text: str) -> list[FreightIndexRecord]:
    """Parse manual FBX/WCI backfill CSV rows with provenance metadata."""
    records: list[FreightIndexRecord] = []
    reader = csv.DictReader(csv_text.splitlines())
    for row_number, row in enumerate(reader, start=2):
        index_name = (row.get("index_name") or "").strip()
        if index_name not in MANUAL_BACKFILL_INDICES:
            allowed = ", ".join(sorted(MANUAL_BACKFILL_INDICES))
            raise ValueError(f"row {row_number}: index_name must be one of {allowed}")

        source = (row.get("source") or DEFAULT_SOURCE).strip()
        metadata: dict[str, Any] = {
            "ingest_method": "manual_csv",
            "provenance": (row.get("provenance") or "").strip(),
            "row_number": row_number,
        }
        for field in ("source_url", "note", "provider_release_date"):
            value = (row.get(field) or "").strip()
            if value:
                metadata[field] = value

        records.append(
            FreightIndexRecord(
                time=_parse_time((row.get("time") or "").strip(), row_number=row_number),
                index_name=index_name,
                value=float((row.get("value") or "").strip()),
                source=source,
                metadata=metadata,
            )
        )
    return records


def persist_manual_freight_backfill(records: list[FreightIndexRecord], db: Session) -> int:
    """Upsert parsed manual freight index rows."""
    for record in records:
        db.merge(
            FreightIndex(
                time=record.time,
                index_name=record.index_name,
                value=record.value,
                source=record.source,
                metadata_=record.metadata,
            )
        )
    db.commit()
    return len(records)


def backfill_csv(path: Path, db: Session) -> int:
    records = parse_manual_freight_backfill(path.read_text(encoding="utf-8"))
    return persist_manual_freight_backfill(records, db)


def _parse_time(raw: str, *, row_number: int) -> datetime:
    if not raw:
        raise ValueError(f"row {row_number}: time is required")
    normalized = raw.replace("Z", "+00:00")
    try:
        if len(raw) == 10:
            return datetime.combine(date.fromisoformat(raw), time.min, tzinfo=UTC)
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(f"row {row_number}: invalid time {raw!r}") from exc
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill manual FBX/WCI freight index rows.")
    parser.add_argument("csv_path", type=Path)
    args = parser.parse_args()
    with SessionLocal() as db:
        count = backfill_csv(args.csv_path, db)
    print(f"backfilled {count} freight index rows")


if __name__ == "__main__":
    main()
