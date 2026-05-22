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


class PortWatchFeatureAdapter:
    """ArcGIS FeatureServer adapter for PortWatch-style layers."""

    def __init__(self, collector: BaseCollector[PortWatchMetricRecord]) -> None:
        self.collector = collector

    def fetch_features(self, url: str) -> list[dict[str, Any]]:
        """Fetch a bounded recent sample.

        PortWatch layers contain multi-year archives. Querying `where=1=1`
        page-by-page can take minutes, so collection samples the newest object
        ids and leaves historical backfill to a separate job.
        """
        object_ids = self._recent_object_ids(url)
        if object_ids:
            return self._fetch_object_ids(url, object_ids)
        return self._fetch_first_page(url)

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

    def __init__(self, *, use_demo_fallback: bool = False, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.use_demo_fallback = use_demo_fallback
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
        if rows or not self.use_demo_fallback:
            return rows
        return demo_portwatch_rows()


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
        lowered = str(candidate).strip().lower()
        if lowered in PORTWATCH_ALIAS_TO_ENTITY:
            return PORTWATCH_ALIAS_TO_ENTITY[lowered]
        for alias, entity in PORTWATCH_ALIAS_TO_ENTITY.items():
            if alias in lowered:
                return entity
    return None


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
