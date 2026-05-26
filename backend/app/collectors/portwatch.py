from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from app.collectors.base import BaseCollector, CollectorError
from app.config import get_settings
from app.fixtures.portwatch_entities import PORTWATCH_ALIAS_TO_ENTITY, PORTWATCH_ENTITIES
from app.schemas.records import PortWatchMetricRecord

FEATURE_PAGE_SIZE = 1000
RECENT_FEATURE_SAMPLE_SIZE = 200
OBJECT_ID_BATCH_SIZE = 50

PORTWATCH_TARGET_PORTIDS = (
    "port1201",
    "port1188",
    "port2027",
    "port1114",
    "port664",
    "port824",
    "port1429",
    "port1189",
    "port830",
    "port744",
    "port446",
    "port192",
    "port31",
    "port815",
    "port1170",
)
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
    "port824": PORTWATCH_ENTITY_BY_ID["port-cnngb"],
    "port1429": PORTWATCH_ENTITY_BY_ID["port-cnngb"],
    "port1189": PORTWATCH_ENTITY_BY_ID["port-cnszx"],
    "port830": PORTWATCH_ENTITY_BY_ID["port-krpus"],
    "port744": PORTWATCH_ENTITY_BY_ID["port-aejea"],
    "port446": PORTWATCH_ENTITY_BY_ID["port-deham"],
    "port192": PORTWATCH_ENTITY_BY_ID["port-egpsd"],
    "port31": PORTWATCH_ENTITY_BY_ID["port-esalg"],
    "port815": PORTWATCH_ENTITY_BY_ID["port-usnyc"],
    "port1170": PORTWATCH_ENTITY_BY_ID["port-ussav"],
    "chokepoint1": PORTWATCH_ENTITY_BY_ID["cp-suez"],
    "chokepoint2": PORTWATCH_ENTITY_BY_ID["cp-panama"],
    "chokepoint3": PORTWATCH_ENTITY_BY_ID["region-red-sea"],
    "chokepoint4": PORTWATCH_ENTITY_BY_ID["region-black-sea"],
    "chokepoint5": PORTWATCH_ENTITY_BY_ID["cp-malacca"],
    "chokepoint28": PORTWATCH_ENTITY_BY_ID["region-black-sea"],
}


@dataclass(frozen=True)
class ArcGisLayerMetadata:
    fields: tuple[str, ...]
    object_id_field: str
    max_record_count: int
    supports_pagination: bool
    supports_order_by: bool
    date_fields_time_reference: dict[str, Any] | None

    def field_name(self, candidate: str) -> str:
        """Return the layer's exact field spelling when present."""
        lowered = candidate.lower()
        for field in self.fields:
            if field.lower() == lowered:
                return field
        return candidate


