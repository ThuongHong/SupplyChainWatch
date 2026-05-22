from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MonitoredEntity:
    entity_id: str
    name: str
    entity_type: str
    region: str
    aliases: tuple[str, ...]
    locode: str | None = None
    lat: float | None = None
    lon: float | None = None


PORTWATCH_ENTITIES: tuple[MonitoredEntity, ...] = (
    MonitoredEntity(
        "port-sgsin",
        "Singapore",
        "port",
        "Southeast Asia",
        ("singapore", "sgsin"),
        "SGSIN",
        1.2644,
        103.82,
    ),
    MonitoredEntity(
        "port-cnsha",
        "Shanghai",
        "port",
        "East Asia",
        ("shanghai", "cnsha"),
        "CNSHA",
        31.2304,
        121.4737,
    ),
    MonitoredEntity(
        "port-nlrtm",
        "Rotterdam",
        "port",
        "Europe",
        ("rotterdam", "nlrtm"),
        "NLRTM",
        51.9244,
        4.4777,
    ),
    MonitoredEntity(
        "port-uslax",
        "Los Angeles",
        "port",
        "North America",
        ("los angeles", "uslax", "long beach", "uslgb"),
        "USLAX",
        33.7405,
        -118.2775,
    ),
    MonitoredEntity("cp-suez", "Suez Canal", "chokepoint", "Middle East", ("suez", "suez canal")),
    MonitoredEntity(
        "cp-panama", "Panama Canal", "chokepoint", "Central America", ("panama", "panama canal")
    ),
    MonitoredEntity(
        "cp-malacca",
        "Strait of Malacca",
        "chokepoint",
        "Southeast Asia",
        ("malacca", "strait of malacca"),
    ),
    MonitoredEntity(
        "region-red-sea",
        "Red Sea",
        "region",
        "Middle East",
        ("red sea", "bab-el-mandeb", "bab el mandeb"),
    ),
    MonitoredEntity("region-black-sea", "Black Sea", "region", "Europe", ("black sea", "bosporus")),
)


PORTWATCH_ALIAS_TO_ENTITY = {
    alias: entity for entity in PORTWATCH_ENTITIES for alias in entity.aliases
}
