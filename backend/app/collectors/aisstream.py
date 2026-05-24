from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any

import websockets
from pydantic import BaseModel
from websockets.exceptions import WebSocketException

from app.collectors.base import BaseCollector, CollectorError
from app.config import get_settings
from app.schemas.records import VesselPositionRecord, VesselRecord

AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream"
GLOBAL_BOUNDING_BOX = [[[-90, -180], [90, 180]]]
MONITORED_BOUNDING_BOXES = [
    [[0.8, 99.0], [6.5, 104.5]],  # Singapore & Strait of Malacca
    [[29.5, 120.5], [32.0, 123.0]],  # Shanghai & Ningbo-Zhoushan
    [[51.5, 3.8], [52.3, 5.1]],  # Rotterdam
    [[33.3, -118.8], [34.1, -117.7]],  # Los Angeles / Long Beach
    [[29.7, 32.0], [31.5, 33.0]],  # Suez
    [[8.7, -80.1], [9.5, -79.3]],  # Panama
    [[12.0, 32.0], [30.0, 44.0]],  # Red Sea & Bab-el-Mandeb
    [[40.0, 27.0], [47.5, 42.0]],  # Black Sea
    [[22.2, 113.7], [22.8, 114.6]],  # Shenzhen
    [[34.9, 128.8], [35.4, 129.3]],  # Busan
    [[53.3, 9.6], [54.0, 10.3]],  # Hamburg
    [[24.8, 54.8], [27.2, 57.5]],  # Strait of Hormuz & Jebel Ali
    [[31.1, 32.1], [31.5, 32.6]],  # Port Said (Mediterranean)
    [[36.0, -5.5], [36.2, -5.3]],  # Algeciras (Mediterranean)
    [[40.4, -74.3], [40.9, -73.7]],  # New York-New Jersey (US East Coast)
    [[31.9, -81.2], [32.2, -80.8]],  # Savannah (US East Coast)
]


