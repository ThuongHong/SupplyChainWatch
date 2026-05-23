from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from app.collectors.base import BaseCollector, CollectorError
from app.config import get_settings
from app.fixtures.portwatch_entities import PORTWATCH_ALIAS_TO_ENTITY, PORTWATCH_ENTITIES
from app.schemas.records import PortWatchMetricRecord

FEATURE_PAGE_SIZE = 1000
RECENT_FEATURE_SAMPLE_SIZE = 200
OBJECT_ID_BATCH_SIZE = 50

PORTWATCH_TARGET_PORTIDS = ("port1201", "port1188", "port2027", "port1114", "port664")
PORTSTRAITWATCH_TARGET_PORTIDS = (
    "chokepoint1",
    "chokepoint2",
    "chokepoint3",
    "chokepoint4",
    "chokepoint5",
    "chokepoint28",
)
PORTWATCH_ENTITY_BY_ID = {entity.entity_id: entity for entity in PORTWATCH_ENTITIES}
PORTWATCH_SOURCE_ID_TO_ENTITY = {
    "port1201": PORTWATCH_ENTITY_BY_ID["port-sgsin"],
    "port1188": PORTWATCH_ENTITY_BY_ID["port-cnsha"],
    "port2027": PORTWATCH_ENTITY_BY_ID["port-cnsha"],
    "port1114": PORTWATCH_ENTITY_BY_ID["port-nlrtm"],
    "port664": PORTWATCH_ENTITY_BY_ID["port-uslax"],
    "chokepoint1": PORTWATCH_ENTITY_BY_ID["cp-suez"],
    "chokepoint2": PORTWATCH_ENTITY_BY_ID["cp-panama"],
    "chokepoint3": PORTWATCH_ENTITY_BY_ID["region-red-sea"],
    "chokepoint4": PORTWATCH_ENTITY_BY_ID["region-black-sea"],
    "chokepoint5": PORTWATCH_ENTITY_BY_ID["cp-malacca"],
    "chokepoint28": PORTWATCH_ENTITY_BY_ID["region-black-sea"],
}


class PortWatchFeatureAdapter:
    """ArcGIS FeatureServer adapter for PortWatch-style layers."""

    def __init__(self, collector: BaseCollector[PortWatchMetricRecord]) -> None:
        self.collector = collector

    def fetch_features(self, url: str) -> list[dict[str, Any]]:
        """Fetch recent data for monitored portwatch entities."""
        if getattr(self.collector, "use_portid_filter", True):
            is_ports = "Daily_Ports_Data" in url or "ports" in url.lower()
            is_chokepoints = "Daily_Chokepoints_Data" in url or "chokepoint" in url.lower()
            if is_ports or is_chokepoints:
                ids = PORTWATCH_TARGET_PORTIDS if is_ports else PORTSTRAITWATCH_TARGET_PORTIDS
                history_days = max(1, int(getattr(self.collector, "history_days", 90)))
                since_date = (datetime.now(UTC) - timedelta(days=history_days)).strftime("%Y-%m-%d")
                ids_str = ", ".join(f"'{i}'" for i in ids)
                where_clause = f"portid IN ({ids_str}) AND date >= '{since_date}'"

                features = self._fetch_filtered_pages(url, where_clause)
                if features:
                    return features

        # Fallback to the original objectId-based query for backward compatibility and tests
        object_ids = self._recent_object_ids(url)
        if object_ids:
            return self._fetch_object_ids(url, object_ids)
        return self._fetch_first_page(url)

    def _fetch_filtered_pages(self, url: str, where_clause: str) -> list[dict[str, Any]]:
        features: list[dict[str, Any]] = []
        offset = 0
        while True:
            payload = self.collector.request_json(
                "GET",
                url,
                params={
                    "where": where_clause,
                    "outFields": "*",
                    "f": "json",
                    "returnGeometry": "false",
                    "resultOffset": offset,
                    "resultRecordCount": FEATURE_PAGE_SIZE,
                },
            )
            page = payload.get("features", []) if isinstance(payload, dict) else []
            if isinstance(page, list):
                features.extend(item for item in page if isinstance(item, dict))
            if not isinstance(payload, dict) or not payload.get("exceededTransferLimit"):
                break
            offset += FEATURE_PAGE_SIZE
        return features

    def _recent_object_ids(self, url: str) -> list[int]:
        payload = self.collector.request_json(
            "GET",
            url,
            params={"where": "1=1", "returnCountOnly": "true", "f": "json"},
        )
        if not isinstance(payload, dict):
            return []
        count = int(payload.get("count") or 0)
        if count <= 0:
            return []
        start = max(1, count - RECENT_FEATURE_SAMPLE_SIZE + 1)
        return list(range(start, count + 1))

    def _fetch_object_ids(self, url: str, object_ids: list[int]) -> list[dict[str, Any]]:
        features: list[dict[str, Any]] = []
        for index in range(0, len(object_ids), OBJECT_ID_BATCH_SIZE):
            batch = object_ids[index : index + OBJECT_ID_BATCH_SIZE]
            payload = self.collector.request_json(
                "GET",
                url,
                params={
                    "objectIds": ",".join(str(value) for value in batch),
                    "outFields": "*",
                    "f": "json",
                    "returnGeometry": "false",
                },
            )
            page = payload.get("features", []) if isinstance(payload, dict) else []
            if isinstance(page, list):
                features.extend(item for item in page if isinstance(item, dict))
        return features

    def _fetch_first_page(self, url: str) -> list[dict[str, Any]]:
        payload = self.collector.request_json(
            "GET",
            url,
            params={
                "where": "1=1",
                "outFields": "*",
                "f": "json",
                "returnGeometry": "false",
                "resultOffset": 0,
                "resultRecordCount": FEATURE_PAGE_SIZE,
            },
        )
        page = payload.get("features", []) if isinstance(payload, dict) else []
        return [item for item in page if isinstance(item, dict)] if isinstance(page, list) else []