class PortWatchFeatureAdapter:
    """ArcGIS FeatureServer adapter for PortWatch-style layers."""

    def __init__(self, collector: BaseCollector[PortWatchMetricRecord]) -> None:
        self.collector = collector
        self._metadata_by_url: dict[str, ArcGisLayerMetadata] = {}

    def fetch_features(self, url: str) -> list[dict[str, Any]]:
        """Fetch recent data for monitored portwatch entities."""
        if getattr(self.collector, "use_portid_filter", True):
            is_ports = "Daily_Ports_Data" in url or "ports" in url.lower()
            is_chokepoints = "Daily_Chokepoints_Data" in url or "chokepoint" in url.lower()
            if is_ports or is_chokepoints:
                metadata = self._layer_metadata(url)
                ids = PORTWATCH_TARGET_PORTIDS if is_ports else PORTSTRAITWATCH_TARGET_PORTIDS
                history_days = max(1, int(getattr(self.collector, "history_days", 90)))
                since_date = (datetime.now(UTC) - timedelta(days=history_days)).strftime("%Y-%m-%d")
                ids_str = ", ".join(f"'{i}'" for i in ids)
                port_id_field = metadata.field_name("portid")
                date_field = metadata.field_name("date")
                where_clause = f"{port_id_field} IN ({ids_str}) AND {date_field} >= '{since_date}'"
                try:
                    features = self._fetch_filtered_pages(url, where_clause)
                    if features:
                        return features
                except Exception as e:
                    import structlog

                    structlog.get_logger(__name__).warning(
                        "portwatch_bulk_query_failed_falling_back_to_individual",
                        error=str(e),
                        url=url,
                    )
                    features = []
                    for entity_id in ids:
                        individual_clause = (
                            f"{port_id_field} = '{entity_id}' AND {date_field} >= '{since_date}'"
                        )
                        try:
                            port_features = self._fetch_filtered_pages(url, individual_clause)
                            if port_features:
                                features.extend(port_features)
                        except Exception as ind_exc:
                            structlog.get_logger(__name__).warning(
                                "portwatch_individual_query_failed",
                                error=str(ind_exc),
                                entity_id=entity_id,
                            )
                    if features:
                        return features

        # Fallback to the original objectId-based query for backward compatibility and tests
        object_ids = self._recent_object_ids(url)
        if object_ids:
            return self._fetch_object_ids(url, object_ids)
        return self._fetch_first_page(url)

    def _layer_metadata(self, url: str) -> ArcGisLayerMetadata:
        if url in self._metadata_by_url:
            return self._metadata_by_url[url]
        payload = self.collector.request_json("GET", _layer_metadata_url(url), params={"f": "json"})
        if not isinstance(payload, dict):
            raise CollectorError("PortWatch layer metadata response was not a JSON object")
        _raise_arcgis_error(payload)
        fields = tuple(
            str(field["name"])
            for field in payload.get("fields", [])
            if isinstance(field, dict) and field.get("name")
        )
        advanced = payload.get("advancedQueryCapabilities")
        if not isinstance(advanced, dict):
            advanced = {}
        unique_id = payload.get("uniqueIdField")
        if not isinstance(unique_id, dict):
            unique_id = {}
        metadata = ArcGisLayerMetadata(
            fields=fields,
            object_id_field=str(
                payload.get("objectIdField")
                or payload.get("objectIdFieldName")
                or unique_id.get("name")
                or "ObjectId"
            ),
            max_record_count=_positive_int(payload.get("maxRecordCount"), FEATURE_PAGE_SIZE),
            supports_pagination=bool(advanced.get("supportsPagination", True)),
            supports_order_by=bool(advanced.get("supportsOrderBy", True)),
            date_fields_time_reference=(
                payload.get("dateFieldsTimeReference")
                if isinstance(payload.get("dateFieldsTimeReference"), dict)
                else None
            ),
        )
        self._metadata_by_url[url] = metadata
        return metadata

    def _fetch_filtered_pages(self, url: str, where_clause: str) -> list[dict[str, Any]]:
        metadata = self._layer_metadata(url)
        page_size = min(FEATURE_PAGE_SIZE, metadata.max_record_count)
        features: list[dict[str, Any]] = []
        offset = 0
        while True:
            params: dict[str, Any] = {
                "where": where_clause,
                "outFields": "*",
                "f": "json",
                "returnGeometry": "false",
            }
            if metadata.supports_order_by:
                params["orderByFields"] = f"{metadata.object_id_field} ASC"
            if metadata.supports_pagination:
                params["resultOffset"] = offset
                params["resultRecordCount"] = page_size
            payload = self.collector.request_json("GET", url, params=params)
            _raise_arcgis_error(payload)
            page = _payload_features(payload)
            if not page:
                break
            features.extend(page)
            if not metadata.supports_pagination or not isinstance(payload, dict):
                break
            if "exceededTransferLimit" in payload:
                if not payload.get("exceededTransferLimit"):
                    break
            elif len(page) < page_size:
                break
            offset += page_size
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
            _raise_arcgis_error(payload)
            features.extend(_payload_features(payload))
        return features

    def _fetch_first_page(self, url: str) -> list[dict[str, Any]]:
        metadata = self._layer_metadata(url)
        page_size = min(FEATURE_PAGE_SIZE, metadata.max_record_count)
        params: dict[str, Any] = {
            "where": "1=1",
            "outFields": "*",
            "f": "json",
            "returnGeometry": "false",
        }
        if metadata.supports_order_by:
            params["orderByFields"] = f"{metadata.object_id_field} ASC"
        if metadata.supports_pagination:
            params["resultOffset"] = 0
            params["resultRecordCount"] = page_size
        payload = self.collector.request_json(
            "GET",
            url,
            params=params,
        )
        _raise_arcgis_error(payload)
        return _payload_features(payload)


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
            except Exception as e:
                if self.use_demo_fallback or settings.backend_demo_fallback_enabled:
                    import structlog

                    structlog.get_logger(__name__).warning(
                        "portwatch_fetch_failed_using_fallback",
                        error=str(e),
                    )
                    return demo_portwatch_rows()
                raise
            for feature in features:
                rows.extend(normalize_feature(feature, entity_hint=entity_hint, source=source))

        if not rows:
            if self.use_demo_fallback or settings.backend_demo_fallback_enabled:
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


def _layer_metadata_url(query_url: str) -> str:
    trimmed = query_url.rstrip("/")
    if trimmed.lower().endswith("/query"):
        return trimmed.rsplit("/", 1)[0]
    return trimmed


def _positive_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _raise_arcgis_error(payload: Any) -> None:
    if not isinstance(payload, dict) or "error" not in payload:
        return
    error = payload.get("error")
    if isinstance(error, dict):
        message = error.get("message") or error.get("details") or error
    else:
        message = error
    raise CollectorError(f"PortWatch ArcGIS error: {message}")


def _payload_features(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    page = payload.get("features", [])
    if not isinstance(page, list):
        return []
    return [item for item in page if isinstance(item, dict)]


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
    import random

    random.seed(42)
    base_date = now or datetime.now(UTC)
    rows: list[dict[str, Any]] = []

    # Generate 90 days of daily historical records per entity
    for d in range(90):
        observed_at = base_date - timedelta(days=d)
        for index, entity in enumerate(PORTWATCH_ENTITIES):
            base = 70 + index * 8
            # Add variation to simulate realistic trends and z-score standard deviation.
            variation = random.uniform(-4.0, 4.0)

            # Inject spikes on specific days to trigger z-score anomalies >= 2.0 / 3.0.
            if d in (5, 20):
                variation += 25.0  # Anomaly spike

            metrics = {
                "daily_vessel_calls": base + variation,
                "trade_volume_index": max(10.0, 100 - index * 3 - variation * 0.5),
                "traffic_anomaly_index": max(0.0, 8 + index * 4 + variation * 0.2),
            }
            if entity.entity_type != "port":
                metrics["transit_capacity_index"] = max(10.0, 95 - index * 2 - variation * 0.4)

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