class AISStreamCollector(BaseCollector[BaseModel]):
    """Collect a bounded live AIS snapshot from AISStream's WebSocket API."""

    source = "aisstream"
    record_model = BaseModel

    def __init__(
        self,
        *,
        sample_seconds: float = 600,
        max_records: int = 1000,
        watchlist_mmsi: set[int] | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self.sample_seconds = sample_seconds
        self.max_records = max_records
        self.watchlist_mmsi = watchlist_mmsi or set()

    def collect(self) -> list[dict[str, Any]]:
        settings = get_settings()
        if not settings.aisstream_api_key:
            raise CollectorError("AISSTREAM_API_KEY is required")

        return asyncio.run(
            self._collect_websocket(
                api_key=settings.aisstream_api_key,
                sample_seconds=self.sample_seconds,
                max_records=self.max_records,
            )
        )

    def validate(self, rows: list[dict[str, Any]]) -> list[BaseModel]:
        records: list[BaseModel] = []
        for row in rows:
            record_type = row.pop("_record_type", "position")
            if record_type == "vessel":
                if is_relevant_ais_row(row, self.watchlist_mmsi):
                    records.append(VesselRecord.model_validate(row))
            else:
                if is_relevant_ais_row(row, self.watchlist_mmsi):
                    records.append(VesselPositionRecord.model_validate(row))
        return records

    async def _collect_websocket(
        self,
        *,
        api_key: str,
        sample_seconds: float,
        max_records: int,
    ) -> list[dict[str, Any]]:
        subscribe_message = {
            "APIKey": api_key,
            "BoundingBoxes": MONITORED_BOUNDING_BOXES,
            "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
        }

        rows: list[dict[str, Any]] = []
        position_count = 0
        static_count = 0
        deadline = asyncio.get_running_loop().time() + sample_seconds
        try:
            async with websockets.connect(AISSTREAM_URL, open_timeout=10) as websocket:
                await websocket.send(json.dumps(subscribe_message))
                while True:
                    if position_count >= max_records:
                        break
                    remaining = deadline - asyncio.get_running_loop().time()
                    if remaining <= 0:
                        break
                    try:
                        message_json = await asyncio.wait_for(websocket.recv(), timeout=remaining)
                    except TimeoutError:
                        break

                    parsed = _parse_stream_message(json.loads(_message_to_text(message_json)))
                    for row in parsed:
                        if not is_relevant_ais_row(row, self.watchlist_mmsi):
                            continue
                        if row.get("_record_type") == "vessel":
                            if static_count < max_records:
                                rows.append(row)
                                static_count += 1
                            continue
                        if position_count < max_records:
                            rows.append(row)
                            position_count += 1
        except (OSError, WebSocketException, json.JSONDecodeError) as exc:
            raise CollectorError(f"{self.source} websocket failed: {exc}") from exc
        return rows


def _message_to_text(message: str | bytes) -> str:
    if isinstance(message, bytes):
        return message.decode("utf-8")
    return message


def _parse_stream_message(message: dict[str, Any]) -> list[dict[str, Any]]:
    if message.get("MessageType") == "PositionReport":
        parsed = _parse_position_message(message)
        return [parsed] if parsed is not None else []
    if message.get("MessageType") == "ShipStaticData":
        rows = []
        static = _parse_static_message(message)
        position = _parse_static_position_message(message)
        if static is not None:
            rows.append(static)
        if position is not None:
            rows.append(position)
        return rows
    return []


def _parse_position_message(message: dict[str, Any]) -> dict[str, Any] | None:
    if message.get("MessageType") != "PositionReport":
        return None

    position = message.get("Message", {}).get("PositionReport", {})
    if not isinstance(position, dict):
        return None

    mmsi = position.get("UserID") or message.get("MetaData", {}).get("MMSI")
    lat = position.get("Latitude")
    lon = position.get("Longitude")
    if mmsi is None or lat is None or lon is None:
        return None

    return {
        "_record_type": "position",
        "time": _parse_timestamp(message.get("MetaData", {}).get("time_utc")),
        "mmsi": int(mmsi),
        "lat": float(lat),
        "lon": float(lon),
        "sog": _optional_float(position.get("Sog")),
        "cog": _optional_float(position.get("Cog")),
        "nav_status": _optional_int(position.get("NavigationalStatus")),
        "_risk_area": _in_monitored_area(float(lat), float(lon)),
    }


def _parse_static_message(message: dict[str, Any]) -> dict[str, Any] | None:
    static = message.get("Message", {}).get("ShipStaticData", {})
    if not isinstance(static, dict):
        return None

    mmsi = static.get("UserID") or message.get("MetaData", {}).get("MMSI")
    if mmsi is None:
        return None

    dimension = static.get("Dimension", {})
    if not isinstance(dimension, dict):
        dimension = {}

    vessel_type = _optional_int(static.get("Type"))
    return {
        "_record_type": "vessel",
        "mmsi": int(mmsi),
        "imo": _optional_int(static.get("ImoNumber")),
        "name": _clean_string(static.get("Name") or message.get("MetaData", {}).get("ShipName")),
        "type": vessel_type,
        "type_label": _ais_type_label(vessel_type),
        "length": _sum_dimension(dimension.get("A"), dimension.get("B")),
        "width": _sum_dimension(dimension.get("C"), dimension.get("D")),
        "last_seen": _parse_timestamp(message.get("MetaData", {}).get("time_utc")),
        "_risk_area": _in_monitored_area(
            float(message.get("MetaData", {}).get("latitude", 999)),
            float(message.get("MetaData", {}).get("longitude", 999)),
        ),
    }


def _parse_static_position_message(message: dict[str, Any]) -> dict[str, Any] | None:
    metadata = message.get("MetaData", {})
    static = message.get("Message", {}).get("ShipStaticData", {})
    if not isinstance(metadata, dict) or not isinstance(static, dict):
        return None

    mmsi = static.get("UserID") or metadata.get("MMSI")
    lat = metadata.get("latitude")
    lon = metadata.get("longitude")
    if mmsi is None or lat is None or lon is None:
        return None

    return {
        "_record_type": "position",
        "time": _parse_timestamp(metadata.get("time_utc")),
        "mmsi": int(mmsi),
        "lat": float(lat),
        "lon": float(lon),
        "sog": None,
        "cog": None,
        "nav_status": None,
        "_risk_area": _in_monitored_area(float(lat), float(lon)),
    }


def is_relevant_ais_row(row: dict[str, Any], watchlist_mmsi: set[int] | None = None) -> bool:
    watchlist = watchlist_mmsi or set()
    mmsi = row.get("mmsi")
    return bool(row.get("_risk_area")) or (mmsi is not None and int(mmsi) in watchlist)


def _in_monitored_area(lat: float, lon: float) -> bool:
    for (south, west), (north, east) in MONITORED_BOUNDING_BOXES:
        if south <= lat <= north and west <= lon <= east:
            return True
    return False


def _ais_type_label(vessel_type: int | None) -> str | None:
    if vessel_type is None:
        return None
    if 20 <= vessel_type <= 29:
        return "Wing in ground"
    if vessel_type == 30:
        return "Fishing"
    if vessel_type == 31:
        return "Towing"
    if vessel_type == 32:
        return "Towing large"
    if vessel_type == 33:
        return "Dredging"
    if vessel_type == 34:
        return "Diving"
    if vessel_type == 35:
        return "Military"
    if vessel_type == 36:
        return "Sailing"
    if vessel_type == 37:
        return "Pleasure craft"
    if 40 <= vessel_type <= 49:
        return "High-speed craft"
    if vessel_type == 50:
        return "Pilot vessel"
    if vessel_type == 51:
        return "Search and rescue"
    if vessel_type == 52:
        return "Tug"
    if vessel_type == 53:
        return "Port tender"
    if vessel_type == 54:
        return "Anti-pollution"
    if vessel_type == 55:
        return "Law enforcement"
    if vessel_type == 58:
        return "Medical transport"
    if 60 <= vessel_type <= 69:
        return "Passenger"
    if 70 <= vessel_type <= 79:
        return "Cargo"
    if 80 <= vessel_type <= 89:
        return "Tanker"
    if 90 <= vessel_type <= 99:
        return "Other"
    return "Unknown"


def _clean_string(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _sum_dimension(first: Any, second: Any) -> float | None:
    values = [_optional_float(first), _optional_float(second)]
    if any(value is None for value in values):
        return None
    return float(values[0] or 0) + float(values[1] or 0)


def _parse_timestamp(value: Any) -> datetime:
    if not value:
        return datetime.now(UTC)
    text = str(value).strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed.astimezone(UTC)
    except ValueError:
        pass

    # AISStream commonly sends values like "2026-05-15 02:20:38.650236754 +0000 UTC".
    normalized = text.removesuffix(" UTC")
    date_part, time_part, offset = normalized.split(" ", 2)
    if "." in time_part:
        seconds, fraction = time_part.split(".", 1)
        time_part = f"{seconds}.{fraction[:6].ljust(6, '0')}"
        parsed = datetime.strptime(f"{date_part} {time_part} {offset}", "%Y-%m-%d %H:%M:%S.%f %z")
    else:
        parsed = datetime.strptime(f"{date_part} {time_part} {offset}", "%Y-%m-%d %H:%M:%S %z")
    return parsed.astimezone(UTC)


def _optional_float(value: Any) -> float | None:
    return None if value in (None, "") else float(value)


def _optional_int(value: Any) -> int | None:
    return None if value in (None, "") else int(value)
