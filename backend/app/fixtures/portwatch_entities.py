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
    MonitoredEntity(
        "port-cnngb",
        "Ningbo-Zhoushan",
        "port",
        "East Asia",
        ("ningbo", "zhoushan", "cnngb"),
        "CNNGB",
        29.8683,
        121.5440,
    ),
    MonitoredEntity(
        "port-cnszx",
        "Shenzhen",
        "port",
        "East Asia",
        ("shenzhen", "cnszx"),
        "CNSZX",
        22.5431,
        114.0579,
    ),
    MonitoredEntity(
        "port-krpus",
        "Busan",
        "port",
        "East Asia",
        ("busan", "pusan", "krpus"),
        "KRPUS",
        35.1796,
        129.0756,
    ),
    MonitoredEntity(
        "port-aejea",
        "Jebel Ali",
        "port",
        "Middle East",
        ("jebel ali", "aejea"),
        "AEJEA",
        25.0118,
        55.0613,
    ),
    MonitoredEntity(
        "port-deham",
        "Hamburg",
        "port",
        "Europe",
        ("hamburg", "deham"),
        "DEHAM",
        53.5511,
        9.9937,
    ),
    MonitoredEntity(
        "port-egpsd",
        "Port Said",
        "port",
        "Mediterranean",
        ("port said", "egpsd"),
        "EGPSD",
        31.25,
        32.30,
    ),
    MonitoredEntity(
        "port-esalg",
        "Algeciras",
        "port",
        "Mediterranean",
        ("algeciras", "esalg"),
        "ESALG",
        36.13,
        -5.45,
    ),
    MonitoredEntity(
        "port-usnyc",
        "New York-New Jersey",
        "port",
        "North America",
        ("new york", "new jersey", "usnyc"),
        "USNYC",
        40.67,
        -74.05,
    ),
    MonitoredEntity(
        "port-ussav",
        "Savannah",
        "port",
        "North America",
        ("savannah", "ussav"),
        "USSAV",
        32.12,
        -81.12,
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