class PortWatchCollector(BaseCollector[PortWatchMetricRecord]):
    """Collect normalized PortWatch/PortStraitWatch traffic and trade metrics."""

    source = "portwatch"
    record_model = PortWatchMetricRecord
    min_request_interval_seconds = 1

    def __init__(
        self,
        *,
        use_demo_fallback: bool = False,
        use_portid_filter: bool = True,
        history_days: int | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self.use_demo_fallback = use_demo_fallback
        self.use_portid_filter = use_portid_filter
        self.history_days = history_days or get_settings().portwatch_history_days
        self.adapter = PortWatchFeatureAdapter(self)

    def collect(self) -> list[dict[str, Any]]:
        settings = get_settings()
        rows: list[dict[str, Any]] = []
        for url, entity_hint, source in (
            (settings.portwatch_ports_url, "port", "portwatch_ports"),
            (settings.portwatch_chokepoints_url, "chokepoint", "portstraitwatch_chokepoints"),
        ):
            try:
                features = self.adapter.fetch_features(url)
            except CollectorError:
                if self.use_demo_fallback:
                    return demo_portwatch_rows()
                raise
            for feature in features:
                rows.extend(normalize_feature(feature, entity_hint=entity_hint, source=source))

        if not rows:
            if self.use_demo_fallback:
                return demo_portwatch_rows()
            return []

        # Aggregate duplicates (e.g., Shanghai Pudong and Yangshan both mapping to port-cnsha)
        aggregated: dict[tuple[datetime, str, str, str, str], dict[str, Any]] = {}
        for row in rows:
            key = (
                row["observed_at"],
                row["entity_type"],
                row["entity_id"],
                row["metric_name"],
                row["source"],
            )
            if key in aggregated:
                aggregated[key]["metric_value"] += row["metric_value"]
                if "source_entity_ids" not in aggregated[key]["metadata"]:
                    aggregated[key]["metadata"]["source_entity_ids"] = [
                        aggregated[key]["source_entity_id"]
                    ]
                if row["source_entity_id"] not in aggregated[key]["metadata"]["source_entity_ids"]:
                    aggregated[key]["metadata"]["source_entity_ids"].append(row["source_entity_id"])
            else:
                row_copy = dict(row)
                row_copy["metadata"] = dict(row_copy["metadata"])
                aggregated[key] = row_copy

        return list(aggregated.values())


def normalize_feature(
    feature: dict[str, Any],
    *,
    entity_hint: str,
    source: str,
) -> list[dict[str, Any]]:
    attrs = feature.get("attributes", feature)
    if not isinstance(attrs, dict):
        return []

    name = _first_text(attrs, ("portname", "port_name", "name", "chokepoint", "strait", "canal"))
    source_id = _first_text(attrs, ("portid", "port_id", "objectid", "OBJECTID", "id"))
    entity = _match_entity(name, source_id)
    entity_type = entity.entity_type if entity else entity_hint
    entity_id = (
        entity.entity_id if entity else f"{entity_hint}-{_slug(name or source_id or 'unknown')}"
    )
    entity_name = entity.name if entity else str(name or source_id or "Unknown entity")
    observed_at = _observed_at(attrs)

    rows: list[dict[str, Any]] = []
    for key, value in attrs.items():
        metric_value = _metric_value(value)
        if metric_value is None or not _is_metric_field(str(key)):
            continue
        rows.append(
            {
                "observed_at": observed_at,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "entity_name": entity_name,
                "metric_name": _metric_name(str(key)),
                "metric_value": metric_value,
                "unit": _unit_for(str(key)),
                "source": source,
                "source_entity_id": source_id,
                "metadata": {"raw_field": key, "source_contract": "arcgis_featureserver"},
            }
        )
    return rows


def demo_portwatch_rows(now: datetime | None = None) -> list[dict[str, Any]]:
    observed_at = now or datetime.now(UTC) - timedelta(days=1)
    rows: list[dict[str, Any]] = []
    for index, entity in enumerate(PORTWATCH_ENTITIES):
        base = 70 + index * 8
        metrics = {
            "daily_vessel_calls": base,
            "trade_volume_index": 100 - index * 3,
            "traffic_anomaly_index": 8 + index * 4,
        }
        if entity.entity_type != "port":
            metrics["transit_capacity_index"] = 95 - index * 2
        for metric_name, value in metrics.items():
            rows.append(
                {
                    "observed_at": observed_at,
                    "entity_type": entity.entity_type,
                    "entity_id": entity.entity_id,
                    "entity_name": entity.name,
                    "metric_name": metric_name,
                    "metric_value": float(value),
                    "unit": "index" if metric_name.endswith("_index") else "count",
                    "source": "portwatch_demo",
                    "source_entity_id": entity.locode or entity.entity_id,
                    "metadata": {"fallback": True},
                }
            )
    return rows


def _match_entity(name: str | None, source_id: str | None) -> Any | None:
    candidates = [name, source_id]
    for candidate in candidates:
        if not candidate:
            continue
        lowered = _normalize_candidate(candidate)
        if lowered in PORTWATCH_SOURCE_ID_TO_ENTITY:
            return PORTWATCH_SOURCE_ID_TO_ENTITY[lowered]
        for alias, entity in PORTWATCH_ALIAS_TO_ENTITY.items():
            norm_alias = _normalize_candidate(alias)
            if norm_alias in lowered or lowered == norm_alias:
                return entity
    return None


def _normalize_candidate(value: object) -> str:
    return " ".join(str(value).lower().replace("-", " ").split())


def _observed_at(attrs: dict[str, Any]) -> datetime:
    value = _first_value(attrs, ("date", "time", "day", "period", "observed_at", "datetime"))
    if value is None:
        return datetime.now(UTC)
    if isinstance(value, (int, float)) and value > 10_000_000_000:
        return datetime.fromtimestamp(value / 1000, tz=UTC)
    text = str(value).replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return datetime.now(UTC)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _is_metric_field(key: str) -> bool:
    lowered = key.lower()
    ignored = ("id", "name", "date", "time", "objectid", "shape", "country", "region")
    if any(token == lowered or lowered.endswith(token) for token in ignored):
        return False
    allowed = (
        "n_",
        "call",
        "vessel",
        "traffic",
        "trade",
        "import",
        "export",
        "capacity",
        "throughput",
        "volume",
        "transit",
    )
    return any(token in lowered for token in allowed)


def _metric_name(key: str) -> str:
    return key.strip().lower().replace(" ", "_").replace("-", "_")


def _unit_for(key: str) -> str | None:
    lowered = key.lower()
    if "index" in lowered:
        return "index"
    if "value" in lowered or "usd" in lowered:
        return "usd"
    if "capacity" in lowered or "volume" in lowered:
        return "index"
    if "vessel" in lowered or "call" in lowered or "transit" in lowered:
        return "count"
    return None


def _metric_value(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _first_value(attrs: dict[str, Any], keys: tuple[str, ...]) -> Any | None:
    lowered = {str(key).lower(): value for key, value in attrs.items()}
    for key in keys:
        if key.lower() in lowered:
            return lowered[key.lower()]
    return None


def _first_text(attrs: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    value = _first_value(attrs, keys)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _slug(value: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in value.lower()).strip("-")
